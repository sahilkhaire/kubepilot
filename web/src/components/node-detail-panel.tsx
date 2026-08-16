import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDownIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import type { User } from '@/api'
import MetricsPanel from '@/components/MetricsPanel'
import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import { SortableHead } from '@/components/sortable-head'
import { PodContainersCell } from '@/components/pod-containers'
import { statusTextClass } from '@/components/status-badge'
import { IconActionButton } from '@/components/icon-action-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { can } from '@/lib/grants'
import {
  formatAge,
  formatK8sQuantity,
  nodeAddresses,
  nodeConditionLabels,
  nodeInfo,
  nodeResourceColumns,
  nodeResourceMap,
  nodeUnschedulable,
  objectAnnotations,
  objectLabels,
  objectName,
  objectNamespace,
  podReady,
  podStatus,
  type K8sObject,
} from '@/lib/k8s-fields'
import { ratioSortValue, sortBy, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh } from '@/hooks/use-live-refresh'

type EventItem = {
  metadata?: { name?: string; namespace?: string; creationTimestamp?: string }
  involvedObject?: { kind?: string; name?: string }
  reason?: string
  message?: string
  type?: string
  lastTimestamp?: string
  eventTime?: string
}

function canNode(user: User, action: string): boolean {
  return can(user, 'nodes', action)
}

