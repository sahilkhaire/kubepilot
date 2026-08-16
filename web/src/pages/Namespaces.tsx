import { useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import ResourceYAMLSheet from '@/components/resource-yaml-sheet'
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
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import type { YAMLTarget } from '@/lib/k8s-yaml'

export default function Namespaces() {
  const user = useUser()
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [yamlTarget, setYamlTarget] = useState<YAMLTarget | null>(null)

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
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setYamlTarget({ module: 'namespaces', name: ns, clusterScoped: true })}
                  >
                    YAML
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length === 0 ? <EmptyState>No namespaces.</EmptyState> : null}
      </div>
      <ResourceYAMLSheet
        target={yamlTarget}
        canEdit={can(user, 'namespaces', 'yaml_edit')}
        canDelete={can(user, 'namespaces', 'delete')}
        onOpenChange={(open) => {
          if (!open) setYamlTarget(null)
        }}
        onDeleted={() => {
          if (yamlTarget) {
            setNamespaces((prev) => prev.filter((ns) => ns !== yamlTarget.name))
          }
        }}
      />
    </PageBody>
  )
}
