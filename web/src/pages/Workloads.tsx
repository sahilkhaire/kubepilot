import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import MetricsPanel, { MetricsCell } from '../components/MetricsPanel'

type Pod = {
  metadata?: { name?: string; namespace?: string }
}

export default function Workloads() {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
  const [pods, setPods] = useState<Pod[]>([])
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
    if (!namespace) {
      setPods([])
      return
    }
    let cancelled = false
    async function loadPods() {
      setError('')
      try {
        const res = await fetch(`/api/k8s/namespaces/${encodeURIComponent(namespace)}/pods`, {
          credentials: 'same-origin',
        })
        if (!res.ok) {
          throw new Error('failed to load pods')
        }
        const data: Pod[] = await res.json()
        if (!cancelled) {
          setPods(data)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      }
    }
    loadPods()
    return () => {
      cancelled = true
    }
  }, [namespace])

  if (loading && namespaces.length === 0) {
    return <p>Loading…</p>
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Workloads</h1>
      <MetricsPanel scope="cluster" title="Cluster metrics" />
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
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>CPU / Memory</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pods.map((pod) => {
            const name = pod.metadata?.name ?? ''
            if (!name) return null
            return (
              <tr key={name}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{name}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  <MetricsCell scope="pod" namespace={namespace} name={name} />
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/logs`}>
                    Logs
                  </Link>
                  {' · '}
                  <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/exec`}>
                    Exec
                  </Link>
                  {' · '}
                  <Link to={`/workloads/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}/yaml`}>
                    YAML
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {pods.length === 0 && namespace && !error && (
        <EmptyState>No pods in this namespace.</EmptyState>
      )}
    </div>
  )
}
