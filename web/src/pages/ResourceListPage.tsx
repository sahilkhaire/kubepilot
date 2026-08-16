import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { EllipsisVerticalIcon } from 'lucide-react'
import { toast } from 'sonner'
import { deleteK8sResource, type User } from '@/api'
import DeleteConfirm from '@/components/DeleteConfirm'
import EmptyState from '@/components/EmptyState'
import ResourceYAMLSheet from '@/components/resource-yaml-sheet'
import { ErrorAlert } from '@/components/error-alert'
import { ALL_NAMESPACES, isAllNamespaces, NamespaceSelect, resolveNamespaceValue } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { MetricsCell } from '@/components/MetricsPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  podNode,
  podPhase,
  podReady,
  podRestarts,
  pvcStatus,
  pvcStorage,
  replicaReady,
  daemonReady,
  secretType,
  serviceClusterIP,
  serviceType,
  type K8sObject,
} from '@/lib/k8s-fields'
import type { YAMLTarget } from '@/lib/k8s-yaml'

function statusBadge(value: string) {
  const v = value.toLowerCase()
  const ok = v === 'running' || v === 'ready' || v === 'bound' || v === 'active' || v === 'available' || v === 'true'
  const bad = v === 'failed' || v === 'error' || v === 'notready' || v === 'pending' || v === 'crashloopbackoff'
  return (
    <Badge variant={bad ? 'destructive' : ok ? 'outline' : 'secondary'} className="h-5 px-1.5 text-[10px] font-medium">
      {value || '—'}
    </Badge>
  )
}

function ResourceRowMenu({
  name,
  namespace,
  module,
  user,
  busy,
  onYaml,
  onDelete,
}: {
  name: string
  namespace: string
  module: string
  user: User
  busy: boolean
  onYaml: () => void
  onDelete: () => void
}) {
  const showLogs = module === 'pods' && can(user, 'pods', 'logs')
  const showShell = module === 'pods' && can(user, 'pods', 'exec')
  const showDelete = module !== 'endpoints' && can(user, module, 'delete')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${name}`} disabled={busy}>
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
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
        {showDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
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

  const loadItems = useCallback(async () => {
    if (!module || module === 'overview') return
    if (!clusterScoped && !namespace) {
      setItems([])
      return
    }
    setError('')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    }
  }, [module, namespace, clusterScoped])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const visible = useMemo(
    () => items.filter((item) => matchesQuery(item, query)),
    [items, query],
  )

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
      await loadItems()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageBody>
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
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>Name</TableHead>
              {!clusterScoped ? <TableHead>Namespace</TableHead> : null}
              {module === 'pods' ? (
                <>
                  <TableHead>Ready</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Restarts</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>CPU / Memory</TableHead>
                </>
              ) : null}
              {['deployments', 'statefulsets', 'replicasets', 'daemonsets'].includes(module) ? (
                <TableHead>Ready</TableHead>
              ) : null}
              {module === 'jobs' ? <TableHead>Completions</TableHead> : null}
              {module === 'cronjobs' ? <TableHead>Schedule</TableHead> : null}
              {module === 'services' ? (
                <>
                  <TableHead>Type</TableHead>
                  <TableHead>Cluster IP</TableHead>
                </>
              ) : null}
              {module === 'ingresses' ? <TableHead>Class</TableHead> : null}
              {module === 'pvcs' ? (
                <>
                  <TableHead>Status</TableHead>
                  <TableHead>Capacity</TableHead>
                </>
              ) : null}
              {module === 'secrets' ? <TableHead>Type</TableHead> : null}
              {module === 'hpas' ? <TableHead>Replicas</TableHead> : null}
              <TableHead>Age</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => {
              const name = objectName(item)
              if (!name) return null
              const ns = objectNamespace(item) || (isAllNamespaces(namespace) ? '' : namespace)
              return (
                <TableRow key={`${ns}/${name}`}>
                  <TableCell className="font-medium">{name}</TableCell>
                  {!clusterScoped ? (
                    <TableCell className="text-muted-foreground">{ns}</TableCell>
                  ) : null}
                  {module === 'pods' ? (
                    <>
                      <TableCell>{podReady(item)}</TableCell>
                      <TableCell>{statusBadge(podPhase(item))}</TableCell>
                      <TableCell>{podRestarts(item)}</TableCell>
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
                      <TableCell>{statusBadge(pvcStatus(item))}</TableCell>
                      <TableCell>{pvcStorage(item)}</TableCell>
                    </>
                  ) : null}
                  {module === 'secrets' ? <TableCell>{secretType(item)}</TableCell> : null}
                  {module === 'hpas' ? <TableCell>{hpaReplicas(item)}</TableCell> : null}
                  <TableCell className="text-muted-foreground">{formatAge(item.metadata?.creationTimestamp)}</TableCell>
                  <TableCell className="text-right">
                    <ResourceRowMenu
                      name={name}
                      namespace={ns}
                      module={module}
                      user={user}
                      busy={deleting && deleteTarget?.name === name}
                      onYaml={() =>
                        setYamlTarget(
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
        {visible.length === 0 && !error ? (
          <EmptyState>No {kind.label.toLowerCase()}{query ? ' match this filter' : ''}.</EmptyState>
        ) : null}
      </div>
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
    </PageBody>
  )
}
