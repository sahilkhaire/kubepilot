import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  EllipsisVerticalIcon,
  FileCodeIcon,
  HistoryIcon,
  InfoIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  ScalingIcon,
  ScrollTextIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteK8sResource,
  getJSON,
  readAPIError,
  restartK8sResource,
  scaleK8sResource,
  triggerCronJob,
  type User,
} from '@/api'
import DeleteConfirm from '@/components/DeleteConfirm'
import EmptyState from '@/components/EmptyState'
import DeploymentDetailPanel from '@/components/deployment-detail-panel'
import PodDetailPanel, { type PodPanelView } from '@/components/pod-detail-panel'
import { PodContainersCell } from '@/components/pod-containers'
import ResourceYAMLSheet from '@/components/resource-yaml-sheet'
import { RollbackDialog, deploymentRevision } from '@/components/rollback-dialog'
import { StatusBadge } from '@/components/status-badge'
import { ScaleDialog } from '@/components/scale-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorAlert } from '@/components/error-alert'
import { FilterInput, isAllNamespaces, NamespaceSelect, useNamespaces } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { MetricsCell, metricSortValue, useMetricSortTick } from '@/components/MetricsPanel'
import { SortableHead } from '@/components/sortable-head'
import { Badge } from '@/components/ui/badge'
import { ActionTooltip } from '@/components/icon-action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SerialHead,
  SerialCell,
} from '@/components/ui/table'
import { catalog, findKind, grantModuleId } from '@/lib/catalog'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import {
  cronSchedule,
  formatAge,
  hpaReplicas,
  ingressClass,
  jobCompletions,
  matchesQuery,
  objectName,
  objectNamespace,
  podContainerCounts,
  podControlledBy,
  podNode,
  podReady,
  podRestarts,
  podStatus,
  pvcStatus,
  pvcStorage,
  replicaReady,
  replicaDesired,
  daemonReady,
  secretType,
  serviceClusterIP,
  serviceType,
  k8sQuantityNumber,
  podMatchesLabels,
  selectorMatchLabels,
  type K8sObject,
} from '@/lib/k8s-fields'
import { ratioSortValue, sortBy, timestampSortValue, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
import type { YAMLTarget } from '@/lib/k8s-yaml'

/** Workload kinds that support each server-side action. */
const SCALABLE = new Set(['deployments', 'statefulsets', 'replicasets'])
const RESTARTABLE = new Set(['deployments', 'statefulsets', 'daemonsets'])
const HAS_PANEL = new Set(['deployments', 'pods'])
const HAS_READY = new Set(['deployments', 'statefulsets', 'replicasets', 'daemonsets'])

const singular: Record<string, string> = {
  deployments: 'deployment',
  statefulsets: 'stateful set',
  replicasets: 'replica set',
  daemonsets: 'daemon set',
  cronjobs: 'cron job',
}

type Target = { name: string; namespace: string }

function resourceSortValue(item: K8sObject, key: string, module: string, fallbackNs: string): unknown {
  const name = objectName(item)
  const ns = objectNamespace(item) || fallbackNs
  switch (key) {
    case 'name':
      return name
    case 'namespace':
      return ns
    case 'ready':
      if (module === 'pods') return ratioSortValue(podReady(item))
      if (module === 'daemonsets') return ratioSortValue(daemonReady(item))
      return ratioSortValue(replicaReady(item))
    case 'containers': {
      const counts = podContainerCounts(item)
      return counts.live + counts.total / 100
    }
    case 'controlledBy':
      return podControlledBy(item)
    case 'status':
      return module === 'pvcs' ? pvcStatus(item) : podStatus(item)
    case 'restarts':
      return podRestarts(item)
    case 'node':
      return podNode(item)
    case 'metrics':
      return metricSortValue(`pod:${ns}/${name}`) ?? Number.NEGATIVE_INFINITY
    case 'completions':
      return ratioSortValue(jobCompletions(item))
    case 'schedule':
      return cronSchedule(item)
    case 'type':
      return module === 'secrets' ? secretType(item) : serviceType(item)
    case 'clusterIP':
      return serviceClusterIP(item)
    case 'class':
      return ingressClass(item)
    case 'capacity':
      return k8sQuantityNumber(pvcStorage(item))
    case 'replicas':
      return hpaReplicas(item)
    case 'age':
      return timestampSortValue(item.metadata?.creationTimestamp)
    default:
      return ''
  }
}

function podPath(namespace: string, name: string, view: 'logs' | 'exec'): string {
  return `/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/${view}`
}

function ResourceRowMenu({
  name,
  module,
  user,
  busy,
  onDetails,
  onScale,
  onRestart,
  onRollback,
  onTrigger,
  onLogs,
  onShell,
  onEdit,
  onYaml,
  onDelete,
}: {
  name: string
  module: string
  user: User
  busy: boolean
  onDetails: () => void
  onScale: () => void
  onRestart: () => void
  onRollback: () => void
  onTrigger: () => void
  onLogs: () => void
  onShell: () => void
  onEdit: () => void
  onYaml: () => void
  onDelete: () => void
}) {
  const isPod = module === 'pods'
  const showLogs = (isPod || module === 'deployments') && can(user, 'pods', 'logs')
  const showShell = isPod && can(user, 'pods', 'exec')
  const showScale = SCALABLE.has(module) && can(user, module, 'scale')
  const showRestart = RESTARTABLE.has(module) && can(user, module, 'restart')
  const showRollback = module === 'deployments' && can(user, module, 'rollback')
  const showTrigger = module === 'cronjobs' && can(user, module, 'trigger')
  const showEdit = HAS_PANEL.has(module) && can(user, module, 'yaml_edit')
  const showDelete = module !== 'endpoints' && can(user, module, 'delete')
  const hasActions = showScale || showRestart || showRollback || showTrigger

  return (
    <DropdownMenu>
      <ActionTooltip label="Actions">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${name}`} disabled={busy}>
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent align="end" className="min-w-44">
        {HAS_PANEL.has(module) ? (
          <DropdownMenuItem onSelect={onDetails}>
            <InfoIcon />
            Details
          </DropdownMenuItem>
        ) : null}
        {showLogs ? (
          <DropdownMenuItem onSelect={onLogs}>
            <ScrollTextIcon />
            Logs
          </DropdownMenuItem>
        ) : null}
        {showShell ? (
          <DropdownMenuItem onSelect={onShell}>
            <SquareTerminalIcon />
            Shell
          </DropdownMenuItem>
        ) : null}
        {hasActions ? <DropdownMenuSeparator /> : null}
        {showScale ? (
          <DropdownMenuItem onSelect={onScale}>
            <ScalingIcon />
            Scale…
          </DropdownMenuItem>
        ) : null}
        {showRestart ? (
          <DropdownMenuItem onSelect={onRestart}>
            <RotateCcwIcon />
            Restart…
          </DropdownMenuItem>
        ) : null}
        {showRollback ? (
          <DropdownMenuItem onSelect={onRollback}>
            <HistoryIcon />
            Roll back…
          </DropdownMenuItem>
        ) : null}
        {showTrigger ? (
          <DropdownMenuItem onSelect={onTrigger}>
            <PlayIcon />
            Run now…
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {showEdit ? (
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon />
            Edit env
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onYaml}>
          <FileCodeIcon />
          {can(user, module, 'yaml_edit') && module !== 'pods' ? 'Edit YAML' : 'View YAML'}
        </DropdownMenuItem>
        {showDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon />
              Delete…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function ResourceListPage({
  group,
}: {
  group: 'workloads' | 'config' | 'network' | 'storage' | 'access'
}) {
  const { resource } = useParams<{ resource: string }>()
  const kind = findKind(group, resource ?? '')
  const section = catalog.find((s) => s.id === group)
  const { namespaces, namespace, setNamespace, ready: namespacesReady, error: namespacesError } = useNamespaces()
  const [items, setItems] = useState<K8sObject[]>([])
  const [itemsLoaded, setItemsLoaded] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [yamlTarget, setYamlTarget] = useState<YAMLTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; namespace?: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [panelView, setPanelView] = useState<PodPanelView>('details')
  const [scaleTarget, setScaleTarget] = useState<(Target & { replicas: number }) | null>(null)
  const [restartTarget, setRestartTarget] = useState<Target | null>(null)
  const [triggerTarget, setTriggerTarget] = useState<Target | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<(Target & { revision: number }) | null>(null)
  const [logPods, setLogPods] = useState<{ name: string; namespace: string; phase: string }[] | null>(null)
  const [pendingAction, setPendingAction] = useState(false)
  const navigate = useNavigate()

  const clusterScoped = Boolean(kind?.clusterScoped)
  const module = kind?.module ?? ''
  const user = useUser()
  const grantModule = kind && section ? (grantModuleId(section, kind) ?? kind.module) : ''
  const kindLabel = singular[module] ?? kind?.label.toLowerCase() ?? 'resource'

  // Identifies the list currently on screen; responses for an older module/namespace are dropped.
  const listKey = clusterScoped ? module : `${module}@${namespace}`
  const listKeyRef = useRef(listKey)
  listKeyRef.current = listKey

  useEffect(() => {
    setItems([])
    setItemsLoaded(false)
    setError('')
  }, [listKey])

  const loadItems = useSingleFlight(
    useCallback(
      async (quiet = false) => {
        if (!module || module === 'overview') return
        if (!clusterScoped && !namespacesReady) return
        const requestKey = listKey
        try {
          const nsPath = isAllNamespaces(namespace) ? '_all' : namespace
          const path = clusterScoped
            ? `/api/k8s/${encodeURIComponent(module)}`
            : `/api/k8s/namespaces/${encodeURIComponent(nsPath)}/${encodeURIComponent(module)}`
          const res = await fetch(path, { credentials: 'same-origin' })
          if (listKeyRef.current !== requestKey) return
          if (res.status === 403 || res.status === 404) {
            setItems([])
            return
          }
          if (!res.ok) {
            throw new Error(await readAPIError(res, `Failed to load ${kind?.label.toLowerCase() ?? module}`))
          }
          const data: K8sObject[] = await res.json()
          if (listKeyRef.current !== requestKey) return
          setItems(Array.isArray(data) ? data : [])
          setError('')
        } catch (e) {
          if (!quiet && listKeyRef.current === requestKey) {
            setError(e instanceof Error ? e.message : 'Load failed')
          }
        } finally {
          if (listKeyRef.current === requestKey) setItemsLoaded(true)
        }
      },
      [module, namespace, clusterScoped, namespacesReady, listKey, kind?.label],
    ),
  )

  useEffect(() => {
    void loadItems(false)
  }, [loadItems])
  useLiveRefresh(() => loadItems(true))

  const visible = useMemo(() => items.filter((item) => matchesQuery(item, query)), [items, query])
  const { sort, sortKey, sortDir, onSort } = useTableSort(module ? `resource:${module}` : undefined)
  const metricsTick = useMetricSortTick()
  const sorted = useMemo(
    () =>
      sortBy(visible, sort, (item, key) =>
        resourceSortValue(item, key, module, isAllNamespaces(namespace) ? '' : namespace),
      ),
    // metricsTick re-sorts when pod metrics arrive.
    [visible, sort, module, namespace, metricsTick],
  )
  const selected = useMemo(() => {
    if (!HAS_PANEL.has(module) || !selectedKey) return null
    return items.find((item) => `${objectNamespace(item)}/${objectName(item)}` === selectedKey) ?? null
  }, [items, module, selectedKey])

  useEffect(() => {
    setSelectedKey(null)
    setPanelView('details')
    setQuery('')
  }, [module])

  if (!kind || !section) {
    return (
      <PageBody>
        <PageHeader title="Unknown resource" />
        <EmptyState>This page does not exist.</EmptyState>
      </PageBody>
    )
  }

  if (grantModule && !can(user, grantModule, 'view')) {
    return <Navigate to="/" replace />
  }

  if (!clusterScoped && !namespacesReady) {
    return <PageLoading />
  }

  async function runDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteK8sResource(module, deleteTarget.name, {
        namespace: clusterScoped ? undefined : deleteTarget.namespace,
        clusterScoped,
      })
      toast.success(`Deleted ${deleteTarget.name}`)
      const deletedKey = `${deleteTarget.namespace ?? ''}/${deleteTarget.name}`
      setDeleteTarget(null)
      if (yamlTarget?.name === deleteTarget.name && yamlTarget?.namespace === deleteTarget.namespace) setYamlTarget(null)
      if (selectedKey === deletedKey) setSelectedKey(null)
      await loadItems(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  function openPanel(item: K8sObject, view: PodPanelView = 'details') {
    setSelectedKey(`${objectNamespace(item)}/${objectName(item)}`)
    setPanelView(view)
  }

  function openYaml(item: K8sObject) {
    const name = objectName(item)
    if (HAS_PANEL.has(module)) {
      openPanel(item, 'yaml')
      return
    }
    setYamlTarget(
      clusterScoped
        ? { module, name, clusterScoped: true }
        : { module, name, namespace: objectNamespace(item), clusterScoped: false },
    )
  }

  async function openDeploymentLogs(item: K8sObject) {
    const ns = objectNamespace(item)
    const labels = selectorMatchLabels(item)
    try {
      const data = await getJSON<K8sObject[]>(`/api/k8s/namespaces/${encodeURIComponent(ns)}/pods`, 'Failed to list pods')
      const matching = (Array.isArray(data) ? data : []).filter((pod) => podMatchesLabels(pod, labels))
      if (matching.length === 0) {
        toast.error(`${objectName(item)} has no pods to show logs from`)
        return
      }
      if (matching.length === 1) {
        navigate(podPath(ns, objectName(matching[0]), 'logs'))
        return
      }
      setLogPods(
        matching.map((pod) => ({
          name: objectName(pod),
          namespace: objectNamespace(pod) || ns,
          phase: podStatus(pod),
        })),
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load pods')
    }
  }

  async function runAction(label: string, action: () => Promise<void>, done: () => void) {
    setPendingAction(true)
    try {
      await action()
      toast.success(label)
      done()
      await loadItems(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setPendingAction(false)
    }
  }

  function runScale(replicas: number) {
    if (!scaleTarget) return
    const target = scaleTarget
    return runAction(
      `Scaling ${target.name} to ${replicas}`,
      () => scaleK8sResource(module, target.name, target.namespace, replicas),
      () => setScaleTarget(null),
    )
  }

  function runRestart() {
    if (!restartTarget) return
    const target = restartTarget
    return runAction(
      `Restarting ${target.name}`,
      () => restartK8sResource(module, target.name, target.namespace),
      () => setRestartTarget(null),
    )
  }

  function runTrigger() {
    if (!triggerTarget) return
    const target = triggerTarget
    return runAction(
      `Started a job from ${target.name}`,
      () => triggerCronJob(target.namespace, target.name),
      () => setTriggerTarget(null),
    )
  }

  const split = Boolean(selected)
  const showNamespaceColumn = !clusterScoped && isAllNamespaces(namespace)
  const sortHead = (column: string, label: string, align?: 'right') => (
    <SortableHead column={column} label={label} sortKey={sortKey} sortDir={sortDir} onSort={onSort} align={align} />
  )
  const errorMessage = error || namespacesError

  return (
    <PageBody className={split ? 'relative flex-row gap-0 overflow-hidden p-0' : undefined}>
      <div className={split ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'contents'}>
        <PageHeader
          title={kind.label}
          description={itemsLoaded ? `${visible.length}${query ? ` of ${items.length}` : ''} item${visible.length === 1 ? '' : 's'}` : undefined}
        >
          {!clusterScoped ? (
            <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
          ) : (
            <Badge variant="outline" className="h-5 text-[11px] text-muted-foreground">
              Cluster-scoped
            </Badge>
          )}
          <FilterInput value={query} onChange={setQuery} placeholder="Filter by name or label…" />
        </PageHeader>
        <ErrorAlert message={errorMessage} />
        <div className="min-h-0 flex-1 overflow-auto">
          {!itemsLoaded ? (
            <div className="p-3">
              <PageLoading compact />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <SerialHead />
                    {sortHead('name', 'Name')}
                    {showNamespaceColumn ? sortHead('namespace', 'Namespace') : null}
                    {module === 'pods' ? (
                      <>
                        {sortHead('containers', 'Containers')}
                        {sortHead('status', 'Status')}
                        {sortHead('restarts', 'Restarts', 'right')}
                        {sortHead('controlledBy', 'Controlled by')}
                        {sortHead('node', 'Node')}
                        {sortHead('metrics', 'CPU / Memory')}
                      </>
                    ) : null}
                    {HAS_READY.has(module) ? sortHead('ready', 'Ready') : null}
                    {module === 'jobs' ? sortHead('completions', 'Completions') : null}
                    {module === 'cronjobs' ? sortHead('schedule', 'Schedule') : null}
                    {module === 'services' ? (
                      <>
                        {sortHead('type', 'Type')}
                        {sortHead('clusterIP', 'Cluster IP')}
                      </>
                    ) : null}
                    {module === 'ingresses' ? sortHead('class', 'Class') : null}
                    {module === 'pvcs' ? (
                      <>
                        {sortHead('status', 'Status')}
                        {sortHead('capacity', 'Capacity')}
                      </>
                    ) : null}
                    {module === 'secrets' ? sortHead('type', 'Type') : null}
                    {module === 'hpas' ? sortHead('replicas', 'Replicas') : null}
                    {sortHead('age', 'Age')}
                    <TableHead className="w-8">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((item, index) => {
                    const name = objectName(item)
                    if (!name) return null
                    const ns = objectNamespace(item) || (isAllNamespaces(namespace) ? '' : namespace)
                    const rowKey = `${ns}/${name}`
                    const terminating = Boolean(item.metadata?.deletionTimestamp)
                    return (
                      <TableRow
                        key={rowKey}
                        data-state={selectedKey === rowKey ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => (HAS_PANEL.has(module) ? openPanel(item) : openYaml(item))}
                      >
                        <SerialCell index={index} />
                        <TableCell className="max-w-80 truncate font-medium" title={name}>
                          {name}
                        </TableCell>
                        {showNamespaceColumn ? <TableCell className="text-muted-foreground">{ns}</TableCell> : null}
                        {module === 'pods' ? (
                          <>
                            <TableCell>
                              <PodContainersCell obj={item} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge value={terminating ? 'Terminating' : podStatus(item)} />
                            </TableCell>
                            <TableCell
                              className={
                                podRestarts(item) > 0 ? 'text-right text-warning tabular-nums' : 'text-right tabular-nums'
                              }
                            >
                              {podRestarts(item)}
                            </TableCell>
                            <TableCell className="max-w-56 truncate text-muted-foreground">
                              {podControlledBy(item) || '—'}
                            </TableCell>
                            <TableCell className="max-w-48 truncate text-muted-foreground">{podNode(item) || '—'}</TableCell>
                            <TableCell>
                              {can(user, 'metrics', 'view') ? <MetricsCell scope="pod" namespace={ns} name={name} /> : '—'}
                            </TableCell>
                          </>
                        ) : null}
                        {HAS_READY.has(module) ? (
                          <TableCell className="tabular-nums">
                            {module === 'daemonsets' ? daemonReady(item) : replicaReady(item)}
                          </TableCell>
                        ) : null}
                        {module === 'jobs' ? <TableCell className="tabular-nums">{jobCompletions(item)}</TableCell> : null}
                        {module === 'cronjobs' ? <TableCell className="font-mono">{cronSchedule(item)}</TableCell> : null}
                        {module === 'services' ? (
                          <>
                            <TableCell>{serviceType(item)}</TableCell>
                            <TableCell className="font-mono">{serviceClusterIP(item)}</TableCell>
                          </>
                        ) : null}
                        {module === 'ingresses' ? <TableCell>{ingressClass(item)}</TableCell> : null}
                        {module === 'pvcs' ? (
                          <>
                            <TableCell>
                              <StatusBadge value={pvcStatus(item)} />
                            </TableCell>
                            <TableCell>{pvcStorage(item)}</TableCell>
                          </>
                        ) : null}
                        {module === 'secrets' ? <TableCell className="text-muted-foreground">{secretType(item)}</TableCell> : null}
                        {module === 'hpas' ? <TableCell>{hpaReplicas(item)}</TableCell> : null}
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatAge(item.metadata?.creationTimestamp)}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <ResourceRowMenu
                            name={name}
                            module={module}
                            user={user}
                            busy={deleting && deleteTarget?.name === name}
                            onDetails={() => openPanel(item)}
                            onScale={() => setScaleTarget({ name, namespace: ns, replicas: replicaDesired(item) })}
                            onRestart={() => setRestartTarget({ name, namespace: ns })}
                            onRollback={() => setRollbackTarget({ name, namespace: ns, revision: deploymentRevision(item) })}
                            onTrigger={() => setTriggerTarget({ name, namespace: ns })}
                            onLogs={() =>
                              module === 'pods' ? navigate(podPath(ns, name, 'logs')) : void openDeploymentLogs(item)
                            }
                            onShell={() => navigate(podPath(ns, name, 'exec'))}
                            onEdit={() => openPanel(item, 'edit')}
                            onYaml={() => openYaml(item)}
                            onDelete={() => setDeleteTarget({ name, namespace: clusterScoped ? undefined : ns })}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {sorted.length === 0 && !errorMessage ? (
                <EmptyState>
                  {query
                    ? `No ${kind.label.toLowerCase()} match “${query}”.`
                    : clusterScoped || isAllNamespaces(namespace)
                      ? `No ${kind.label.toLowerCase()} found.`
                      : `No ${kind.label.toLowerCase()} in ${namespace}.`}
                </EmptyState>
              ) : null}
            </>
          )}
        </div>
      </div>
      {selected && module === 'deployments' ? (
        <DeploymentDetailPanel
          deployment={selected}
          user={user}
          view={panelView}
          onViewChange={setPanelView}
          onClose={() => setSelectedKey(null)}
          onScale={() =>
            setScaleTarget({
              name: objectName(selected),
              namespace: objectNamespace(selected),
              replicas: replicaDesired(selected),
            })
          }
          onRestart={() => setRestartTarget({ name: objectName(selected), namespace: objectNamespace(selected) })}
          onRollback={() =>
            setRollbackTarget({
              name: objectName(selected),
              namespace: objectNamespace(selected),
              revision: deploymentRevision(selected),
            })
          }
          onDelete={() => setDeleteTarget({ name: objectName(selected), namespace: objectNamespace(selected) })}
          onLogs={() => void openDeploymentLogs(selected)}
          onRefreshed={(next) => {
            const nextKey = `${objectNamespace(next)}/${objectName(next)}`
            setItems((prev) => prev.map((item) => (`${objectNamespace(item)}/${objectName(item)}` === nextKey ? next : item)))
          }}
        />
      ) : null}
      {selected && module === 'pods' ? (
        <PodDetailPanel
          pod={selected}
          user={user}
          view={panelView}
          onViewChange={setPanelView}
          onClose={() => setSelectedKey(null)}
          onDelete={() => setDeleteTarget({ name: objectName(selected), namespace: objectNamespace(selected) })}
          onRefreshed={(next) => {
            const nextKey = `${objectNamespace(next)}/${objectName(next)}`
            setItems((prev) => prev.map((item) => (`${objectNamespace(item)}/${objectName(item)}` === nextKey ? next : item)))
          }}
        />
      ) : null}
      <ResourceYAMLSheet
        target={yamlTarget}
        canEdit={can(user, grantModule, 'yaml_edit')}
        canDelete={can(user, grantModule, 'delete') && module !== 'endpoints'}
        onOpenChange={(open) => {
          if (!open) setYamlTarget(null)
        }}
        onDeleted={() => {
          const target = yamlTarget
          if (!target) return
          setItems((prev) =>
            prev.filter(
              (item) =>
                !(objectName(item) === target.name && (clusterScoped || objectNamespace(item) === target.namespace)),
            ),
          )
        }}
      />
      {deleteTarget ? (
        <DeleteConfirm
          resourceName={deleteTarget.name}
          resourceLabel={kindLabel}
          pending={deleting}
          onConfirm={() => runDelete()}
          onCancel={() => !deleting && setDeleteTarget(null)}
        />
      ) : null}
      <ScaleDialog
        open={scaleTarget != null}
        name={scaleTarget?.name ?? ''}
        kindLabel={kindLabel}
        current={scaleTarget?.replicas ?? 0}
        pending={pendingAction}
        onConfirm={runScale}
        onCancel={() => !pendingAction && setScaleTarget(null)}
      />
      <ConfirmDialog
        open={restartTarget != null}
        title={`Restart ${restartTarget?.name ?? ''}?`}
        description="Pods are replaced one by one using the workload's rollout strategy. Running pods will be terminated."
        confirmLabel="Restart"
        pendingLabel="Restarting…"
        pending={pendingAction}
        onConfirm={runRestart}
        onCancel={() => !pendingAction && setRestartTarget(null)}
      />
      <ConfirmDialog
        open={triggerTarget != null}
        title={`Run ${triggerTarget?.name ?? ''} now?`}
        description="Creates a one-off job from this cron job's template. The schedule is not changed."
        confirmLabel="Run job"
        pendingLabel="Starting…"
        pending={pendingAction}
        onConfirm={runTrigger}
        onCancel={() => !pendingAction && setTriggerTarget(null)}
      />
      <RollbackDialog
        deployment={rollbackTarget}
        onClose={() => setRollbackTarget(null)}
        onDone={() => void loadItems(true)}
      />
      <Dialog open={logPods != null} onOpenChange={(open) => !open && setLogPods(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a pod</DialogTitle>
            <DialogDescription>This deployment runs {logPods?.length ?? 0} pods. Pick one to stream logs from.</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 grid max-h-80 gap-0.5 overflow-y-auto">
            {logPods?.map((pod) => (
              <Button
                key={`${pod.namespace}/${pod.name}`}
                variant="ghost"
                className="h-auto justify-between gap-3 py-1.5"
                onClick={() => navigate(podPath(pod.namespace, pod.name, 'logs'))}
              >
                <span className="truncate font-mono text-xs">{pod.name}</span>
                <StatusBadge value={pod.phase} />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PageBody>
  )
}
