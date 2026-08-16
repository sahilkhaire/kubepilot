import { useEffect, useState } from 'react'
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
  const [crds, setCrds] = useState<CRDItem[]>([])
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
  const [selected, setSelected] = useState<CRDItem | null>(null)
  const [instances, setInstances] = useState<ResourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
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
        if (cancelled) return
        setCrds(crdData)
        setNamespaces(nsData)
        if (nsData.length > 0) {
          setNamespace((prev) => (prev && nsData.includes(prev) ? prev : nsData[0]))
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
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
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

    let cancelled = false
    async function loadInstances() {
      setError('')
      try {
        const params = new URLSearchParams({ group, version, resource })
        if (namespaced && namespace) {
          params.set('namespace', namespace)
        }
        const res = await fetch(`/api/k8s/custom-resources?${params}`, { credentials: 'same-origin' })
        if (res.status === 403 || res.status === 404) {
          if (!cancelled) setInstances([])
          return
        }
        if (!res.ok) {
          throw new Error('failed to load custom resources')
        }
        const data: ResourceItem[] = await res.json()
        if (!cancelled) {
          setInstances(data)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      }
    }
    loadInstances()
    return () => {
      cancelled = true
    }
  }, [selected, namespace])

  if (loading && crds.length === 0) {
    return <PageLoading />
  }

  const namespaced = selected?.spec?.scope === 'Namespaced'

  return (
    <PageBody>
      <PageHeader title="Custom Resources" description="CRD definitions and instances." />
      <ErrorAlert message={error} />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">CRD definitions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {crds.length === 0 ? (
            <EmptyState>No custom resource definitions.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crds.map((crd) => {
                  const name = crd.metadata?.name ?? ''
                  const group = crd.spec?.group ?? ''
                  const resource = crd.spec?.names?.plural ?? ''
                  const scope = crd.spec?.scope ?? ''
                  const isSelected = selected?.metadata?.name === name
                  return (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{group}</TableCell>
                      <TableCell>{resource}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{scope}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant={isSelected ? 'secondary' : 'ghost'} size="sm" onClick={() => setSelected(isSelected ? null : crd)}>
                          {isSelected ? 'Hide instances' : 'View instances'}
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

      {selected ? (
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Instances — {selected.metadata?.name}</CardTitle>
            {namespaced ? (
              <NamespaceSelect namespaces={namespaces} value={namespace} onChange={setNamespace} />
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {instances.length === 0 ? (
              <EmptyState>No instances.</EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Namespace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.map((item) => {
                    const name = item.metadata?.name ?? ''
                    const ns = item.metadata?.namespace ?? ''
                    return (
                      <TableRow key={ns ? `${ns}/${name}` : name}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{ns || '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageBody>
  )
}
