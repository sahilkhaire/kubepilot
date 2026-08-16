import { useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { ALL_NAMESPACES, isAllNamespaces, NamespaceSelect, resolveNamespaceValue } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { sortBy, useTableSort } from '@/lib/table-sort'

type HelmRelease = {
  name: string
  namespace: string
  revision: number
  chart: string
  status: string
  appVersion?: string
  updated?: string
}

export default function Helm() {
  const user = useUser()
  const canUninstall = can(user, 'helm', 'uninstall')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState(ALL_NAMESPACES)
  const [releases, setReleases] = useState<HelmRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState('')
  const [toUninstall, setToUninstall] = useState<HelmRelease | null>(null)

  async function loadNamespaces() {
    const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
    if (!res.ok) {
      throw new Error('failed to load namespaces')
    }
    const data: string[] = await res.json()
    setNamespaces(data)
    if (data.length > 0) {
      setNamespace((prev) => resolveNamespaceValue(prev, data))
    }
  }

  async function loadReleases(ns: string) {
    const qs = ns ? `?namespace=${encodeURIComponent(ns)}` : ''
    const res = await fetch(`/api/helm/releases${qs}`, { credentials: 'same-origin' })
    if (!res.ok) {
      throw new Error('failed to load releases')
    }
    return res.json() as Promise<HelmRelease[]>
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      setError('')
      try {
        await loadNamespaces()
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
    init()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!namespace) {
      setReleases([])
      return
    }
    let cancelled = false
    async function refresh() {
      setError('')
      try {
        const data = await loadReleases(isAllNamespaces(namespace) ? '' : namespace)
        if (!cancelled) {
          setReleases(data)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      }
    }
    refresh()
    return () => {
      cancelled = true
    }
  }, [namespace])

  const { sort, sortKey, sortDir, onSort } = useTableSort()
  const sorted = useMemo(
    () =>
      sortBy(releases, sort, (rel, key) => {
        switch (key) {
          case 'name':
            return rel.name
          case 'namespace':
            return rel.namespace
          case 'chart':
            return rel.chart
          case 'revision':
            return rel.revision
          case 'status':
            return rel.status
          case 'appVersion':
            return rel.appVersion ?? ''
          default:
            return ''
        }
      }),
    [releases, sort],
  )

  async function onUninstall() {
    if (!toUninstall) return
    const rel = toUninstall
    setPending(rel.name)
    setError('')
    try {
      const res = await fetch(`/api/helm/releases/${encodeURIComponent(rel.name)}/uninstall`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace: rel.namespace }),
      })
      if (!res.ok) {
        throw new Error('uninstall failed')
      }
      setReleases((prev) => prev.filter((r) => r.name !== rel.name || r.namespace !== rel.namespace))
      setToUninstall(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'uninstall failed')
    } finally {
      setPending('')
    }
  }

  if (loading && namespaces.length === 0) {
    return <PageLoading />
  }

  return (
    <PageBody>
      <PageHeader title="Releases" description={`${releases.length} item${releases.length === 1 ? '' : 's'}`}>
        <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="namespace" label="Namespace" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="chart" label="Chart" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="revision" label="Revision" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="appVersion" label="App version" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              {canUninstall ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((rel) => (
              <TableRow key={`${rel.namespace}/${rel.name}`}>
                <TableCell className="font-medium">{rel.name}</TableCell>
                <TableCell className="text-muted-foreground">{rel.namespace}</TableCell>
                <TableCell>{rel.chart}</TableCell>
                <TableCell>{rel.revision}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                    {rel.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{rel.appVersion ?? '—'}</TableCell>
                {canUninstall ? (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={pending === rel.name}
                      onClick={() => setToUninstall(rel)}
                    >
                      {pending === rel.name ? 'Uninstalling…' : 'Uninstall'}
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {sorted.length === 0 && namespace && !error ? (
          <EmptyState>
            {isAllNamespaces(namespace) ? 'No releases.' : 'No releases in this namespace.'}
          </EmptyState>
        ) : null}
      </div>
      <ConfirmDialog
        open={toUninstall != null}
        title="Uninstall release"
        description={
          toUninstall
            ? `Uninstall release "${toUninstall.name}" in namespace "${toUninstall.namespace}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Uninstall"
        destructive
        pending={Boolean(toUninstall && pending === toUninstall.name)}
        onConfirm={onUninstall}
        onCancel={() => setToUninstall(null)}
      />
    </PageBody>
  )
}
