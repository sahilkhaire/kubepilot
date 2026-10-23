import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FileCodeIcon,
  HistoryIcon,
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
import WorkloadEnvEditor from '@/components/workload-env-editor'
import {
  ConditionBadges,
  DetailPanel,
  DetailSection,
  EventList,
  MetaList,
  PropRow,
  type EventItem,
} from '@/components/detail-parts'
import { IconActionButton } from '@/components/icon-action-button'
import { PodContainersCell } from '@/components/pod-containers'
import { StatusBadge } from '@/components/status-badge'
import { Progress } from '@/components/ui/progress'
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
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
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

export type DeploymentPanelView = 'details' | 'yaml' | 'edit'

export default function DeploymentDetailPanel({
  deployment,
  user,
  view,
  onViewChange,
  onClose,
  onScale,
  onRestart,
  onRollback,
  onDelete,
  onLogs,
  onRefreshed,
}: {
  deployment: K8sObject
  user: User
  view: DeploymentPanelView
  onViewChange: (view: DeploymentPanelView) => void
  onClose: () => void
  onScale: () => void
  onRestart: () => void
  onRollback: () => void
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

  // Clear the previous deployment's pods and events when switching selection.
  useEffect(() => {
    setPods([])
    setEvents([])
  }, [name, ns])

  const loadLive = useSingleFlight(
    useCallback(async () => {
      if (!ns || !name) return
      const base = `/api/k8s/namespaces/${encodeURIComponent(ns)}`
      try {
        let current = deploymentRef.current
        const res = await fetch(`${base}/deployments/${encodeURIComponent(name)}`, { credentials: 'same-origin' })
        if (res.ok) {
          const next: K8sObject = await res.json()
          onRefreshedRef.current(next)
          current = next
        }
        const labels = selectorMatchLabels(current)
        const [podsRes, evRes] = await Promise.all([
          can(user, 'pods', 'view') ? fetch(`${base}/pods`, { credentials: 'same-origin' }) : Promise.resolve(null),
          fetch(`${base}/deployments/${encodeURIComponent(name)}/events`, { credentials: 'same-origin' }),
        ])
        if (podsRes?.ok) {
          const data: K8sObject[] = await podsRes.json()
          setPods((Array.isArray(data) ? data : []).filter((pod) => podMatchesLabels(pod, labels)))
        }
        if (evRes.ok) {
          const data: EventItem[] = await evRes.json()
          setEvents(Array.isArray(data) ? data : [])
        }
      } catch {
        // keep last values
      }
    }, [name, ns, user]),
  )

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
  const readyPercent = desired > 0 ? Math.round((counts.ready / desired) * 100) : counts.ready > 0 ? 100 : 0

  return (
    <DetailPanel
      kind="Deployment"
      name={name}
      actions={
        <>
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
          {can(user, 'deployments', 'rollback') ? (
            <IconActionButton tooltip="Roll back" onClick={onRollback}>
              <HistoryIcon />
            </IconActionButton>
          ) : null}
          {canLogs ? (
            <IconActionButton tooltip="Logs" onClick={onLogs}>
              <ScrollTextIcon />
            </IconActionButton>
          ) : null}
          {can(user, 'deployments', 'yaml_edit') ? (
            <IconActionButton
              tooltip={view === 'edit' ? 'Back to details' : 'Edit env'}
              variant={view === 'edit' ? 'secondary' : 'ghost'}
              onClick={() => onViewChange(view === 'edit' ? 'details' : 'edit')}
            >
              <PencilIcon />
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
          {can(user, 'deployments', 'delete') ? (
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
            module="deployments"
            name={name}
            namespace={ns}
            canEdit={can(user, 'deployments', 'yaml_edit')}
            canDelete={can(user, 'deployments', 'delete')}
            onDeleted={onClose}
          />
        </div>
      ) : view === 'edit' ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <WorkloadEnvEditor resource={deployment} module="deployments" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <DetailSection title="Replicas">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold tabular-nums">
                {counts.ready}
                <span className="text-base text-muted-foreground">/{desired}</span>
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <Progress value={readyPercent} className="h-1.5" aria-label="Ready replicas" />
                <p className="text-[11px] text-muted-foreground">
                  {counts.updated} updated · {counts.available} available
                </p>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Properties">
            <dl>
              <PropRow label="Namespace">{ns || '—'}</PropRow>
              <PropRow label="Created">{formatAge(deployment.metadata?.creationTimestamp)} ago</PropRow>
              <PropRow label="Strategy">{workloadStrategy(deployment)}</PropRow>
              <PropRow label="Selector">
                {Object.keys(selector).length === 0 ? (
                  '—'
                ) : (
                  <span className="font-mono text-[11px]">
                    {Object.entries(selector)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(', ')}
                  </span>
                )}
              </PropRow>
              <PropRow label="Labels">
                <MetaList entries={objectLabels(deployment)} />
              </PropRow>
              <PropRow label="Annotations">
                <MetaList entries={objectAnnotations(deployment)} />
              </PropRow>
              <PropRow label="Conditions">
                <ConditionBadges conditions={conditions.map((c) => ({ key: c.type, label: c.type, ok: c.ok }))} />
              </PropRow>
            </dl>
          </DetailSection>

          <DetailSection title="Pods" count={pods.length}>
            {pods.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {can(user, 'pods', 'view') ? 'No pods are running for this deployment.' : 'You cannot view pods.'}
              </p>
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
                      return (
                        <TableRow key={podName}>
                          <SerialCell index={index} />
                          <TableCell className="max-w-48 truncate font-medium" title={podName}>
                            {canLogs ? (
                              <Link
                                to={`/workloads/${encodeURIComponent(ns)}/pods/${encodeURIComponent(podName)}/logs`}
                                className="underline-offset-2 hover:underline"
                                title="Open logs"
                              >
                                {podName}
                              </Link>
                            ) : (
                              podName
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums">{podReady(pod)}</TableCell>
                          <TableCell>
                            <PodContainersCell obj={pod} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge value={pod.metadata?.deletionTimestamp ? 'Terminating' : podStatus(pod)} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </DetailSection>

          <DetailSection title="Events" count={events.length}>
            <EventList events={events} />
          </DetailSection>
        </div>
      )}
    </DetailPanel>
  )
}
