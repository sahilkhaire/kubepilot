import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { NamespaceSelect } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { MetricsCell } from '@/components/MetricsPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { catalog, findKind } from '@/lib/catalog'
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

export default function ResourceListPage({
  group,
}: {
  group: 'workloads' | 'config' | 'network' | 'storage' | 'access'
}) {
  const { resource } = useParams<{ resource: string }>()
  const kind = findKind(group, resource ?? '')
  const section = catalog.find((s) => s.id === group)
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
  const [items, setItems] = useState<K8sObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const clusterScoped = Boolean(kind?.clusterScoped)
  const module = kind?.module ?? ''

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
          setNamespace((prev) => (prev && data.includes(prev) ? prev : data[0]))
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

  useEffect(() => {
    if (!module || module === 'overview') return
    if (!clusterScoped && !namespace) {
      setItems([])
      return
    }
    let cancelled = false
    async function load() {
      setError('')
      try {
        const path = clusterScoped
          ? `/api/k8s/${encodeURIComponent(module)}`
          : `/api/k8s/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(module)}`
        const res = await fetch(path, { credentials: 'same-origin' })
        if (res.status === 403 || res.status === 404) {
          if (!cancelled) setItems([])
          return
        }
        if (!res.ok) {
          throw new Error(`failed to load ${module}`)
        }
        const data: K8sObject[] = await res.json()
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [module, namespace, clusterScoped])

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

  if (loading && namespaces.length === 0) {
    return <PageLoading />
  }

  const yamlPath = (item: K8sObject) => {
    const name = objectName(item)
    if (clusterScoped) {
      return `${section.basePath}/cluster/${encodeURIComponent(module)}/${encodeURIComponent(name)}/yaml`
    }
    return `${section.basePath}/${encodeURIComponent(namespace)}/${encodeURIComponent(module)}/${encodeURIComponent(name)}/yaml`
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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((item) => {
              const name = objectName(item)
              if (!name) return null
              const ns = objectNamespace(item) || namespace
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
                        <MetricsCell scope="pod" namespace={ns} name={name} />
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
                    <div className="flex justify-end gap-0.5">
                      {module === 'pods' ? (
                        <>
                          <Button variant="ghost" size="xs" asChild>
                            <Link to={`/workloads/${encodeURIComponent(ns)}/pods/${encodeURIComponent(name)}/logs`}>
                              Logs
                            </Link>
                          </Button>
                          <Button variant="ghost" size="xs" asChild>
                            <Link to={`/workloads/${encodeURIComponent(ns)}/pods/${encodeURIComponent(name)}/exec`}>
                              Exec
                            </Link>
                          </Button>
                        </>
                      ) : null}
                      <Button variant="ghost" size="xs" asChild>
                        <Link to={yamlPath(item)}>YAML</Link>
                      </Button>
                    </div>
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
    </PageBody>
  )
}
