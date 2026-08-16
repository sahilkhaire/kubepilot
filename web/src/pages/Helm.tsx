import { useEffect, useState } from 'react'

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

  async function onUninstall(rel: HelmRelease) {
    const ok = window.confirm(`Uninstall release "${rel.name}" in namespace "${rel.namespace}"?`)
    if (!ok) return
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'uninstall failed')
    } finally {
      setPending('')
    }
  }

  if (loading && namespaces.length === 0) {
    return <p>Loading…</p>
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Helm</h1>
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
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Chart</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Revision</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Status</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((rel) => (
            <tr key={`${rel.namespace}/${rel.name}`}>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{rel.name}</td>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{rel.chart}</td>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{rel.revision}</td>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{rel.status}</td>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                <button
                  type="button"
                  disabled={pending === rel.name}
                  onClick={() => onUninstall(rel)}
                >
                  {pending === rel.name ? 'Uninstalling…' : 'Uninstall'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {releases.length === 0 && namespace && <p>No releases in this namespace.</p>}
    </div>
  )
}
