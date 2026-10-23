import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PuzzleIcon } from 'lucide-react'
import { readAPIError } from '@/api'
import { DetailPanel } from '@/components/detail-parts'
import EmptyState from '@/components/EmptyState'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { FilterInput, isAllNamespaces, NamespaceSelect, useNamespaces } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { useUser } from '@/lib/auth-context'
import { formatAge } from '@/lib/k8s-fields'
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
  metadata?: { name?: string; namespace?: string; creationTimestamp?: string }
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
  const { namespaces, namespace, setNamespace } = useNamespaces()
  const [selected, setSelected] = useState<CRDItem | null>(null)
  const [instances, setInstances] = useState<ResourceItem[]>([])
  const [instancesLoaded, setInstancesLoaded] = useState(false)
  const [instancesError, setInstancesError] = useState('')
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
      const crdRes = await fetch('/api/k8s/crds', { credentials: 'same-origin' })
      if (!crdRes.ok) {
        throw new Error(await readAPIError(crdRes, 'Failed to load custom resource definitions'))
      }
      const crdData: CRDItem[] = await crdRes.json()
      setCrds(Array.isArray(crdData) ? crdData : [])
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

  const selectionKey = `${selected?.metadata?.name ?? ''}@${namespace}`
  const selectionKeyRef = useRef(selectionKey)
  selectionKeyRef.current = selectionKey

  useEffect(() => {
    setInstances([])
    setInstancesLoaded(false)
    setInstancesError('')
  }, [selectionKey])

  const loadInstances = useSingleFlight(
    useCallback(async (quiet = false) => {
    const requestKey = selectionKey
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
      if (selectionKeyRef.current !== requestKey) return
      if (!res.ok) {
        throw new Error(await readAPIError(res, 'Failed to load instances'))
      }
      const data: ResourceItem[] = await res.json()
      if (selectionKeyRef.current !== requestKey) return
      setInstances(Array.isArray(data) ? data : [])
      setInstancesError('')
    } catch (e) {
      if (!quiet && selectionKeyRef.current === requestKey) {
        setInstancesError(e instanceof Error ? e.message : 'Load failed')
      }
    } finally {
      if (selectionKeyRef.current === requestKey) setInstancesLoaded(true)
    }
  }, [selected, namespace, selectionKey]),
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
  const selectedName = selected?.metadata?.name ?? ''
  const crdCount = grouped.reduce((n, [, items]) => n + items.length, 0)

  return (
    <PageBody className="relative flex-row gap-0 overflow-hidden p-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PageHeader
          title="Custom resource definitions"
          description={`${crdCount}${query ? ` of ${crds.length}` : ''} CRDs in ${grouped.length} group${grouped.length === 1 ? '' : 's'}`}
        >
          <FilterInput value={query} onChange={setQuery} placeholder="Filter by name or group…" />
        </PageHeader>
        <ErrorAlert message={error} />
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <SerialHead />
                <SortableHead column="name" label="Name" sortKey={crdSort.sortKey} sortDir={crdSort.sortDir} onSort={crdSort.onSort} />
                <SortableHead column="resource" label="Resource" sortKey={crdSort.sortKey} sortDir={crdSort.sortDir} onSort={crdSort.onSort} />
                <TableHead>Version</TableHead>
                <SortableHead column="scope" label="Scope" sortKey={crdSort.sortKey} sortDir={crdSort.sortDir} onSort={crdSort.onSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([group, items], groupIndex) => {
                const start = grouped.slice(0, groupIndex).reduce((n, [, its]) => n + its.length, 0)
                return (
                  <Fragment key={group}>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-muted/50 py-1 text-xs font-medium text-muted-foreground">
                        {group}
                        <span className="ml-1.5 tabular-nums opacity-70">{items.length}</span>
                      </TableCell>
                    </TableRow>
                    {items.map((crd, index) => {
                      const name = crd.metadata?.name ?? ''
                      const isSelected = selectedName === name
                      return (
                        <TableRow
                          key={name}
                          data-state={isSelected ? 'selected' : undefined}
                          className={canViewInstances ? 'cursor-pointer' : undefined}
                          onClick={canViewInstances ? () => setSelected(isSelected ? null : crd) : undefined}
                          title={canViewInstances ? 'Show instances' : undefined}
                        >
                          <SerialCell index={start + index} />
                          <TableCell className="max-w-96 truncate font-medium" title={name}>
                            {name}
                          </TableCell>
                          <TableCell>{crd.spec?.names?.plural ?? ''}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{crdVersion(crd)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                              {crd.spec?.scope ?? ''}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
          {grouped.length === 0 && !error ? (
            <EmptyState>
              {query ? `No definitions match “${query}”.` : 'No custom resource definitions are installed.'}
            </EmptyState>
          ) : null}
        </div>
      </div>

      {selected ? (
        <DetailPanel
          kind="Custom resource"
          name={selectedName}
          icon={PuzzleIcon}
          subtitle={`${selected.spec?.group ?? ''} · ${crdVersion(selected)} · ${selected.spec?.scope ?? ''}`}
          onClose={() => setSelected(null)}
        >
          {namespaced ? (
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-xs text-muted-foreground">Instances</span>
              <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
            </div>
          ) : null}
          <ErrorAlert message={instancesError} />
          <div className="min-h-0 flex-1 overflow-auto">
            {!instancesLoaded ? (
              <div className="p-3">
                <PageLoading compact />
              </div>
            ) : instances.length === 0 ? (
              instancesError ? null : (
                <EmptyState>
                  No instances{namespaced && !isAllNamespaces(namespace) ? ` in ${namespace}` : ''}.
                </EmptyState>
              )
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <SerialHead />
                    <SortableHead column="name" label="Name" sortKey={instanceSort.sortKey} sortDir={instanceSort.sortDir} onSort={instanceSort.onSort} />
                    {namespaced ? (
                      <SortableHead column="namespace" label="Namespace" sortKey={instanceSort.sortKey} sortDir={instanceSort.sortDir} onSort={instanceSort.onSort} />
                    ) : null}
                    <TableHead>Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedInstances.map((item, index) => {
                    const name = item.metadata?.name ?? ''
                    const ns = item.metadata?.namespace ?? ''
                    return (
                      <TableRow key={ns ? `${ns}/${name}` : name}>
                        <SerialCell index={index} />
                        <TableCell className="max-w-64 truncate font-medium" title={name}>
                          {name}
                        </TableCell>
                        {namespaced ? <TableCell className="text-muted-foreground">{ns || '—'}</TableCell> : null}
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatAge(item.metadata?.creationTimestamp)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DetailPanel>
      ) : null}
    </PageBody>
  )
}
