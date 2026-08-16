import { useState } from 'react'
import { changePassword } from '../api'

type Props = {
  onChanged: () => void
}

export default function ChangePassword({ onChanged }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      onChanged()
    } catch {
      setError('Password change failed')
    }
  }

  return (
    <main style={{ maxWidth: '24rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Change password</h1>
      <p>You must change your password before continuing.</p>
      <form onSubmit={onSubmit}>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit">Change password</button>
      </form>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}
    </main>
  )
}
