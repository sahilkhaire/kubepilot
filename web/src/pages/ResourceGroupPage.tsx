import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'

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
    return <p>Loading…</p>
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>{title}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <label style={{ display: 'block', marginBottom: '1rem' }}>
        Namespace{' '}
        <select
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          style={{ marginLeft: '0.5rem' }}
        >
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
      </label>
      {modules.map((spec) => {
        const items = itemsByModule[spec.module] ?? []
        return (
          <section key={spec.module} style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              {spec.label}
              {spec.clusterScoped && <span style={{ color: '#666', fontWeight: 'normal' }}> (cluster)</span>}
            </h2>
            {items.length === 0 ? (
              <EmptyState>No {spec.label.toLowerCase()}.</EmptyState>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const name = item.metadata?.name ?? ''
                    if (!name) return null
                    const itemNs = spec.clusterScoped ? '' : namespace
                    const yamlPath = spec.clusterScoped
                      ? `${basePath}/cluster/${encodeURIComponent(spec.module)}/${encodeURIComponent(name)}/yaml`
                      : `${basePath}/${encodeURIComponent(namespace)}/${encodeURIComponent(spec.module)}/${encodeURIComponent(name)}/yaml`
                    return (
                      <tr key={name}>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{name}</td>
                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                          <Link to={yamlPath}>YAML</Link>
                          {itemNs && <span style={{ color: '#999' }}> · {itemNs}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        )
      })}
    </div>
  )
}
