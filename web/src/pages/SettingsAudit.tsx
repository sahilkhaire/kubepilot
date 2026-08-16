import { useEffect, useState } from 'react'
import {
  deleteAuditFilter,
  deleteAuditIds,
  queryAudit,
  type AuditFilters,
  type AuditLog,
} from '../api'

function toRFC3339(datetimeLocal: string): string | undefined {
  if (!datetimeLocal) return undefined
  const d = new Date(datetimeLocal)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export default function SettingsAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [fromLocal, setFromLocal] = useState('')
  const [toLocal, setToLocal] = useState('')
  const [username, setUsername] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [result, setResult] = useState('')
  const [namespace, setNamespace] = useState('')
  const [kind, setKind] = useState('')

  function buildFilters(): AuditFilters {
    return {
      from: toRFC3339(fromLocal),
      to: toRFC3339(toLocal),
      username: username || undefined,
      module: module || undefined,
      action: action || undefined,
      result: result || undefined,
      namespace: namespace || undefined,
      kind: kind || undefined,
    }
  }

  async function load() {
    setError('')
    try {
      const data = await queryAudit(buildFilters())
      setLogs(data)
      setSelected(new Set())
    } catch {
      setError('Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function onFilterSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    load()
  }

  function onClearFilters() {
    setFromLocal('')
    setToLocal('')
    setUsername('')
    setModule('')
    setAction('')
    setResult('')
    setNamespace('')
    setKind('')
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === logs.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(logs.map((l) => l.id)))
    }
  }

  async function onDeleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} audit entries?`)) return
    setError('')
    try {
      await deleteAuditIds([...selected])
      await load()
    } catch {
      setError('Failed to delete audit entries')
    }
  }

  async function onDeleteFilter() {
    if (!confirm('Delete all entries matching the current filter?')) return
    setError('')
    try {
      await deleteAuditFilter(buildFilters())
      await load()
    } catch {
      setError('Failed to delete audit entries')
    }
  }

  if (loading && logs.length === 0) return <p>Loading…</p>

  return (
    <div>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      <h2>Filters</h2>
      <form onSubmit={onFilterSubmit} style={{ marginBottom: '1rem' }}>
        <label>
          From
          <input type="datetime-local" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
        </label>
        <label>
          To
          <input type="datetime-local" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
        </label>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Module
          <input value={module} onChange={(e) => setModule(e.target.value)} />
        </label>
        <label>
          Action
          <input value={action} onChange={(e) => setAction(e.target.value)} />
        </label>
        <label>
          Result
          <input value={result} onChange={(e) => setResult(e.target.value)} />
        </label>
        <label>
          Namespace
          <input value={namespace} onChange={(e) => setNamespace(e.target.value)} />
        </label>
        <label>
          Kind
          <input value={kind} onChange={(e) => setKind(e.target.value)} />
        </label>
        <button type="submit">Apply</button>
        <button type="button" onClick={onClearFilters}>Clear</button>
      </form>

      <div style={{ marginBottom: '1rem' }}>
        <button type="button" onClick={onDeleteSelected} disabled={selected.size === 0}>
          Delete selected ({selected.size})
        </button>
        <button type="button" onClick={onDeleteFilter}>Delete matching filter</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '1px solid #ccc' }}>
              <input
                type="checkbox"
                checked={logs.length > 0 && selected.size === logs.length}
                onChange={toggleAll}
              />
            </th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Time</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>User</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Module</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Action</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Result</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Path</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td style={{ borderBottom: '1px solid #eee' }}>
                <input
                  type="checkbox"
                  checked={selected.has(log.id)}
                  onChange={() => toggleSelect(log.id)}
                />
              </td>
              <td style={{ borderBottom: '1px solid #eee' }}>{log.timestamp ?? ''}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{log.username ?? ''}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{log.module ?? ''}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{log.action ?? ''}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{log.result ?? ''}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{log.path ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p>No audit entries.</p>}
    </div>
  )
}
