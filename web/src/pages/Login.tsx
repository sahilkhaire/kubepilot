import { useState } from 'react'
import { login, type User } from '../api'

type Props = {
  onLogin: (user: User) => void
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const u = await login(username, password)
      onLogin(u)
      setPassword('')
    } catch {
      setError('Invalid credentials')
    }
  }

  return (
    <main style={{ maxWidth: '24rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Cluster Console</h1>
      <form onSubmit={onSubmit}>
        <label>
          Username
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit">Log in</button>
      </form>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}
    </main>
  )
}
