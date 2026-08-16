import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import ResourceYAMLSheet from '@/components/resource-yaml-sheet'
import { SortableHead } from '@/components/sortable-head'
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
  SerialHead,
  SerialCell,
} from '@/components/ui/table'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import { sortBy, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
import type { YAMLTarget } from '@/lib/k8s-yaml'

export default function Namespaces() {
  const user = useUser()
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [yamlTarget, setYamlTarget] = useState<YAMLTarget | null>(null)

  const load = useSingleFlight(
    useCallback(async (initial = false) => {
    if (initial) {
      setLoading(true)
      setError('')
    }
    try {
      const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('failed to load namespaces')
      const data: string[] = await res.json()
      setNamespaces(data)
      setError('')
    } catch (e) {
      if (initial) setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      if (initial) setLoading(false)
    }
  }, []),
  )

  useEffect(() => {
    void load(true)
  }, [load])
  useLiveRefresh(() => load(false))

  const visible = useMemo(() => {
    const q = query.toLowerCase()
    return namespaces.filter((ns) => !q || ns.toLowerCase().includes(q))
  }, [namespaces, query])
  const { sort, sortKey, sortDir, onSort } = useTableSort('namespaces')
  const sorted = useMemo(() => sortBy(visible, sort, (ns) => ns), [visible, sort])

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
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <SerialHead />
              <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ns, index) => (
              <TableRow key={ns}>
                <SerialCell index={index} />
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
        {sorted.length === 0 ? <EmptyState>No namespaces.</EmptyState> : null}
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
