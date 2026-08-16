import { useEffect, useState } from 'react'
import {
  createPermissionSet,
  deletePermissionSet,
  listPermissionSets,
  updatePermissionSet,
  type PermissionSet,
} from '../api'
import EmptyState from '../components/EmptyState'

type CreateMode = 'template' | 'custom'

export default function SettingsSets() {
  const [sets, setSets] = useState<PermissionSet[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode>('template')
  const [createTemplate, setCreateTemplate] = useState('viewer')
  const [createGrantsJson, setCreateGrantsJson] = useState('{"pods":["view"]}')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  async function load() {
    setError('')
    try {
      setSets(await listPermissionSets())
    } catch {
      setError('Failed to load permission sets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (createMode === 'template') {
        await createPermissionSet({
          name: createName,
          description: createDescription,
          cloneFromTemplate: createTemplate,
        })
      } else {
        const grants = JSON.parse(createGrantsJson) as Record<string, string[]>
        await createPermissionSet({
          name: createName,
          description: createDescription,
          grants,
        })
      }
      setCreateName('')
      setCreateDescription('')
      await load()
    } catch {
      setError('Failed to create permission set')
    }
  }

  function startEdit(ps: PermissionSet) {
    setEditingId(ps.id)
    setEditName(ps.name)
    setEditDescription(ps.description)
  }

  async function onSaveEdit(id: string) {
    setError('')
    try {
      await updatePermissionSet(id, { name: editName, description: editDescription })
      setEditingId(null)
      await load()
    } catch {
      setError('Failed to update permission set')
    }
  }

  async function onDelete(ps: PermissionSet) {
    if (!confirm(`Delete permission set "${ps.name}"? This cannot be undone.`)) return
    setError('')
    try {
      await deletePermissionSet(ps.id)
      await load()
    } catch {
      setError('Failed to delete permission set')
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      <h2>Create permission set</h2>
      <form onSubmit={onCreate} style={{ marginBottom: '2rem' }}>
        <label>
          Name
          <input value={createName} onChange={(e) => setCreateName(e.target.value)} required />
        </label>
        <label>
          Description
          <input value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
        </label>
        <label>
          Source
          <select value={createMode} onChange={(e) => setCreateMode(e.target.value as CreateMode)}>
            <option value="template">Clone from template</option>
            <option value="custom">Custom grants (JSON)</option>
          </select>
        </label>
        {createMode === 'template' ? (
          <label>
            Template
            <select value={createTemplate} onChange={(e) => setCreateTemplate(e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        ) : (
          <label>
            Grants JSON
            <textarea
              value={createGrantsJson}
              onChange={(e) => setCreateGrantsJson(e.target.value)}
              rows={4}
              style={{ width: '100%' }}
              required
            />
          </label>
        )}
        <button type="submit">Create</button>
      </form>

      <h2>Permission sets</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Name</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Description</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((ps) => (
            <tr key={ps.id}>
              <td style={{ borderBottom: '1px solid #eee' }}>
                {editingId === ps.id ? (
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  ps.name
                )}
              </td>
              <td style={{ borderBottom: '1px solid #eee' }}>
                {editingId === ps.id ? (
                  <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                ) : (
                  ps.description
                )}
              </td>
              <td style={{ borderBottom: '1px solid #eee' }}>
                {editingId === ps.id ? (
                  <>
                    <button type="button" onClick={() => onSaveEdit(ps.id)}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => startEdit(ps)}>Edit</button>
                    <button type="button" onClick={() => onDelete(ps)}>Delete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sets.length === 0 && <EmptyState>No permission sets yet.</EmptyState>}
    </div>
  )
}
