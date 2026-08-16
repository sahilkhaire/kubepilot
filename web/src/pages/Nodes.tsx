import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type NodeItem = {
  metadata?: { name?: string }
}

export default function Nodes() {
  const [nodes, setNodes] = useState<NodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/k8s/nodes', { credentials: 'same-origin' })
        if (res.status === 403) {
          if (!cancelled) setNodes([])
          return
        }
        if (!res.ok) {
          throw new Error('failed to load nodes')
        }
        const data: NodeItem[] = await res.json()
        if (!cancelled) setNodes(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p>Loading…</p>
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Nodes</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {nodes.length === 0 ? (
        <p style={{ color: '#666' }}>No nodes.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              const name = node.metadata?.name ?? ''
              if (!name) return null
              return (
                <tr key={name}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{name}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                    <Link to={`/nodes/cluster/nodes/${encodeURIComponent(name)}/yaml`}>YAML</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
