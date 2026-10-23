import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileCodeIcon,
  PencilIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  SquareTerminalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import type { User } from '@/api'
import WorkloadEnvEditor from '@/components/workload-env-editor'
import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import { IconActionButton } from '@/components/icon-action-button'
import { StatusBadge } from '@/components/status-badge'
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
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
import {
  formatAge,
  objectAnnotations,
  objectConditions,
  objectLabels,
  objectName,
  objectNamespace,
  podContainerInfos,
  podControlledBy,
  podIP,
  podNode,
  podQOS,
  podReady,
  podRestarts,
  podStatus,
  type K8sObject,
} from '@/lib/k8s-fields'

export type PodPanelView = 'details' | 'yaml' | 'edit'

export default function PodDetailPanel({
  pod,
  user,
  view,
  onViewChange,
  onClose,
  onDelete,
  onRefreshed,
}: {
  pod: K8sObject
  user: User
  view: PodPanelView
  onViewChange: (view: PodPanelView) => void
  onClose: () => void
  onDelete: () => void
  onRefreshed: (next: K8sObject) => void
}) {
  const name = objectName(pod)
  const ns = objectNamespace(pod)
  const containers = podContainerInfos(pod)
  const conditions = objectConditions(pod)
  const [events, setEvents] = useState<EventItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const onRefreshedRef = useRef(onRefreshed)
  onRefreshedRef.current = onRefreshed

  useEffect(() => {
    setEvents([])
  }, [name, ns])

  const loadLive = useSingleFlight(
    useCallback(async () => {
    if (!ns || !name) return
    try {
      const res = await fetch(`/api/k8s/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(name)}`, {
        credentials: 'same-origin',
      })
      if (res.ok) {
        const next: K8sObject = await res.json()
        onRefreshedRef.current(next)
      }
      const evRes = await fetch(
        `/api/k8s/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(name)}/events`,
        { credentials: 'same-origin' },
      )
      if (evRes.ok) {
        const data: EventItem[] = await evRes.json()
        setEvents(Array.isArray(data) ? data : [])
      }
    } catch {
      // keep last values
    }
  }, [name, ns]),
  )

  useEffect(() => {
    void loadLive()
  }, [loadLive])
  useLiveRefresh(loadLive, view === 'details')

  async function refresh() {
    setRefreshing(true)
    try {
      await loadLive()
    } finally {
      setRefreshing(false)
    }
  }

  const navigate = useNavigate()
  const logsPath = `/workloads/${encodeURIComponent(ns)}/pods/${encodeURIComponent(name)}/logs`
  const execPath = `/workloads/${encodeURIComponent(ns)}/pods/${encodeURIComponent(name)}/exec`

  return (
    <DetailPanel
      kind="Pod"
      name={name}
      actions={
        <>
          {can(user, 'pods', 'logs') ? (
            <IconActionButton tooltip="Logs" onClick={() => navigate(logsPath)}>
              <ScrollTextIcon />
            </IconActionButton>
          ) : null}
          {can(user, 'pods', 'exec') ? (
            <IconActionButton tooltip="Shell" onClick={() => navigate(execPath)}>
              <SquareTerminalIcon />
            </IconActionButton>
          ) : null}
          {can(user, 'pods', 'yaml_edit') ? (
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
          {can(user, 'pods', 'delete') ? (
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
            module="pods"
            name={name}
            namespace={ns}
            canEdit={false}
            hint="YAML is read-only. Use Edit env to change environment variables."
          />
        </div>
      ) : view === 'edit' ? (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <WorkloadEnvEditor resource={pod} module="pods" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <DetailSection title="Properties">
            <dl>
              <PropRow label="Status">
                <StatusBadge value={pod.metadata?.deletionTimestamp ? 'Terminating' : podStatus(pod)} />
              </PropRow>
              <PropRow label="Namespace">{ns || '—'}</PropRow>
              <PropRow label="Ready">{podReady(pod)}</PropRow>
              <PropRow label="Restarts">{podRestarts(pod)}</PropRow>
              <PropRow label="Node">{podNode(pod) || '—'}</PropRow>
              <PropRow label="Pod IP">
                <span className="font-mono">{podIP(pod) || '—'}</span>
              </PropRow>
              <PropRow label="QoS class">{podQOS(pod)}</PropRow>
              <PropRow label="Controlled by">{podControlledBy(pod) || '—'}</PropRow>
              <PropRow label="Created">{formatAge(pod.metadata?.creationTimestamp)} ago</PropRow>
              <PropRow label="Labels">
                <MetaList entries={objectLabels(pod)} />
              </PropRow>
              <PropRow label="Annotations">
                <MetaList entries={objectAnnotations(pod)} />
              </PropRow>
              <PropRow label="Conditions">
                <ConditionBadges conditions={conditions.map((c) => ({ key: c.type, label: c.type, ok: c.ok }))} />
              </PropRow>
            </dl>
          </DetailSection>

          <DetailSection title="Containers" count={containers.length}>
            {containers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No containers reported yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SerialHead />
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Ready</TableHead>
                      <TableHead className="text-right">Restarts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {containers.map((container, index) => (
                      <TableRow key={`${container.kind}:${container.name}`}>
                        <SerialCell index={index} />
                        <TableCell className="font-medium">{container.name}</TableCell>
                        <TableCell className="text-muted-foreground">{container.kind}</TableCell>
                        <TableCell>
                          <StatusBadge value={container.reason} />
                        </TableCell>
                        <TableCell className={container.ready ? 'text-success' : 'text-muted-foreground'}>
                          {container.ready ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{container.restartCount}</TableCell>
                      </TableRow>
                    ))}
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
