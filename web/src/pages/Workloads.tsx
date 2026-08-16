import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorAlert } from '@/components/error-alert'
import { ALL_NAMESPACES, isAllNamespaces, NamespaceSelect, resolveNamespaceValue } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'

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

  useEffect(() => {
    if (!namespace) return
    let cancelled = false
    async function load() {
      setError('')
      try {
        const qs = isAllNamespaces(namespace) ? '' : `?namespace=${encodeURIComponent(namespace)}`
        const res = await fetch(`/api/k8s/workloads/overview${qs}`, {
          credentials: 'same-origin',
        })
        if (!res.ok) throw new Error('failed to load workloads overview')
        const data: Record<string, number> = await res.json()
        if (!cancelled) setCounts(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [namespace])

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
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.module}>
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
