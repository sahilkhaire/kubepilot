import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { NamespaceSelect } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ResourceItem = {
  metadata?: { name?: string; namespace?: string }
}

type ModuleSpec = {
  module: string
  label: string
  clusterScoped?: boolean
}

type ResourceGroupPageProps = {
  title: string
  basePath: string
  modules: ModuleSpec[]
}

export default function ResourceGroupPage({ title, basePath, modules }: ResourceGroupPageProps) {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
  const [itemsByModule, setItemsByModule] = useState<Record<string, ResourceItem[]>>({})
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
    let cancelled = false
    async function loadResources() {
      setError('')
      const next: Record<string, ResourceItem[]> = {}
      for (const spec of modules) {
        try {
          const path = spec.clusterScoped
            ? `/api/k8s/${encodeURIComponent(spec.module)}`
            : `/api/k8s/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(spec.module)}`
          if (!spec.clusterScoped && !namespace) {
            next[spec.module] = []
            continue
          }
          const res = await fetch(path, { credentials: 'same-origin' })
          if (res.status === 403 || res.status === 404) {
            next[spec.module] = []
            continue
          }
          if (!res.ok) {
            throw new Error(`failed to load ${spec.module}`)
          }
          const data: ResourceItem[] = await res.json()
          next[spec.module] = data
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'load failed')
          }
          return
        }
      }
      if (!cancelled) {
        setItemsByModule(next)
      }
    }
    loadResources()
    return () => {
      cancelled = true
    }
  }, [namespace, modules])

  if (loading && namespaces.length === 0) {
    return <PageLoading />
  }

  return (
    <PageBody>
      <PageHeader title={title} description={`Resources grouped by kind.`}>
        <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
      </PageHeader>
      <ErrorAlert message={error} />
      {modules.map((spec) => {
        const items = itemsByModule[spec.module] ?? []
        return (
          <Card key={spec.module} className="shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{spec.label}</CardTitle>
              {spec.clusterScoped ? <Badge variant="outline">cluster</Badge> : null}
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <EmptyState>No {spec.label.toLowerCase()}.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const name = item.metadata?.name ?? ''
                      if (!name) return null
                      const itemNs = spec.clusterScoped ? '' : namespace
                      const yamlPath = spec.clusterScoped
                        ? `${basePath}/cluster/${encodeURIComponent(spec.module)}/${encodeURIComponent(name)}/yaml`
                        : `${basePath}/${encodeURIComponent(namespace)}/${encodeURIComponent(spec.module)}/${encodeURIComponent(name)}/yaml`
                      return (
                        <TableRow key={name}>
                          <TableCell className="font-medium">
                            {name}
                            {itemNs ? <span className="ml-2 text-muted-foreground">{itemNs}</span> : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={yamlPath}>YAML</Link>
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
        )
      })}
    </PageBody>
  )
}
