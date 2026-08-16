import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

export default function WorkloadYAML() {
  const { ns, resource, name } = useParams<{ ns: string; resource: string; name: string }>()
  const [yaml, setYaml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const gvkForResource = (res: string): string => {
    switch (res) {
      case 'pods':
        return 'v1/Pod'
      case 'deployments':
        return 'apps/v1/Deployment'
      case 'statefulsets':
        return 'apps/v1/StatefulSet'
      case 'daemonsets':
        return 'apps/v1/DaemonSet'
      case 'replicasets':
        return 'apps/v1/ReplicaSet'
      case 'jobs':
        return 'batch/v1/Job'
      case 'cronjobs':
        return 'batch/v1/CronJob'
      default:
        return ''
    }
  }

  useEffect(() => {
    if (!ns || !resource || !name) return
    const gvk = gvkForResource(resource)
    if (!gvk) {
      setError('unsupported resource type')
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ gvk, namespace: ns!, name: name! })
        const res = await fetch(`/api/k8s/yaml?${params}`, { credentials: 'same-origin' })
        if (!res.ok) {
          throw new Error(`failed to load yaml (${res.status})`)
        }
        const text = await res.text()
        if (!cancelled) {
          setYaml(text)
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
  }, [ns, resource, name])

  async function applyYAML() {
    if (!resource) return
    setApplying(true)
    setError('')
    try {
      const res = await fetch(`/api/k8s/yaml/apply?module=${encodeURIComponent(resource)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml }),
      })
      if (!res.ok) {
        throw new Error(`apply failed (${res.status})`)
      }
      setConfirmOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'apply failed')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return <p>Loading…</p>
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/workloads">← Workloads</Link>
      </p>
      <h1>YAML: {resource}/{name}</h1>
      <p style={{ color: '#666' }}>Namespace: {ns}</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <textarea
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        rows={24}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.875rem' }}
      />
      <div style={{ marginTop: '1rem' }}>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={applying}>
          Apply
        </button>
      </div>
      {confirmOpen && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid #ccc',
            background: '#fafafa',
          }}
        >
          <p>Apply this YAML with server-side apply?</p>
          <button type="button" onClick={applyYAML} disabled={applying}>
            {applying ? 'Applying…' : 'Confirm apply'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={applying}
            style={{ marginLeft: '0.5rem' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
