import { useEffect, useState } from 'react'
import {
  createMember,
  deleteMember,
  listMembers,
  listPermissionSets,
  resetMemberPassword,
  updateMember,
  type Member,
  type PermissionSet,
} from '../api'

function parseNamespaces(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function SettingsMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [sets, setSets] = useState<PermissionSet[]>([])
  const [error, setError] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [loading, setLoading] = useState(true)

  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteSetId, setInviteSetId] = useState('')
  const [inviteNamespaces, setInviteNamespaces] = useState('')

  async function load() {
    setError('')
    try {
      const [m, s] = await Promise.all([listMembers(), listPermissionSets()])
      setMembers(m)
      setSets(s)
      if (!inviteSetId && s.length > 0) {
        setInviteSetId(s[0].id)
      }
    } catch {
      setError('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function dismissPassword() {
    setGeneratedPassword('')
  }

  async function copyPassword() {
    if (!generatedPassword) return
    try {
      await navigator.clipboard.writeText(generatedPassword)
    } catch {
      setError('Failed to copy password')
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const result = await createMember({
        username: inviteUsername,
        displayName: inviteDisplayName,
        permissionSetId: inviteSetId,
        namespaces: parseNamespaces(inviteNamespaces),
      })
      setGeneratedPassword(result.password)
      setInviteUsername('')
      setInviteDisplayName('')
      setInviteNamespaces('')
      await load()
    } catch {
      setError('Failed to invite member')
    }
  }

  async function onResetPassword(id: string) {
    setError('')
    try {
      const result = await resetMemberPassword(id)
      setGeneratedPassword(result.password)
    } catch {
      setError('Failed to reset password')
    }
  }

  async function onToggleEnabled(member: Member) {
    setError('')
    try {
      await updateMember(member.id, { enabled: !member.enabled })
      await load()
    } catch {
      setError('Failed to update member')
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this member?')) return
    setError('')
    try {
      await deleteMember(id)
      await load()
    } catch {
      setError('Failed to delete member')
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}
      {generatedPassword && (
        <div style={{ background: '#f0f0f0', padding: '0.75rem', marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            Generated password (copy now — dismiss to hide):{' '}
            <strong>{generatedPassword}</strong>
          </p>
          <button type="button" onClick={copyPassword}>Copy</button>
          <button type="button" onClick={dismissPassword} style={{ marginLeft: '0.5rem' }}>
            Dismiss
          </button>
        </div>
      )}

      <h2>Invite member</h2>
      <form onSubmit={onInvite} style={{ marginBottom: '2rem' }}>
        <label>
          Username
          <input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} required />
        </label>
        <label>
          Display name
          <input value={inviteDisplayName} onChange={(e) => setInviteDisplayName(e.target.value)} required />
        </label>
        <label>
          Permission set
          <select value={inviteSetId} onChange={(e) => setInviteSetId(e.target.value)} required>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          Namespaces (comma-separated, * allowed)
          <input
            value={inviteNamespaces}
            onChange={(e) => setInviteNamespaces(e.target.value)}
            placeholder="dev, prod or *"
            required
          />
        </label>
        <button type="submit">Invite</button>
      </form>

      <h2>Members</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Username</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Display name</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Namespaces</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Enabled</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td style={{ borderBottom: '1px solid #eee' }}>{m.username}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{m.displayName}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{m.namespaces.join(', ')}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>{m.enabled ? 'yes' : 'no'}</td>
              <td style={{ borderBottom: '1px solid #eee' }}>
                <button type="button" onClick={() => onResetPassword(m.id)}>Reset password</button>
                <button type="button" onClick={() => onToggleEnabled(m)}>
                  {m.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" onClick={() => onDelete(m.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
