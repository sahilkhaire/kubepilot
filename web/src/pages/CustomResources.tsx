import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { ALL_NAMESPACES, isAllNamespaces, NamespaceSelect, resolveNamespaceValue } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
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
import { sortBy, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'

type CRDItem = {
  metadata?: { name?: string }
  spec?: {
    group?: string
    scope?: string
    names?: { plural?: string }
    versions?: Array<{ name?: string; served?: boolean; storage?: boolean }>
  }
}

type ResourceItem = {
  metadata?: { name?: string; namespace?: string }
}

function crdVersion(crd: CRDItem): string {
  const versions = crd.spec?.versions ?? []
  const stored = versions.find((v) => v.storage)
  if (stored?.name) return stored.name
  const served = versions.find((v) => v.served)
  return served?.name ?? ''
}

export default function CustomResources() {
  const user = useUser()
  const canViewInstances = can(user, 'custom_resources', 'view')
  const [crds, setCrds] = useState<CRDItem[]>([])
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState(ALL_NAMESPACES)
  const [selected, setSelected] = useState<CRDItem | null>(null)
  const [instances, setInstances] = useState<ResourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const loadCatalog = useSingleFlight(
    useCallback(async (initial = false) => {
    if (initial) {
      setLoading(true)
      setError('')
    }
    try {
      const [crdRes, nsRes] = await Promise.all([
        fetch('/api/k8s/crds', { credentials: 'same-origin' }),
        fetch('/api/k8s/namespaces', { credentials: 'same-origin' }),
      ])
      if (!crdRes.ok) {
        throw new Error('failed to load CRDs')
      }
      if (!nsRes.ok) {
        throw new Error('failed to load namespaces')
      }
      const crdData: CRDItem[] = await crdRes.json()
      const nsData: string[] = await nsRes.json()
      setCrds(crdData)
      setNamespaces(nsData)
      if (nsData.length > 0) {
        setNamespace((prev) => resolveNamespaceValue(prev, nsData))
      }
      setError('')
    } catch (e) {
      if (initial) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    } finally {
      if (initial) setLoading(false)
    }
  }, []),
  )

  useEffect(() => {
    void loadCatalog(true)
  }, [loadCatalog])
  useLiveRefresh(() => loadCatalog(false))

  const loadInstances = useSingleFlight(
    useCallback(async (quiet = false) => {
    if (!selected) {
      setInstances([])
      return
    }
    const group = selected.spec?.group ?? ''
    const resource = selected.spec?.names?.plural ?? ''
    const version = crdVersion(selected)
    const namespaced = selected.spec?.scope === 'Namespaced'
    if (!group || !resource || !version) {
      setInstances([])
      return
    }
    try {
      const params = new URLSearchParams({ group, version, resource })
      if (namespaced && namespace && !isAllNamespaces(namespace)) {
        params.set('namespace', namespace)
      }
      const res = await fetch(`/api/k8s/custom-resources?${params}`, { credentials: 'same-origin' })
      if (res.status === 403 || res.status === 404) {
        setInstances([])
        return
      }
      if (!res.ok) {
        throw new Error('failed to load custom resources')
      }
      const data: ResourceItem[] = await res.json()
      setInstances(data)
      setError('')
    } catch (e) {
      if (!quiet) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    }
  }, [selected, namespace]),
  )

  useEffect(() => {
    void loadInstances(false)
  }, [loadInstances])
  useLiveRefresh(() => loadInstances(true), selected != null)

  const crdSort = useTableSort('custom-resources')
  const instanceSort = useTableSort('custom-resource-instances')

  const grouped = useMemo(() => {
    const q = query.toLowerCase()
    const map = new Map<string, CRDItem[]>()
    for (const crd of crds) {
      const name = crd.metadata?.name ?? ''
      const group = crd.spec?.group ?? ''
      const resource = crd.spec?.names?.plural ?? ''
      if (q && !`${name} ${group} ${resource}`.toLowerCase().includes(q)) continue
      const key = group || 'core'
      const list = map.get(key) ?? []
      list.push(crd)
      map.set(key, list)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, items]) => [
        group,
        sortBy(items, crdSort.sort, (crd, key) => {
          switch (key) {
            case 'name':
              return crd.metadata?.name ?? ''
            case 'resource':
              return crd.spec?.names?.plural ?? ''
            case 'scope':
              return crd.spec?.scope ?? ''
            default:
              return ''
          }
        }),
      ] as const)
  }, [crds, query, crdSort.sort])

  const sortedInstances = useMemo(
    () =>
      sortBy(instances, instanceSort.sort, (item, key) =>
        key === 'namespace' ? (item.metadata?.namespace ?? '') : (item.metadata?.name ?? ''),
      ),
    [instances, instanceSort.sort],
  )

  if (loading && crds.length === 0) {
    return <PageLoading />
  }

  const namespaced = selected?.spec?.scope === 'Namespaced'

  return (
    <PageBody>
      <PageHeader title="Definitions" description={`${crds.length} CRDs in ${grouped.length} groups`}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" className="h-7 w-48 text-xs" />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 space-y-0 overflow-auto">
        <div>
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <SerialHead />
              <SortableHead column="name" label="Name" sortKey={crdSort.sortKey} sortDir={crdSort.sortDir} onSort={crdSort.onSort} />
              <SortableHead column="resource" label="Resource" sortKey={crdSort.sortKey} sortDir={crdSort.sortDir} onSort={crdSort.onSort} />
              <SortableHead column="scope" label="Scope" sortKey={crdSort.sortKey} sortDir={crdSort.sortDir} onSort={crdSort.onSort} />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map(([group, items], groupIndex) => {
              const start = grouped.slice(0, groupIndex).reduce((n, [, its]) => n + its.length, 0)
              return (
              <Fragment key={group}>
                <TableRow key={`g-${group}`} className="hover:bg-transparent">
                  <TableCell colSpan={5} className="bg-muted/50 py-1 font-medium text-muted-foreground">
                    {group}
                  </TableCell>
                </TableRow>
                {items.map((crd, index) => {
                  const name = crd.metadata?.name ?? ''
                  const resource = crd.spec?.names?.plural ?? ''
                  const scope = crd.spec?.scope ?? ''
                  const isSelected = selected?.metadata?.name === name
                  return (
                    <TableRow key={name}>
                      <SerialCell index={start + index} />
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{resource}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          {scope}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canViewInstances ? (
                          <Button
                            type="button"
                            variant={isSelected ? 'secondary' : 'ghost'}
                            size="xs"
                            onClick={() => setSelected(isSelected ? null : crd)}
                          >
                            {isSelected ? 'Hide instances' : 'View instances'}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </Fragment>
              )
            })}
          </TableBody>
        </Table>
        {grouped.length === 0 ? <EmptyState>No custom resource definitions.</EmptyState> : null}
        </div>

        {selected ? (
          <div className="border-t">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="text-sm font-medium">Instances — {selected.metadata?.name}</p>
              {namespaced ? (
                <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
              ) : null}
            </div>
            {instances.length === 0 ? (
              <EmptyState>No instances.</EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SerialHead />
                    <SortableHead column="name" label="Name" sortKey={instanceSort.sortKey} sortDir={instanceSort.sortDir} onSort={instanceSort.onSort} />
                    <SortableHead column="namespace" label="Namespace" sortKey={instanceSort.sortKey} sortDir={instanceSort.sortDir} onSort={instanceSort.onSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedInstances.map((item, index) => {
                    const name = item.metadata?.name ?? ''
                    const ns = item.metadata?.namespace ?? ''
                    return (
                      <TableRow key={ns ? `${ns}/${name}` : name}>
                        <SerialCell index={index} />
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{ns || '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}
      </div>
    </PageBody>
  )
}
