import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { MetricsCell } from '@/components/MetricsPanel'
import { Badge } from '@/components/ui/badge'
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
import { formatAge, matchesQuery, nodeReady, nodeVersion, objectName, type K8sObject } from '@/lib/k8s-fields'

export default function Nodes() {
  const [nodes, setNodes] = useState<K8sObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/k8s/nodes', { credentials: 'same-origin' })
        if (res.status === 403) {
          if (!cancelled) setNodes([])
          return
        }
        if (!res.ok) throw new Error('failed to load nodes')
        const data: K8sObject[] = await res.json()
        if (!cancelled) setNodes(Array.isArray(data) ? data : [])
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

  const visible = useMemo(() => nodes.filter((n) => matchesQuery(n, query)), [nodes, query])

  if (loading) return <PageLoading />

  return (
    <PageBody>
      <PageHeader title="Nodes" description={`${visible.length} item${visible.length === 1 ? '' : 's'}`}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" className="h-7 w-48 text-xs" />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>CPU / Memory</TableHead>
              <TableHead>Age</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((node) => {
              const name = objectName(node)
              if (!name) return null
              const ready = nodeReady(node)
              return (
                <TableRow key={name}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell>
                    <Badge variant={ready === 'Ready' ? 'outline' : 'destructive'} className="h-5 px-1.5 text-[10px]">
                      {ready}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{nodeVersion(node)}</TableCell>
                  <TableCell>
                    <MetricsCell scope="node" name={name} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatAge(node.metadata?.creationTimestamp)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="xs" asChild>
                      <Link to={`/nodes/cluster/nodes/${encodeURIComponent(name)}/yaml`}>YAML</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {visible.length === 0 ? <EmptyState>No nodes.</EmptyState> : null}
      </div>
    </PageBody>
  )
}
