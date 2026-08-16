import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { NamespaceSelect } from '@/components/namespace-select'
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

type Pod = {
  metadata?: { name?: string; namespace?: string }
}

export default function Workloads() {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
  const [pods, setPods] = useState<Pod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadNamespaces() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
        if (!res.ok) {
          throw new Error('failed to load namespaces')
        }
        const data: string[] = await res.json()
        if (cancelled) return
        setNamespaces(data)
        if (data.length > 0) {
          setNamespace((prev) => (prev && data.includes(prev) ? prev : data[0]))
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    loadNamespaces()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!namespace) {
      setPods([])
      return
    }
    let cancelled = false
    async function loadPods() {
      setError('')
      try {
        const res = await fetch(`/api/k8s/namespaces/${encodeURIComponent(namespace)}/pods`, {
          credentials: 'same-origin',
        })
        if (!res.ok) {
          throw new Error('failed to load pods')
        }
        const data: Pod[] = await res.json()
        if (!cancelled) {
          setPods(data)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      }
    }
    loadPods()
    return () => {
      cancelled = true
    }
  }, [namespace])

  if (loading && namespaces.length === 0) {
    return <PageLoading />
  }

  return (
    <PageBody>
      <PageHeader title="Workloads" description="Pods in the selected namespace.">
        <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
      </PageHeader>
      <MetricsPanel scope="cluster" title="Cluster metrics" />
      <ErrorAlert message={error} />
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>CPU / Memory</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pods.map((pod) => {
                const name = pod.metadata?.name ?? ''
                if (!name) return null
                return (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      <MetricsCell scope="pod" namespace={namespace} name={name} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/logs`}>
                            Logs
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/exec`}>
                            Exec
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/yaml`}>
                            YAML
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {pods.length === 0 && namespace && !error ? <EmptyState>No pods in this namespace.</EmptyState> : null}
        </CardContent>
      </Card>
    </PageBody>
  )
}
