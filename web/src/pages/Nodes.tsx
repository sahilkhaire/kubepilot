import { useCallback, useEffect, useMemo, useState } from 'react'
import { EllipsisVerticalIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cordonNode, deleteK8sResource, drainNode, uncordonNode, type User } from '@/api'
import DeleteConfirm from '@/components/DeleteConfirm'
import EmptyState from '@/components/EmptyState'
import NodeDetailPanel from '@/components/node-detail-panel'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorAlert } from '@/components/error-alert'
import { NodeCPUBar, NodeDiskBar, NodeMemoryBar, metricSortValue, useMetricSortTick, useNodeMetrics } from '@/components/MetricsPanel'
import { SortableHead } from '@/components/sortable-head'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { ActionTooltip } from '@/components/icon-action-button'
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
  SerialHead,
  SerialCell,
} from '@/components/ui/table'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import {
  formatAge,
  matchesQuery,
  nodeConditionLabels,
  nodeInternalIP,
  nodeRoles,
  nodeTaintCount,
  nodeUnschedulable,
  nodeVersion,
  objectName,
  type K8sObject,
} from '@/lib/k8s-fields'
import { sortBy, timestampSortValue, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh } from '@/hooks/use-live-refresh'

type PendingAction = 'cordon' | 'uncordon' | 'drain'

