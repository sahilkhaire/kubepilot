import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLineIcon,
  FileCodeIcon,
  PauseIcon,
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
import { StatusBadge } from '@/components/status-badge'
import { IconActionButton } from '@/components/icon-action-button'
import {
  ConditionBadges,
  DetailPanel,
  DetailSection,
  EventList,
  MetaList,
  PropRow,
  type EventItem,
} from '@/components/detail-parts'
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
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'

function canNode(user: User, action: string): boolean {
  return can(user, 'nodes', action)
}

function canEvents(user: User): boolean {
  return can(user, 'events', 'view')
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

  useEffect(() => {
    setPods([])
    setEvents([])
  }, [name])

  const loadLive = useSingleFlight(
    useCallback(async () => {
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
  }, [name, user]),
  )

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
    <DetailPanel
      kind="Node"
      name={name}
      actions={
        <>
          {canNode(user, 'cordon') ? (
            <IconActionButton tooltip={unschedulable ? 'Uncordon' : 'Cordon'} onClick={onCordon}>
              {unschedulable ? <PlayIcon /> : <PauseIcon />}
            </IconActionButton>
          ) : null}
          {canNode(user, 'drain') ? (
            <IconActionButton tooltip="Drain" onClick={onDrain}>
              <ArrowDownToLineIcon />
            </IconActionButton>
          ) : null}
          <IconActionButton
            tooltip={view === 'yaml' ? 'Back to details' : 'YAML'}
            variant={view === 'yaml' ? 'secondary' : 'ghost'}
            onClick={() => onViewChange(view === 'yaml' ? 'details' : 'yaml')}
          >
            <FileCodeIcon />
          </IconActionButton>
          {view === 'details' ? (
            <IconActionButton tooltip="Refresh" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCwIcon className={refreshing ? 'animate-spin' : undefined} />
            </IconActionButton>
          ) : null}
          {canNode(user, 'delete') ? (
            <IconActionButton tooltip="Delete" onClick={onDelete}>
              <Trash2Icon />
            </IconActionButton>
          ) : null}
          <IconActionButton tooltip="Close" onClick={onClose}>
            <XIcon />
          </IconActionButton>
        </>
      }
    >
      {view === 'yaml' ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <ResourceYAMLEditor
            module="nodes"
            name={name}
            clusterScoped
            canEdit={canNode(user, 'yaml_edit')}
            canDelete={canNode(user, 'delete')}
            onDeleted={onClose}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <DetailSection title="Metrics">
            <MetricsPanel scope="node" name={name} compact />
          </DetailSection>

          <DetailSection title="Properties">
            <dl>
              <PropRow label="Status">
                <ConditionBadges conditions={conditions.map((c) => ({ key: c.text, label: c.text, ok: c.ok }))} />
              </PropRow>
              <PropRow label="Created">{formatAge(node.metadata?.creationTimestamp)} ago</PropRow>
              <PropRow label="Addresses">
                {addresses.length === 0
                  ? '—'
                  : addresses.map((a) => (
                      <div key={`${a.type}:${a.address}`}>
                        <span className="text-muted-foreground">{a.type}: </span>
                        <span className="font-mono">{a.address}</span>
                      </div>
                    ))}
              </PropRow>
              <PropRow label="OS">
                {info.operatingSystem} {info.architecture}
              </PropRow>
              <PropRow label="OS image">{info.osImage}</PropRow>
              <PropRow label="Kernel">{info.kernelVersion}</PropRow>
              <PropRow label="Runtime">{info.containerRuntimeVersion}</PropRow>
              <PropRow label="Kubelet">{info.kubeletVersion}</PropRow>
              <PropRow label="Labels">
                <MetaList entries={objectLabels(node)} />
              </PropRow>
              <PropRow label="Annotations">
                <MetaList entries={objectAnnotations(node)} />
              </PropRow>
            </dl>
          </DetailSection>

          <DetailSection title="Resources">
            <div className="space-y-3">
              <ResourceTable title="Capacity" values={capacity} />
              <ResourceTable title="Allocatable" values={allocatable} />
            </div>
          </DetailSection>

          <DetailSection title="Pods" count={pods.length}>
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
                      return (
                        <TableRow key={`${objectNamespace(pod)}/${podName}`}>
                          <SerialCell index={index} />
                          <TableCell className="max-w-48 truncate font-medium" title={podName}>
                            {podName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{objectNamespace(pod)}</TableCell>
                          <TableCell className="tabular-nums">{podReady(pod)}</TableCell>
                          <TableCell>
                            <PodContainersCell obj={pod} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge value={podStatus(pod)} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </DetailSection>

          {canEvents(user) ? (
            <DetailSection title="Events" count={events.length}>
              <EventList events={events} />
            </DetailSection>
          ) : null}
        </div>
      )}
    </DetailPanel>
  )
}

function ResourceTable({ title, values }: { title: string; values: Record<string, string> }) {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-medium text-muted-foreground">{title}</h4>
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
