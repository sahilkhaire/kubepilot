import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function Namespaces() {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
        if (!res.ok) throw new Error('failed to load namespaces')
        const data: string[] = await res.json()
        if (!cancelled) setNamespaces(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    const q = query.toLowerCase()
    return namespaces.filter((ns) => !q || ns.toLowerCase().includes(q))
  }, [namespaces, query])

  if (loading) return <PageLoading />

  return (
    <PageBody>
      <PageHeader title="Namespaces" description={`${visible.length} item${visible.length === 1 ? '' : 's'}`}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="h-7 w-48 text-xs"
        />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((ns) => (
              <TableRow key={ns}>
                <TableCell className="font-medium">{ns}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="xs" asChild>
                    <Link to={`/namespaces/cluster/namespaces/${encodeURIComponent(ns)}/yaml`}>YAML</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length === 0 ? <EmptyState>No namespaces.</EmptyState> : null}
      </div>
    </PageBody>
  )
}
