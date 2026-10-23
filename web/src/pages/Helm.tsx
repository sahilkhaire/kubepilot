import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EllipsisVerticalIcon, HistoryIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { readAPIError, rollbackHelmRelease, uninstallHelmRelease } from '@/api'
import EmptyState from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { ActionTooltip } from '@/components/icon-action-button'
import { FilterInput, isAllNamespaces, NamespaceSelect, useNamespaces } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import { formatAge } from '@/lib/k8s-fields'
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
import { sortBy, timestampSortValue, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'

type HelmRelease = {
  name: string
  namespace: string
  revision: number
  chart: string
  status: string
  appVersion?: string
  updated?: string
}

export default function Helm() {
  const user = useUser()
  const { namespaces, namespace, setNamespace, ready } = useNamespaces()
  const [releases, setReleases] = useState<HelmRelease[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [toUninstall, setToUninstall] = useState<HelmRelease | null>(null)
  const [toRollback, setToRollback] = useState<HelmRelease | null>(null)
  const nsRef = useRef(namespace)
  nsRef.current = namespace

  const load = useSingleFlight(
    useCallback(
      async (quiet = false) => {
        if (!ready) return
        const requested = namespace
        try {
          const qs = isAllNamespaces(namespace) ? '' : `?namespace=${encodeURIComponent(namespace)}`
          const res = await fetch(`/api/helm/releases${qs}`, { credentials: 'same-origin' })
          if (!res.ok) throw new Error(await readAPIError(res, 'Failed to load releases'))
          const data: HelmRelease[] = await res.json()
          if (nsRef.current !== requested) return
          setReleases(Array.isArray(data) ? data : [])
          setError('')
        } catch (e) {
          if (!quiet && nsRef.current === requested) setError(e instanceof Error ? e.message : 'Load failed')
        } finally {
          if (nsRef.current === requested) setLoaded(true)
        }
      },
      [namespace, ready],
    ),
  )

  useEffect(() => {
    setLoaded(false)
    setReleases([])
  }, [namespace])
  useEffect(() => {
    void load(false)
  }, [load])
  useLiveRefresh(() => load(true), ready)

  const visible = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return releases
    return releases.filter((r) => `${r.name} ${r.namespace} ${r.chart}`.toLowerCase().includes(q))
  }, [releases, query])

  const { sort, sortKey, sortDir, onSort } = useTableSort('helm')
  const sorted = useMemo(
    () =>
      sortBy(visible, sort, (rel, key) => {
        switch (key) {
          case 'name':
            return rel.name
          case 'namespace':
            return rel.namespace
          case 'chart':
            return rel.chart
          case 'revision':
            return rel.revision
          case 'status':
            return rel.status
          case 'appVersion':
            return rel.appVersion ?? ''
          case 'updated':
            return timestampSortValue(rel.updated)
          default:
            return ''
        }
      }),
    [visible, sort],
  )

  async function onUninstall() {
    if (!toUninstall) return
    const rel = toUninstall
    setPending(true)
    try {
      await uninstallHelmRelease(rel.name, rel.namespace)
      toast.success(`Uninstalled ${rel.name}`)
      setReleases((prev) => prev.filter((r) => r.name !== rel.name || r.namespace !== rel.namespace))
      setToUninstall(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uninstall failed')
    } finally {
      setPending(false)
    }
  }

  async function onRollback() {
    if (!toRollback) return
    const rel = toRollback
    setPending(true)
    try {
      await rollbackHelmRelease(rel.name, rel.namespace)
      toast.success(`Rolled back ${rel.name} to revision ${rel.revision - 1}`)
      setToRollback(null)
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rollback failed')
    } finally {
      setPending(false)
    }
  }

  if (!ready) return <PageLoading />

  const showNamespace = isAllNamespaces(namespace)

  return (
    <PageBody>
      <PageHeader
        title="Helm releases"
        count={loaded ? visible.length : undefined}
      >
        <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
        <FilterInput value={query} onChange={setQuery} placeholder="Filter by name or chart…" />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto">
        {!loaded ? (
          <div className="p-3">
            <PageLoading compact />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <SerialHead />
                  <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  {showNamespace ? (
                    <SortableHead column="namespace" label="Namespace" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  ) : null}
                  <SortableHead column="chart" label="Chart" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="appVersion" label="App version" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="revision" label="Revision" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                  <SortableHead column="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableHead column="updated" label="Updated" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <TableHead className="w-8">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((rel, index) => {
                  const canRollback = can(user, 'helm', 'rollback') && rel.revision > 1
                  const canUninstall = can(user, 'helm', 'uninstall')
                  return (
                    <TableRow key={`${rel.namespace}/${rel.name}`}>
                      <SerialCell index={index} />
                      <TableCell className="font-medium">{rel.name}</TableCell>
                      {showNamespace ? <TableCell className="text-muted-foreground">{rel.namespace}</TableCell> : null}
                      <TableCell className="font-mono text-xs">{rel.chart}</TableCell>
                      <TableCell className="text-muted-foreground">{rel.appVersion || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{rel.revision}</TableCell>
                      <TableCell>
                        <StatusBadge value={rel.status} className="capitalize" />
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {rel.updated ? `${formatAge(rel.updated)} ago` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {canRollback || canUninstall ? (
                          <DropdownMenu>
                            <ActionTooltip label="Actions">
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${rel.name}`}>
                                  <EllipsisVerticalIcon />
                                </Button>
                              </DropdownMenuTrigger>
                            </ActionTooltip>
                            <DropdownMenuContent align="end" className="min-w-44">
                              {canRollback ? (
                                <DropdownMenuItem onSelect={() => setToRollback(rel)}>
                                  <HistoryIcon />
                                  Roll back…
                                </DropdownMenuItem>
                              ) : null}
                              {canRollback && canUninstall ? <DropdownMenuSeparator /> : null}
                              {canUninstall ? (
                                <DropdownMenuItem variant="destructive" onSelect={() => setToUninstall(rel)}>
                                  <Trash2Icon />
                                  Uninstall…
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {sorted.length === 0 && !error ? (
              <EmptyState>
                {query
                  ? `No releases match “${query}”.`
                  : isAllNamespaces(namespace)
                    ? 'No Helm releases found.'
                    : `No Helm releases in ${namespace}.`}
              </EmptyState>
            ) : null}
          </>
        )}
      </div>
      <ConfirmDialog
        open={toUninstall != null}
        title={`Uninstall ${toUninstall?.name ?? ''}?`}
        description={
          toUninstall
            ? `Removes every resource the release created in ${toUninstall.namespace}. This cannot be undone.`
            : ''
        }
        confirmLabel="Uninstall"
        pendingLabel="Uninstalling…"
        destructive
        pending={pending}
        onConfirm={onUninstall}
        onCancel={() => !pending && setToUninstall(null)}
      />
      <ConfirmDialog
        open={toRollback != null}
        title={`Roll back ${toRollback?.name ?? ''}?`}
        description={
          toRollback
            ? `Restores revision ${toRollback.revision - 1} of ${toRollback.chart}. Helm records this as a new revision (${toRollback.revision + 1}).`
            : ''
        }
        confirmLabel="Roll back"
        pendingLabel="Rolling back…"
        pending={pending}
        onConfirm={onRollback}
        onCancel={() => !pending && setToRollback(null)}
      />
    </PageBody>
  )
}
