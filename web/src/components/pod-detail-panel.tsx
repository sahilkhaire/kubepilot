import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDownIcon,
  FileCodeIcon,
  PencilIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  SquareTerminalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import type { User } from '@/api'
import { PodContainersCell } from '@/components/pod-containers'
import WorkloadEnvEditor from '@/components/workload-env-editor'
import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import { IconActionButton } from '@/components/icon-action-button'
import { StatusBadge } from '@/components/status-badge'
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
    <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-l bg-background sm:w-md lg:w-lg xl:w-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Pod: {name}</h2>
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
        <IconActionButton tooltip="Refresh" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCwIcon className={refreshing ? 'animate-spin' : undefined} />
        </IconActionButton>
        {can(user, 'pods', 'yaml_edit') ? (
          <IconActionButton
            tooltip={view === 'edit' ? 'Details' : 'Edit env'}
            onClick={() => onViewChange(view === 'edit' ? 'details' : 'edit')}
          >
            <PencilIcon />
          </IconActionButton>
        ) : null}
        <IconActionButton
          tooltip={view === 'yaml' ? 'Details' : 'YAML'}
          onClick={() => onViewChange(view === 'yaml' ? 'details' : 'yaml')}
        >
          <FileCodeIcon />
        </IconActionButton>
        {can(user, 'pods', 'delete') ? (
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
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3">
          <section>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">Properties</h3>
            <dl>
              <PropRow label="Namespace">{ns || '—'}</PropRow>
              <PropRow label="Status">
                <StatusBadge value={podStatus(pod)} />
              </PropRow>
              <PropRow label="Ready">{podReady(pod)}</PropRow>
              <PropRow label="Restarts">{podRestarts(pod)}</PropRow>
              <PropRow label="Node">{podNode(pod) || '—'}</PropRow>
              <PropRow label="Pod IP">{podIP(pod) || '—'}</PropRow>
              <PropRow label="QoS">{podQOS(pod)}</PropRow>
              <PropRow label="Controlled by">{podControlledBy(pod) || '—'}</PropRow>
              <PropRow label="Created">{formatAge(pod.metadata?.creationTimestamp)}</PropRow>
              <PropRow label="Containers">
                <PodContainersCell obj={pod} />
              </PropRow>
              <PropRow label="Labels">
                <MetaList title="Labels" entries={objectLabels(pod)} />
              </PropRow>
              <PropRow label="Annotations">
                <MetaList title="Annotations" entries={objectAnnotations(pod)} />
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
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Containers · {containers.length}</h3>
            {containers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No containers reported yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SerialHead />
                      <TableHead>Name</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Ready</TableHead>
                      <TableHead>Restarts</TableHead>
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
                        <TableCell>{container.ready ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{container.restartCount}</TableCell>
                      </TableRow>
                    ))}
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
