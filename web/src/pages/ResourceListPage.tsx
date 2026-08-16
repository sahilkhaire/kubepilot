import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { EllipsisVerticalIcon, PencilIcon, ScrollTextIcon, SquareTerminalIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { deleteK8sResource, restartK8sResource, scaleK8sResource, type User } from '@/api'
import DeleteConfirm from '@/components/DeleteConfirm'
import EmptyState from '@/components/EmptyState'
import DeploymentDetailPanel from '@/components/deployment-detail-panel'
import PodDetailPanel from '@/components/pod-detail-panel'
import { PodContainersCell } from '@/components/pod-containers'
import ResourceYAMLSheet from '@/components/resource-yaml-sheet'
import { StatusBadge } from '@/components/status-badge'
import { ScaleDialog } from '@/components/scale-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorAlert } from '@/components/error-alert'
import { ALL_NAMESPACES, isAllNamespaces, NamespaceSelect, resolveNamespaceValue } from '@/components/namespace-select'
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
import { Input } from '@/components/ui/input'
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

function ResourceRowMenu({
  name,
  namespace,
  module,
  user,
  busy,
  onDetails,
  onScale,
  onRestart,
  onLogs,
  onYaml,
  onDelete,
}: {
  name: string
  namespace: string
  module: string
  user: User
  busy: boolean
  onDetails?: () => void
  onScale?: () => void
  onRestart?: () => void
  onLogs?: () => void
  onYaml: () => void
  onDelete: () => void
}) {
  const showLogs = module === 'pods' && can(user, 'pods', 'logs')
  const showShell = module === 'pods' && can(user, 'pods', 'exec')
  const showDelete = module !== 'endpoints' && can(user, module, 'delete')
  const isDeployment = module === 'deployments'
  const isPod = module === 'pods'

  return (
    <DropdownMenu>
      <ActionTooltip label="Actions">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${name}`} disabled={busy}>
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent align="end" className="min-w-40">
        {isDeployment ? (
          <>
            <DropdownMenuItem onClick={onDetails}>Show details</DropdownMenuItem>
            {can(user, 'deployments', 'scale') ? (
              <DropdownMenuItem onClick={onScale}>Scale</DropdownMenuItem>
            ) : null}
            {can(user, 'deployments', 'restart') ? (
              <DropdownMenuItem onClick={onRestart}>Restart</DropdownMenuItem>
            ) : null}
            {can(user, 'pods', 'logs') ? <DropdownMenuItem onClick={onLogs}>Logs</DropdownMenuItem> : null}
            {can(user, 'deployments', 'yaml_edit') ? (
              <DropdownMenuItem onClick={onYaml}>Edit</DropdownMenuItem>
            ) : null}
          </>
        ) : isPod ? (
          <>
            <DropdownMenuItem onClick={onDetails}>Show details</DropdownMenuItem>
            {showShell ? (
              <DropdownMenuItem asChild>
                <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/exec`}>
                  <SquareTerminalIcon />
                  Shell
                </Link>
              </DropdownMenuItem>
            ) : null}
            {showLogs ? (
              <DropdownMenuItem asChild>
                <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/logs`}>
                  <ScrollTextIcon />
                  Logs
                </Link>
              </DropdownMenuItem>
            ) : null}
            {can(user, 'pods', 'yaml_edit') ? (
              <DropdownMenuItem onClick={onYaml}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
            ) : null}
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onYaml}>YAML</DropdownMenuItem>
            {showLogs ? (
              <DropdownMenuItem asChild>
                <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/logs`}>Logs</Link>
              </DropdownMenuItem>
            ) : null}
            {showShell ? (
              <DropdownMenuItem asChild>
                <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/exec`}>Shell</Link>
              </DropdownMenuItem>
            ) : null}
          </>
        )}
        {showDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              {isPod ? <Trash2Icon /> : null}
              Delete
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
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState(ALL_NAMESPACES)
  const [items, setItems] = useState<K8sObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [yamlTarget, setYamlTarget] = useState<YAMLTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; namespace?: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [panelView, setPanelView] = useState<'details' | 'yaml'>('details')
  const [scaleTarget, setScaleTarget] = useState<{ name: string; namespace: string; replicas: number } | null>(null)
  const [restartTarget, setRestartTarget] = useState<{ name: string; namespace: string } | null>(null)
  const [logPods, setLogPods] = useState<{ name: string; namespace: string; phase: string }[] | null>(null)
  const [pendingAction, setPendingAction] = useState(false)
  const navigate = useNavigate()

  const clusterScoped = Boolean(kind?.clusterScoped)
  const module = kind?.module ?? ''
  const user = useUser()
  const grantModule = kind && section ? (grantModuleId(section, kind) ?? kind.module) : ''

  useEffect(() => {
    let cancelled = false
    async function loadNamespaces() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
        if (!res.ok) {
          throw new Error('failed to load namespaces')
        }
        const data: string[] = await res.json()
        if (cancelled) return
        setNamespaces(data)
        if (data.length > 0) {
          setNamespace((prev) => resolveNamespaceValue(prev, data))
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    loadNamespaces()
    return () => {
      cancelled = true
    }
  }, [module])

  const loadItems = useSingleFlight(
    useCallback(async (quiet = false) => {
    if (!module || module === 'overview') return
    if (!clusterScoped && !namespace) {
      setItems([])
      return
    }
    try {
      const nsPath = isAllNamespaces(namespace) ? '_all' : namespace
      const path = clusterScoped
        ? `/api/k8s/${encodeURIComponent(module)}`
        : `/api/k8s/namespaces/${encodeURIComponent(nsPath)}/${encodeURIComponent(module)}`
      const res = await fetch(path, { credentials: 'same-origin' })
      if (res.status === 403 || res.status === 404) {
        setItems([])
        return
      }
      if (!res.ok) {
        throw new Error(`failed to load ${module}`)
      }
      const data: K8sObject[] = await res.json()
      setItems(Array.isArray(data) ? data : [])
      setError('')
    } catch (e) {
      if (!quiet) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    }
  }, [module, namespace, clusterScoped]),
  )

  useEffect(() => {
    void loadItems(false)
  }, [loadItems])
  useLiveRefresh(() => loadItems(true))

  const visible = useMemo(
    () => items.filter((item) => matchesQuery(item, query)),
    [items, query],
  )
  const { sort, sortKey, sortDir, onSort } = useTableSort(module ? `resource:${module}` : undefined)
  const metricsTick = useMetricSortTick()
  const sorted = useMemo(
    () =>
      sortBy(visible, sort, (item, key) =>
        resourceSortValue(item, key, module, isAllNamespaces(namespace) ? '' : namespace),
      ),
    [visible, sort, module, namespace, metricsTick],
  )
  const selected = useMemo(() => {
    if ((module !== 'deployments' && module !== 'pods') || !selectedKey) return null
    return items.find((item) => `${objectNamespace(item)}/${objectName(item)}` === selectedKey) ?? null
  }, [items, module, selectedKey])

  useEffect(() => {
    setSelectedKey(null)
    setPanelView('details')
  }, [module])

  if (!kind || !section) {
    return (
      <PageBody>
        <PageHeader title="Unknown resource" />
      </PageBody>
    )
  }

  if (grantModule && !can(user, grantModule, 'view')) {
    return <Navigate to="/" replace />
  }

  if (loading && namespaces.length === 0) {
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
      setDeleteTarget(null)
      if (yamlTarget?.name === deleteTarget.name) setYamlTarget(null)
      if (selectedKey === `${deleteTarget.namespace}/${deleteTarget.name}`) setSelectedKey(null)
      await loadItems()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setDeleting(false)
    }
  }

  function openDeployment(item: K8sObject, view: 'details' | 'yaml' = 'details') {
    const ns = objectNamespace(item)
    const name = objectName(item)
    setSelectedKey(`${ns}/${name}`)
    setPanelView(view)
  }

  async function openDeploymentLogs(item: K8sObject) {
    const ns = objectNamespace(item)
    const labels = selectorMatchLabels(item)
    try {
      const res = await fetch(`/api/k8s/namespaces/${encodeURIComponent(ns)}/pods`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to list pods')
      const data: K8sObject[] = await res.json()
      const matching = (Array.isArray(data) ? data : []).filter((pod) => podMatchesLabels(pod, labels))
      if (matching.length === 0) {
        toast.error('No pods to show logs from')
        return
      }
      if (matching.length === 1) {
        navigate(`/workloads/${encodeURIComponent(ns)}/pods/${encodeURIComponent(objectName(matching[0]))}/logs`)
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
      toast.error(e instanceof Error ? e.message : 'failed to load pods')
    }
  }

  async function runScale(replicas: number) {
    if (!scaleTarget) return
    setPendingAction(true)
    try {
      await scaleK8sResource('deployments', scaleTarget.name, scaleTarget.namespace, replicas)
      toast.success(`Scaled ${scaleTarget.name} to ${replicas}`)
      setScaleTarget(null)
      await loadItems(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'scale failed')
    } finally {
      setPendingAction(false)
    }
  }

  async function runRestart() {
    if (!restartTarget) return
    setPendingAction(true)
    try {
      await restartK8sResource('deployments', restartTarget.name, restartTarget.namespace)
      toast.success(`Restarted ${restartTarget.name}`)
      setRestartTarget(null)
      await loadItems(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'restart failed')
    } finally {
      setPendingAction(false)
    }
  }

  const split = Boolean(selected)

  return (
    <PageBody className={split ? 'flex-row gap-0 overflow-hidden p-0' : undefined}>
      <div className={split ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'contents'}>
      <PageHeader title={kind.label} description={`${visible.length} item${visible.length === 1 ? '' : 's'}`}>
        {!clusterScoped ? (
          <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
        ) : (
          <Badge variant="outline" className="h-5 text-[10px]">
            cluster
          </Badge>
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="h-7 w-48 text-xs"
        />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
              <SerialHead />
              <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {!clusterScoped ? (
                <SortableHead column="namespace" label="Namespace" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ) : null}
              {module === 'pods' ? (
                <>
                  <SortableHead column="containers" label="Containers" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="restarts" label="Restarts" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="controlledBy" label="Controlled By" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="node" label="Node" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="metrics" label="CPU / Memory" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </>
              ) : null}
              {['deployments', 'statefulsets', 'replicasets', 'daemonsets'].includes(module) ? (
                <SortableHead column="ready" label="Ready" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ) : null}
              {module === 'jobs' ? (
                <SortableHead column="completions" label="Completions" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ) : null}
              {module === 'cronjobs' ? (
                <SortableHead column="schedule" label="Schedule" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ) : null}
              {module === 'services' ? (
                <>
                  <SortableHead column="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="clusterIP" label="Cluster IP" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </>
              ) : null}
              {module === 'ingresses' ? (
                <SortableHead column="class" label="Class" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ) : null}
              {module === 'pvcs' ? (
                <>
                  <SortableHead column="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="capacity" label="Capacity" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </>
              ) : null}
              {module === 'secrets' ? (
                <SortableHead column="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ) : null}
              {module === 'hpas' ? (
                <SortableHead column="replicas" label="Replicas" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ) : null}
              <SortableHead column="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((item, index) => {
              const name = objectName(item)
              if (!name) return null
              const ns = objectNamespace(item) || (isAllNamespaces(namespace) ? '' : namespace)
              const rowKey = `${ns}/${name}`
              const clickable = module === 'deployments' || module === 'pods'
              return (
                <TableRow
                  key={rowKey}
                  data-state={selectedKey === rowKey ? 'selected' : undefined}
                  className={clickable ? 'cursor-pointer' : undefined}
                  onClick={clickable ? () => openDeployment(item) : undefined}
                >
                  <SerialCell index={index} />
                  <TableCell className="font-medium">{name}</TableCell>
                  {!clusterScoped ? (
                    <TableCell className="text-muted-foreground">{ns}</TableCell>
                  ) : null}
                  {module === 'pods' ? (
                    <>
                      <TableCell>
                        <PodContainersCell obj={item} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={podStatus(item)} />
                      </TableCell>
                      <TableCell>{podRestarts(item)}</TableCell>
                      <TableCell className="text-muted-foreground">{podControlledBy(item) || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{podNode(item) || '—'}</TableCell>
                      <TableCell>
                        {can(user, 'metrics', 'view') ? (
                          <MetricsCell scope="pod" namespace={ns} name={name} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </>
                  ) : null}
                  {['deployments', 'statefulsets', 'replicasets'].includes(module) ? (
                    <TableCell>{replicaReady(item)}</TableCell>
                  ) : null}
                  {module === 'daemonsets' ? <TableCell>{daemonReady(item)}</TableCell> : null}
                  {module === 'jobs' ? <TableCell>{jobCompletions(item)}</TableCell> : null}
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
                  {module === 'secrets' ? <TableCell>{secretType(item)}</TableCell> : null}
                  {module === 'hpas' ? <TableCell>{hpaReplicas(item)}</TableCell> : null}
                  <TableCell className="text-muted-foreground">{formatAge(item.metadata?.creationTimestamp)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <ResourceRowMenu
                      name={name}
                      namespace={ns}
                      module={module}
                      user={user}
                      busy={
                        (deleting && deleteTarget?.name === name) ||
                        (pendingAction && (scaleTarget?.name === name || restartTarget?.name === name))
                      }
                      onDetails={() => openDeployment(item)}
                      onScale={() => setScaleTarget({ name, namespace: ns, replicas: replicaDesired(item) })}
                      onRestart={() => setRestartTarget({ name, namespace: ns })}
                      onLogs={() => void openDeploymentLogs(item)}
                      onYaml={() =>
                        module === 'deployments' || module === 'pods'
                          ? openDeployment(item, 'yaml')
                          : setYamlTarget(
                              clusterScoped
                                ? { module, name, clusterScoped: true }
                                : { module, name, namespace: ns, clusterScoped: false },
                            )
                      }
                      onDelete={() => setDeleteTarget({ name, namespace: clusterScoped ? undefined : ns })}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {sorted.length === 0 && !error ? (
          <EmptyState>No {kind.label.toLowerCase()}{query ? ' match this filter' : ''}.</EmptyState>
        ) : null}
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
          onRestart={() =>
            setRestartTarget({ name: objectName(selected), namespace: objectNamespace(selected) })
          }
          onDelete={() =>
            setDeleteTarget({ name: objectName(selected), namespace: objectNamespace(selected) })
          }
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
          onDelete={() =>
            setDeleteTarget({ name: objectName(selected), namespace: objectNamespace(selected) })
          }
          onRefreshed={(next) => {
            const nextKey = `${objectNamespace(next)}/${objectName(next)}`
            setItems((prev) => prev.map((item) => (`${objectNamespace(item)}/${objectName(item)}` === nextKey ? next : item)))
          }}
        />
      ) : null}
      <ResourceYAMLSheet
        target={yamlTarget}
        canEdit={can(user, grantModule, 'yaml_edit')}
        canDelete={can(user, grantModule, 'delete')}
        onOpenChange={(open) => {
          if (!open) setYamlTarget(null)
        }}
        onDeleted={() => {
          setItems((prev) => prev.filter((item) => objectName(item) !== yamlTarget?.name))
        }}
      />
      {deleteTarget ? (
        <DeleteConfirm
          resourceName={deleteTarget.name}
          resourceLabel={kind.label}
          pending={deleting}
          onConfirm={() => runDelete()}
          onCancel={() => !deleting && setDeleteTarget(null)}
        />
      ) : null}
      <ScaleDialog
        open={scaleTarget != null}
        name={scaleTarget?.name ?? ''}
        current={scaleTarget?.replicas ?? 0}
        pending={pendingAction}
        onConfirm={runScale}
        onCancel={() => !pendingAction && setScaleTarget(null)}
      />
      <ConfirmDialog
        open={restartTarget != null}
        title={`Restart ${restartTarget?.name ?? ''}?`}
        description="This rolls out a new replica set by annotating the pod template. Running pods will be replaced."
        confirmLabel="Restart"
        pending={pendingAction}
        onConfirm={runRestart}
        onCancel={() => !pendingAction && setRestartTarget(null)}
      />
      <Dialog open={logPods != null} onOpenChange={(open) => !open && setLogPods(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Logs</DialogTitle>
            <DialogDescription>Select a pod to stream logs.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            {logPods?.map((pod) => (
              <Button
                key={`${pod.namespace}/${pod.name}`}
                variant="ghost"
                className="justify-between"
                onClick={() =>
                  navigate(`/workloads/${encodeURIComponent(pod.namespace)}/pods/${encodeURIComponent(pod.name)}/logs`)
                }
              >
                <span className="font-medium">{pod.name}</span>
                <span className="text-muted-foreground">{pod.phase}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PageBody>
  )
}
