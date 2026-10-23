import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { readAPIError } from '@/api'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { isAllNamespaces, NamespaceSelect, useNamespaces } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  SerialHead,
  SerialCell,
} from '@/components/ui/table'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import { sortBy, useTableSort } from '@/lib/table-sort'
import { workloadKinds } from '@/lib/workload-kinds'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'

export default function Workloads() {
  const user = useUser()
  const visibleRows = workloadKinds.filter((row) => can(user, row.module, 'view'))
  const { namespaces, namespace, setNamespace, ready, error: namespacesError } = useNamespaces()
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')
  const nsRef = useRef(namespace)
  nsRef.current = namespace

  const loadCounts = useSingleFlight(
    useCallback(
      async (quiet = false) => {
        if (!ready) return
        const requested = namespace
        try {
          const qs = isAllNamespaces(namespace) ? '' : `?namespace=${encodeURIComponent(namespace)}`
          const res = await fetch(`/api/k8s/workloads/overview${qs}`, { credentials: 'same-origin' })
          if (!res.ok) throw new Error(await readAPIError(res, 'Failed to load workload counts'))
          const data: Record<string, number> = await res.json()
          if (nsRef.current !== requested) return
          setCounts(data)
          setError('')
        } catch (e) {
          if (!quiet && nsRef.current === requested) setError(e instanceof Error ? e.message : 'Load failed')
        }
      },
      [namespace, ready],
    ),
  )

  useEffect(() => {
    setCounts(null)
  }, [namespace])
  useEffect(() => {
    void loadCounts(false)
  }, [loadCounts])
  useLiveRefresh(() => loadCounts(true), ready)

  const { sort, sortKey, sortDir, onSort } = useTableSort('workloads')
  const sortedRows = useMemo(
    () =>
      sortBy(visibleRows, sort, (row, key) =>
        key === 'count' ? (counts?.[row.module] ?? Number.NEGATIVE_INFINITY) : row.label,
      ),
    [visibleRows, sort, counts],
  )

  if (!ready) return <PageLoading />

  return (
    <PageBody>
      <PageHeader
        title="Workloads"
        description={isAllNamespaces(namespace) ? 'All namespaces' : `Namespace ${namespace}`}
      >
        <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
      </PageHeader>
      <ErrorAlert message={error || namespacesError} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <SerialHead />
              <SortableHead column="kind" label="Kind" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="count" label="Count" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, index) => {
              const Icon = row.icon
              return (
                <TableRow key={row.module}>
                  <SerialCell index={index} />
                  <TableCell>
                    <Link to={row.href} className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
                      <Icon className="size-3.5 text-muted-foreground" />
                      {row.label}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {counts ? (counts[row.module] ?? '—') : <Skeleton className="ml-auto h-4 w-8" />}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  )
}
