import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDownIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ScalingIcon,
  ScrollTextIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import type { User } from '@/api'
import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import { IconActionButton } from '@/components/icon-action-button'
import { PodContainersCell } from '@/components/pod-containers'
import { statusTextClass } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
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
import { SortableHead } from '@/components/sortable-head'
import { can } from '@/lib/grants'
import { useLiveRefresh } from '@/hooks/use-live-refresh'
import {
  formatAge,
  objectAnnotations,
  objectConditions,
  objectLabels,
  objectName,
  objectNamespace,
  podMatchesLabels,
  podReady,
  podStatus,
  replicaDesired,
  replicaStatusCounts,
  selectorMatchLabels,
  workloadStrategy,
  type K8sObject,
} from '@/lib/k8s-fields'
import { ratioSortValue, sortBy, useTableSort } from '@/lib/table-sort'

type EventItem = {
  metadata?: { name?: string; namespace?: string; creationTimestamp?: string }
  reason?: string
  message?: string
  type?: string
  lastTimestamp?: string
  eventTime?: string
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </div>
  )
}

function MetaList({ title, entries }: { title: string; entries: Record<string, string> }) {
  const keys = Object.keys(entries)
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDownIcon className="size-3.5" />
        {title} ({keys.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        {keys.length === 0 ? (
          <p className="text-xs text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-1">
            {keys.map((key) => (
              <li key={key} className="break-all font-mono text-[11px]">
                <span className="text-muted-foreground">{key}: </span>
                {entries[key]}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function DeploymentDetailPanel({
  deployment,
  user,
  view,
  onViewChange,
  onClose,
  onScale,
  onRestart,
  onDelete,
  onLogs,
  onRefreshed,
}: {
  deployment: K8sObject
  user: User
  view: 'details' | 'yaml'
  onViewChange: (view: 'details' | 'yaml') => void
  onClose: () => void
  onScale: () => void
  onRestart: () => void
  onDelete: () => void
  onLogs: () => void
  onRefreshed: (next: K8sObject) => void
}) {
  const name = objectName(deployment)
  const ns = objectNamespace(deployment)
  const counts = replicaStatusCounts(deployment)
  const desired = replicaDesired(deployment)
  const selector = selectorMatchLabels(deployment)
  const conditions = objectConditions(deployment)
  const [pods, setPods] = useState<K8sObject[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const onRefreshedRef = useRef(onRefreshed)
  onRefreshedRef.current = onRefreshed
  const deploymentRef = useRef(deployment)
  deploymentRef.current = deployment

  const loadLive = useCallback(async () => {
    if (!ns || !name) return
    try {
      let current = deploymentRef.current
      const res = await fetch(`/api/k8s/namespaces/${encodeURIComponent(ns)}/deployments/${encodeURIComponent(name)}`, {
        credentials: 'same-origin',
      })
      if (res.ok) {
        const next: K8sObject = await res.json()
        onRefreshedRef.current(next)
        current = next
      }
      const labels = selectorMatchLabels(current)
      if (can(user, 'pods', 'view')) {
        const podsRes = await fetch(`/api/k8s/namespaces/${encodeURIComponent(ns)}/pods`, { credentials: 'same-origin' })
        if (podsRes.ok) {
          const data: K8sObject[] = await podsRes.json()
          setPods((Array.isArray(data) ? data : []).filter((pod) => podMatchesLabels(pod, labels)))
        }
      }
      const evRes = await fetch(
        `/api/k8s/namespaces/${encodeURIComponent(ns)}/deployments/${encodeURIComponent(name)}/events`,
        { credentials: 'same-origin' },
      )
      if (evRes.ok) {
        const data: EventItem[] = await evRes.json()
        setEvents(Array.isArray(data) ? data : [])
      }
    } catch {
      // keep last values
    }
  }, [name, ns, user])

  useEffect(() => {
    void loadLive()
  }, [loadLive])
  useLiveRefresh(loadLive, view === 'details')

  const { sort, sortKey, sortDir, onSort } = useTableSort('deployment-detail-pods')
  const sortedPods = useMemo(
    () =>
      sortBy(pods, sort, (pod, key) => {
        switch (key) {
          case 'name':
            return objectName(pod)
          case 'ready':
            return ratioSortValue(podReady(pod))
          case 'status':
            return podStatus(pod)
          default:
            return ''
        }
      }),
    [pods, sort],
  )

  async function refresh() {
    setRefreshing(true)
    try {
      await loadLive()
    } finally {
      setRefreshing(false)
    }
  }

  const canLogs = can(user, 'pods', 'logs')

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-l bg-background sm:w-md lg:w-lg xl:w-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Deployment: {name}</h2>
        {can(user, 'deployments', 'scale') ? (
          <IconActionButton tooltip="Scale" onClick={onScale}>
            <ScalingIcon />
          </IconActionButton>
        ) : null}
        {can(user, 'deployments', 'restart') ? (
          <IconActionButton tooltip="Restart" onClick={onRestart}>
            <RotateCcwIcon />
          </IconActionButton>
        ) : null}
        {can(user, 'pods', 'logs') ? (
          <IconActionButton tooltip="Logs" onClick={onLogs}>
            <ScrollTextIcon />
          </IconActionButton>
        ) : null}
        <IconActionButton tooltip="Refresh" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCwIcon className={refreshing ? 'animate-spin' : undefined} />
        </IconActionButton>
        {can(user, 'deployments', 'yaml_edit') ? (
          <IconActionButton
            tooltip={view === 'yaml' ? 'Details' : 'Edit'}
            onClick={() => onViewChange(view === 'yaml' ? 'details' : 'yaml')}
          >
            <PencilIcon />
          </IconActionButton>
        ) : null}
        {can(user, 'deployments', 'delete') ? (
          <IconActionButton tooltip="Delete" onClick={onDelete}>
            <Trash2Icon />
          </IconActionButton>
        ) : null}
        <IconActionButton tooltip="Close" onClick={onClose}>
          <XIcon />
        </IconActionButton>
      </header>

      {view === 'yaml' ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <ResourceYAMLEditor
            module="deployments"
            name={name}
            namespace={ns}
            canEdit={can(user, 'deployments', 'yaml_edit')}
            canDelete={can(user, 'deployments', 'delete')}
            onDeleted={onClose}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3">
          <section>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">Properties</h3>
            <dl>
              <PropRow label="Namespace">{ns || '—'}</PropRow>
              <PropRow label="Created">{formatAge(deployment.metadata?.creationTimestamp)}</PropRow>
              <PropRow label="Replicas">
                {counts.ready}/{desired} ready · {counts.updated} updated · {counts.available} available
              </PropRow>
              <PropRow label="Strategy">{workloadStrategy(deployment)}</PropRow>
              <PropRow label="Selector">
                {Object.keys(selector).length === 0
                  ? '—'
                  : Object.entries(selector)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')}
              </PropRow>
              <PropRow label="Labels">
                <MetaList title="Labels" entries={objectLabels(deployment)} />
              </PropRow>
              <PropRow label="Annotations">
                <MetaList title="Annotations" entries={objectAnnotations(deployment)} />
              </PropRow>
              <PropRow label="Conditions">
                {conditions.length === 0 ? (
                  '—'
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {conditions.map((c) => (
                      <Badge
                        key={c.type}
                        variant={c.ok ? 'outline' : 'destructive'}
                        className={c.ok ? 'h-5 border-emerald-500/40 text-[10px] text-emerald-500' : 'h-5 text-[10px]'}
                      >
                        {c.type}
                      </Badge>
                    ))}
                  </div>
                )}
              </PropRow>
            </dl>
          </section>

          <Separator className="my-3" />

          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Pods · {pods.length}</h3>
            {pods.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pods match this deployment (or none you can view).</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SerialHead />
                      <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortableHead column="ready" label="Ready" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <TableHead>Containers</TableHead>
                      <SortableHead column="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPods.map((pod, index) => {
                      const podName = objectName(pod)
                      const status = podStatus(pod)
                      return (
                        <TableRow key={podName}>
                          <SerialCell index={index} />
                          <TableCell className="font-medium">
                            {canLogs ? (
                              <Link
                                to={`/workloads/${encodeURIComponent(ns)}/pods/${encodeURIComponent(podName)}/logs`}
                                className="hover:underline"
                              >
                                {podName}
                              </Link>
                            ) : (
                              podName
                            )}
                          </TableCell>
                          <TableCell>{podReady(pod)}</TableCell>
                          <TableCell>
                            <PodContainersCell obj={pod} />
                          </TableCell>
                          <TableCell className={statusTextClass(status)}>{status}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <Separator className="my-3" />

          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Events</h3>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events found.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li key={`${ev.metadata?.namespace}/${ev.metadata?.name}`} className="text-xs">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">
                        {formatAge(ev.lastTimestamp || ev.eventTime || ev.metadata?.creationTimestamp)}
                      </span>
                      <span className={ev.type === 'Warning' ? 'text-destructive' : 'text-emerald-500'}>
                        {ev.reason}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{ev.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </aside>
  )
}
