import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { logout, me, type User } from './api'
import ChangePassword from './pages/ChangePassword'
import Login from './pages/Login'
import SettingsAudit from './pages/SettingsAudit'
import SettingsLayout from './pages/SettingsLayout'
import SettingsMembers from './pages/SettingsMembers'
import SettingsSets from './pages/SettingsSets'

function Home({ user }: { user: User }) {
  return (
    <main style={{ maxWidth: '24rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Cluster Console</h1>
      <p>
        <strong>{user.username}</strong> ({user.role})
      </p>
    </main>
  )
}

function AppNav({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
      <Link to="/" style={{ marginRight: '1rem' }}>Home</Link>
      {user.role === 'owner' && (
        <Link to="/settings/members" style={{ marginRight: '1rem' }}>Settings</Link>
      )}
      <button type="button" onClick={onLogout}>Log out</button>
    </nav>
  )
}

function OwnerGuard({ user }: { user: User }) {
  if (user.role !== 'owner') {
    return <Navigate to="/" replace />
  }
  return <SettingsLayout />
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    me().then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  async function onLogout() {
    await logout()
    setUser(null)
  }

  async function refreshUser() {
    const u = await me()
    setUser(u)
  }

  if (loading) {
    return <p>Loading…</p>
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  if (user.role === 'member' && user.mustChangePassword) {
    return <ChangePassword onChanged={refreshUser} />
  }

  return (
    <BrowserRouter>
      <AppNav user={user} onLogout={onLogout} />
      <Routes>
        <Route path="/" element={<Home user={user} />} />
        <Route path="/settings" element={<OwnerGuard user={user} />}>
          <Route index element={<Navigate to="members" replace />} />
          <Route path="members" element={<SettingsMembers />} />
          <Route path="sets" element={<SettingsSets />} />
          <Route path="audit" element={<SettingsAudit />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