export default function Nodes() {
  const user = useUser()
  const [nodes, setNodes] = useState<K8sObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<{ name: string; action: PendingAction } | null>(null)
  const [confirm, setConfirm] = useState<{ name: string; action: PendingAction } | null>(null)
  const [deleteName, setDeleteName] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [panelView, setPanelView] = useState<'details' | 'yaml'>('details')

  const load = useCallback(async (quiet = false) => {
    try {
      const res = await fetch('/api/k8s/nodes', { credentials: 'same-origin' })
      if (res.status === 403) {
        setNodes([])
        return
      }
      if (!res.ok) throw new Error('failed to load nodes')
      const data: K8sObject[] = await res.json()
      setNodes(Array.isArray(data) ? data : [])
      setError('')
    } catch (e) {
      if (!quiet) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function firstLoad() {
      setLoading(true)
      await load(false)
      if (!cancelled) setLoading(false)
    }
    firstLoad()
    return () => {
      cancelled = true
    }
  }, [load])
  useLiveRefresh(() => load(true))

  const visible = useMemo(() => nodes.filter((n) => matchesQuery(n, query)), [nodes, query])
  const { sort, sortKey, sortDir, onSort } = useTableSort('nodes')
  const metricsTick = useMetricSortTick()
  const sorted = useMemo(
    () =>
      sortBy(visible, sort, (node, key) => {
        const name = objectName(node)
        switch (key) {
          case 'name':
            return name
          case 'cpu':
            return metricSortValue(`node:${name}:cpu`) ?? Number.NEGATIVE_INFINITY
          case 'memory':
            return metricSortValue(`node:${name}:memory`) ?? Number.NEGATIVE_INFINITY
          case 'disk':
            return metricSortValue(`node:${name}:disk`) ?? Number.NEGATIVE_INFINITY
          case 'taints':
            return nodeTaintCount(node)
          case 'roles':
            return nodeRoles(node)
          case 'version':
            return nodeVersion(node)
          case 'age':
            return timestampSortValue(node.metadata?.creationTimestamp)
          case 'conditions':
            return nodeConditionLabels(node)
              .map((c) => c.text)
              .join(' ')
          default:
            return ''
        }
      }),
    [visible, sort, metricsTick],
  )
  const metricsEnabled = can(user, 'metrics', 'view')
  const selected = useMemo(
    () => nodes.find((n) => objectName(n) === selectedName) ?? null,
    [nodes, selectedName],
  )

  function openNode(name: string, view: 'details' | 'yaml' = 'details') {
    setSelectedName(name)
    setPanelView(view)
  }

  async function runAction(name: string, action: PendingAction) {
    setPending({ name, action })
    try {
      if (action === 'cordon') await cordonNode(name)
      else if (action === 'uncordon') await uncordonNode(name)
      else await drainNode(name)
      toast.success(
        action === 'cordon' ? `Cordoned ${name}` : action === 'uncordon' ? `Uncordoned ${name}` : `Draining ${name}`,
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'action failed')
    } finally {
      setPending(null)
      setConfirm(null)
    }
  }

  async function runDelete(name: string) {
    setDeleting(true)
    try {
      await deleteK8sResource('nodes', name, { clusterScoped: true })
      toast.success(`Deleted ${name}`)
      setDeleteName(null)
      if (selectedName === name) setSelectedName(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <PageLoading />

  return (
    <PageBody className="flex-row gap-0 overflow-hidden p-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader title="Nodes" description={`${visible.length} item${visible.length === 1 ? '' : 's'}`}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter name, labels…"
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
                <SortableHead column="cpu" label="CPU" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="memory" label="Memory" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="disk" label="Disk" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="taints" label="Taints" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="roles" label="Roles" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="version" label="Version" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="conditions" label="Conditions" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((node, index) => {
                const name = objectName(node)
                if (!name) return null
                return (
                  <NodeRow
                    key={name}
                    index={index}
                    node={node}
                    user={user}
                    selected={selectedName === name}
                    metricsEnabled={metricsEnabled}
                    busy={pending?.name === name}
                    onOpen={() => openNode(name)}
                    onYaml={() => openNode(name, 'yaml')}
                    onCordon={() => setConfirm({ name, action: nodeUnschedulable(node) ? 'uncordon' : 'cordon' })}
                    onDrain={() => setConfirm({ name, action: 'drain' })}
                    onDelete={() => setDeleteName(name)}
                  />
                )
              })}
            </TableBody>
          </Table>
          {sorted.length === 0 ? (
            <EmptyState>No nodes{query ? ' match this filter' : ''}.</EmptyState>
          ) : null}
        </div>
      </div>
      {selected ? (
        <NodeDetailPanel
          node={selected}
          user={user}
          view={panelView}
          onViewChange={setPanelView}
          onClose={() => setSelectedName(null)}
          onCordon={() =>
            setConfirm({
              name: objectName(selected),
              action: nodeUnschedulable(selected) ? 'uncordon' : 'cordon',
            })
          }
          onDrain={() => setConfirm({ name: objectName(selected), action: 'drain' })}
          onDelete={() => setDeleteName(objectName(selected))}
          onRefreshed={(next) => {
            const nextName = objectName(next)
            setNodes((prev) => prev.map((n) => (objectName(n) === nextName ? next : n)))
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm != null}
        title={
          confirm?.action === 'drain'
            ? `Drain ${confirm.name}?`
            : confirm?.action === 'uncordon'
              ? `Uncordon ${confirm.name}?`
              : `Cordon ${confirm?.name ?? ''}?`
        }
        description={
          confirm?.action === 'drain'
            ? 'This cordons the node and evicts its pods. Workloads without disruption budgets may be interrupted.'
            : confirm?.action === 'uncordon'
              ? 'The node will accept new pods again.'
              : 'The node will stop accepting new pods until it is uncordoned.'
        }
        confirmLabel={
          confirm?.action === 'drain' ? 'Drain' : confirm?.action === 'uncordon' ? 'Uncordon' : 'Cordon'
        }
        destructive={confirm?.action === 'drain'}
        pending={pending != null}
        onConfirm={() => {
          if (!confirm) return
          return runAction(confirm.name, confirm.action)
        }}
        onCancel={() => !pending && setConfirm(null)}
      />
      {deleteName ? (
        <DeleteConfirm
          resourceName={deleteName}
          resourceLabel="node"
          pending={deleting}
          onConfirm={() => runDelete(deleteName)}
          onCancel={() => !deleting && setDeleteName(null)}
        />
      ) : null}
    </PageBody>
  )
}

function NodeRow({
  index,
  node,
  user,
  selected,
  metricsEnabled,
  busy,
  onOpen,
  onYaml,
  onCordon,
  onDrain,
  onDelete,
}: {
  index: number
  node: K8sObject
  user: User
  selected: boolean
  metricsEnabled: boolean
  busy: boolean
  onOpen: () => void
  onYaml: () => void
  onCordon: () => void
  onDrain: () => void
  onDelete: () => void
}) {
  const name = objectName(node)
  const ip = nodeInternalIP(node)
  const metrics = useNodeMetrics(name, metricsEnabled)
  const conditions = nodeConditionLabels(node)
  const unschedulable = nodeUnschedulable(node)

  return (
    <TableRow data-state={selected ? 'selected' : undefined} className="cursor-pointer" onClick={onOpen}>
      <SerialCell index={index} />
      <TableCell>
        <span className="font-medium">{name}</span>
        {ip && ip !== name ? <p className="text-[11px] text-muted-foreground">{ip}</p> : null}
      </TableCell>
      <TableCell>
        <NodeCPUBar metric={metrics?.cpu} />
      </TableCell>
      <TableCell>
        <NodeMemoryBar metric={metrics?.memory} />
      </TableCell>
      <TableCell>
        <NodeDiskBar metric={metrics?.disk} />
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">{nodeTaintCount(node)}</TableCell>
      <TableCell>{nodeRoles(node)}</TableCell>
      <TableCell className="font-mono text-muted-foreground">{nodeVersion(node)}</TableCell>
      <TableCell className="text-muted-foreground">{formatAge(node.metadata?.creationTimestamp)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {conditions.map((c) => (
            <span key={c.text} className={c.ok ? 'text-emerald-500' : 'text-destructive'}>
              {c.text}
            </span>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <ActionTooltip label="Actions">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${name}`} disabled={busy}>
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
          </ActionTooltip>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onClick={onYaml}>YAML</DropdownMenuItem>
            {can(user, 'nodes', 'cordon') ? (
              <DropdownMenuItem onClick={onCordon}>{unschedulable ? 'Uncordon' : 'Cordon'}</DropdownMenuItem>
            ) : null}
            {can(user, 'nodes', 'drain') ? (
              <DropdownMenuItem variant="destructive" onClick={onDrain}>
                Drain
              </DropdownMenuItem>
            ) : null}
            {can(user, 'nodes', 'delete') ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}