function canEvents(user: User): boolean {
  return can(user, 'events', 'view')
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
        {keys.length} {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {keys.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-0.5 pb-2 font-mono text-[11px]">
            {keys.sort().map((key) => (
              <li key={key} className="break-all">
                <span className="text-muted-foreground">{key}=</span>
                {entries[key]}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function NodeDetailPanel({
  node,
  user,
  view,
  onViewChange,
  onClose,
  onCordon,
  onDrain,
  onDelete,
  onRefreshed,
}: {
  node: K8sObject
  user: User
  view: 'details' | 'yaml'
  onViewChange: (view: 'details' | 'yaml') => void
  onClose: () => void
  onCordon: () => void
  onDrain: () => void
  onDelete: () => void
  onRefreshed: (next: K8sObject) => void
}) {
  const name = objectName(node)
  const unschedulable = nodeUnschedulable(node)
  const info = nodeInfo(node)
  const conditions = nodeConditionLabels(node)
  const addresses = nodeAddresses(node)
  const capacity = nodeResourceMap(node, 'capacity')
  const allocatable = nodeResourceMap(node, 'allocatable')
  const [pods, setPods] = useState<K8sObject[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const onRefreshedRef = useRef(onRefreshed)
  onRefreshedRef.current = onRefreshed

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/k8s/nodes/${encodeURIComponent(name)}`, { credentials: 'same-origin' })
      if (res.ok) {
        const next: K8sObject = await res.json()
        onRefreshedRef.current(next)
      }
      const podsRes = await fetch(`/api/k8s/nodes/${encodeURIComponent(name)}/pods`, { credentials: 'same-origin' })
      if (podsRes.ok) {
        const data: K8sObject[] = await podsRes.json()
        setPods(Array.isArray(data) ? data : [])
      }
      if (!canEvents(user)) {
        setEvents([])
        return
      }
      const evRes = await fetch('/api/k8s/events', { credentials: 'same-origin' })
      if (!evRes.ok) return
      const data: EventItem[] = await evRes.json()
      setEvents(
        (Array.isArray(data) ? data : []).filter(
          (ev) => ev.involvedObject?.kind === 'Node' && ev.involvedObject?.name === name,
        ),
      )
    } catch {
      // keep last values on background refresh
    }
  }, [name, user])

  useEffect(() => {
    void loadLive()
  }, [loadLive])
  useLiveRefresh(loadLive, view === 'details')

  const { sort, sortKey, sortDir, onSort } = useTableSort('node-detail-pods')
  const sortedPods = useMemo(
    () =>
      sortBy(pods, sort, (pod, key) => {
        switch (key) {
          case 'name':
            return objectName(pod)
          case 'namespace':
            return objectNamespace(pod)
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

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-l bg-background sm:w-md lg:w-lg xl:w-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Node: {name}</h2>
        {canNode(user, 'cordon') ? (
          <IconActionButton tooltip={unschedulable ? 'Uncordon' : 'Cordon'} onClick={onCordon}>
            {unschedulable ? <PlayIcon /> : <PauseIcon />}
          </IconActionButton>
        ) : null}
        <IconActionButton tooltip="Refresh" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCwIcon className={refreshing ? 'animate-spin' : undefined} />
        </IconActionButton>
        <IconActionButton
          tooltip={view === 'yaml' ? 'Details' : 'Edit'}
          onClick={() => onViewChange(view === 'yaml' ? 'details' : 'yaml')}
        >
          <PencilIcon />
        </IconActionButton>
        {canNode(user, 'delete') ? (
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
            module="nodes"
            name={name}
            clusterScoped
            canEdit={canNode(user, 'yaml_edit')}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3">
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Metrics</h3>
            <MetricsPanel scope="node" name={name} compact />
          </section>

          <Separator className="my-3" />

          <section>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">Properties</h3>
            <dl>
              <PropRow label="Created">{formatAge(node.metadata?.creationTimestamp)}</PropRow>
              <PropRow label="Labels">
                <MetaList title="Labels" entries={objectLabels(node)} />
              </PropRow>
              <PropRow label="Annotations">
                <MetaList title="Annotations" entries={objectAnnotations(node)} />
              </PropRow>
              <PropRow label="Addresses">
                {addresses.length === 0
                  ? '—'
                  : addresses.map((a) => (
                      <div key={`${a.type}:${a.address}`}>
                        <span className="text-muted-foreground">{a.type}: </span>
                        {a.address}
                      </div>
                    ))}
              </PropRow>
              <PropRow label="OS">
                {info.operatingSystem} {info.architecture}
              </PropRow>
              <PropRow label="OS Image">{info.osImage}</PropRow>
              <PropRow label="Kernel">{info.kernelVersion}</PropRow>
              <PropRow label="Runtime">{info.containerRuntimeVersion}</PropRow>
              <PropRow label="Kubelet">{info.kubeletVersion}</PropRow>
              <PropRow label="Conditions">
                <div className="flex flex-wrap gap-1">
                  {conditions.map((c) => (
                    <Badge
                      key={c.text}
                      variant={c.ok ? 'outline' : 'destructive'}
                      className={c.ok ? 'h-5 border-emerald-500/40 text-[10px] text-emerald-500' : 'h-5 text-[10px]'}
                    >
                      {c.text}
                    </Badge>
                  ))}
                </div>
              </PropRow>
            </dl>
          </section>

          <Separator className="my-3" />

          <section className="space-y-2">
            <ResourceTable title="Capacity" values={capacity} />
            <ResourceTable title="Allocatable" values={allocatable} />
          </section>

          <Separator className="my-3" />

          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Pods · {pods.length}</h3>
            {pods.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pods on this node (or none you can view).</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SerialHead />
                      <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortableHead column="namespace" label="Namespace" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
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
                        <TableRow key={`${objectNamespace(pod)}/${podName}`}>
                          <SerialCell index={index} />
                          <TableCell className="font-medium">{podName}</TableCell>
                          <TableCell className="text-muted-foreground">{objectNamespace(pod)}</TableCell>
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

          {canNode(user, 'drain') ? (
            <div className="pt-4">
              <Button variant="outline" size="sm" onClick={onDrain}>
                Drain node
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  )
}

function ResourceTable({ title, values }: { title: string; values: Record<string, string> }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SerialHead />
              {nodeResourceColumns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <SerialCell index={0} />
              {nodeResourceColumns.map((col) => (
                <TableCell key={col.key} className="tabular-nums">
                  {col.key === 'cpu' || col.key === 'pods'
                    ? formatK8sQuantity(values[col.key]) === '—'
                      ? (values[col.key] ?? '—')
                      : formatK8sQuantity(values[col.key])
                    : formatK8sQuantity(values[col.key])}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
