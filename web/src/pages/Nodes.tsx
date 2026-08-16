import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import MetricsPanel, { MetricsCell } from '@/components/MetricsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type NodeItem = {
  metadata?: { name?: string }
}

export default function Nodes() {
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        if (!res.ok) {
          throw new Error('failed to load nodes')
        }
        const data: NodeItem[] = await res.json()
        if (!cancelled) setNodes(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <PageLoading />
  }

  return (
    <PageBody>
      <PageHeader title="Nodes" description="Cluster nodes and live CPU / memory." />
      <MetricsPanel scope="cluster" title="Cluster metrics" />
      <ErrorAlert message={error} />
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {nodes.length === 0 ? (
            <EmptyState>No nodes.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>CPU / Memory</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => {
                  const name = node.metadata?.name ?? ''
                  if (!name) return null
                  return (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>
                        <MetricsCell scope="node" name={name} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/nodes/cluster/nodes/${encodeURIComponent(name)}/yaml`}>YAML</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageBody>
  )
}
