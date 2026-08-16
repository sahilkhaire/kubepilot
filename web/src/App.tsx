import { useEffect, useState } from 'react'
import { login, logout, me, type User } from './api'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    me().then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const u = await login(username, password)
      setUser(u)
      setPassword('')
    } catch {
      setError('Invalid credentials')
    }
  }

  async function onLogout() {
    await logout()
    setUser(null)
    setUsername('')
    setPassword('')
    setError('')
  }

  if (loading) {
    return <p>Loading…</p>
  }

  if (user) {
    return (
      <main style={{ maxWidth: '24rem', margin: '2rem auto', padding: '0 1rem' }}>
        <h1>Cluster Console</h1>
        <p>
          <strong>{user.username}</strong> ({user.role})
        </p>
        <button type="button" onClick={onLogout}>Log out</button>
      </main>
    )
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
