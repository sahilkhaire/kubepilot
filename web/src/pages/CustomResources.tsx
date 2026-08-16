import { useEffect, useState } from 'react'

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
    return <p>Loading…</p>
  }

  const namespaced = selected?.spec?.scope === 'Namespaced'

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Custom Resources</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>CRD definitions</h2>
        {crds.length === 0 ? (
          <p style={{ color: '#666' }}>No custom resource definitions.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Group</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Resource</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Scope</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {crds.map((crd) => {
                const name = crd.metadata?.name ?? ''
                const group = crd.spec?.group ?? ''
                const resource = crd.spec?.names?.plural ?? ''
                const scope = crd.spec?.scope ?? ''
                const isSelected = selected?.metadata?.name === name
                return (
                  <tr key={name}>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{name}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{group}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{resource}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{scope}</td>
                    <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                      <button
                        type="button"
                        onClick={() => setSelected(isSelected ? null : crd)}
                        style={{ cursor: 'pointer' }}
                      >
                        {isSelected ? 'Hide instances' : 'View instances'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <section>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            Instances — {selected.metadata?.name}
          </h2>
          {namespaced && (
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
          )}
          {instances.length === 0 ? (
            <p style={{ color: '#666' }}>No instances.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Namespace</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((item) => {
                  const name = item.metadata?.name ?? ''
                  const ns = item.metadata?.namespace ?? ''
                  return (
                    <tr key={ns ? `${ns}/${name}` : name}>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{name}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{ns || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  )
}
