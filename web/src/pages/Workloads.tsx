import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { ALL_NAMESPACES, isAllNamespaces, NamespaceSelect, resolveNamespaceValue } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
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
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'

const rows = [
  { module: 'pods', label: 'Pods', href: '/workloads/pods' },
  { module: 'deployments', label: 'Deployments', href: '/workloads/deployments' },
  { module: 'daemonsets', label: 'Daemon Sets', href: '/workloads/daemonsets' },
  { module: 'statefulsets', label: 'Stateful Sets', href: '/workloads/statefulsets' },
  { module: 'replicasets', label: 'Replica Sets', href: '/workloads/replicasets' },
  { module: 'jobs', label: 'Jobs', href: '/workloads/jobs' },
  { module: 'cronjobs', label: 'Cron Jobs', href: '/workloads/cronjobs' },
]

export default function Workloads() {
  const user = useUser()
  const visibleRows = rows.filter((row) => can(user, row.module, 'view'))
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState(ALL_NAMESPACES)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadNamespaces() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
        if (!res.ok) throw new Error('failed to load namespaces')
        const data: string[] = await res.json()
        if (cancelled) return
        setNamespaces(data)
        if (data.length > 0) {
          setNamespace((prev) => resolveNamespaceValue(prev, data))
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadNamespaces()
    return () => {
      cancelled = true
    }
  }, [])

  const loadCounts = useSingleFlight(
    useCallback(async (quiet = false) => {
    if (!namespace) return
    try {
      const qs = isAllNamespaces(namespace) ? '' : `?namespace=${encodeURIComponent(namespace)}`
      const res = await fetch(`/api/k8s/workloads/overview${qs}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('failed to load workloads overview')
      const data: Record<string, number> = await res.json()
      setCounts(data)
      setError('')
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'load failed')
    }
  }, [namespace]),
  )

  useEffect(() => {
    void loadCounts(false)
  }, [loadCounts])
  useLiveRefresh(() => loadCounts(true), Boolean(namespace))

  const { sort, sortKey, sortDir, onSort } = useTableSort('workloads')
  const sortedRows = sortBy(visibleRows, sort, (row, key) =>
    key === 'count' ? (counts[row.module] ?? Number.NEGATIVE_INFINITY) : row.label,
  )

  if (loading && namespaces.length === 0) {
    return <PageLoading />
  }

  return (
    <PageBody>
      <PageHeader
        title="Workloads"
        description={`Health in ${isAllNamespaces(namespace) ? 'all namespaces' : namespace || '—'}`}
      >
        <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <SerialHead />
              <SortableHead column="kind" label="Kind" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="count" label="Count" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, index) => (
              <TableRow key={row.module}>
                <SerialCell index={index} />
                <TableCell>
                  <Link to={row.href} className="font-medium hover:underline">
                    {row.label}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{counts[row.module] ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  )
}
