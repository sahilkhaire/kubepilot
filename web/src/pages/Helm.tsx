import { useEffect, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorAlert } from '@/components/error-alert'
import { NamespaceSelect } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
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
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
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
      setNamespace((prev) => (prev && data.includes(prev) ? prev : data[0]))
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
        const data = await loadReleases(namespace)
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
      <PageHeader title="Helm" description="Releases in the selected namespace.">
        <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
      </PageHeader>
      <ErrorAlert message={error} />
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Chart</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((rel) => (
                <TableRow key={`${rel.namespace}/${rel.name}`}>
                  <TableCell className="font-medium">{rel.name}</TableCell>
                  <TableCell>{rel.chart}</TableCell>
                  <TableCell>{rel.revision}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {rel.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pending === rel.name}
                      onClick={() => setToUninstall(rel)}
                    >
                      {pending === rel.name ? 'Uninstalling…' : 'Uninstall'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {releases.length === 0 && namespace && !error ? (
            <EmptyState>No releases in this namespace.</EmptyState>
          ) : null}
        </CardContent>
      </Card>
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
