import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { logout, me, type User } from './api'
import ChangePassword from './pages/ChangePassword'
import Login from './pages/Login'
import PodLogs from './pages/PodLogs'
import SettingsAudit from './pages/SettingsAudit'
import SettingsLayout from './pages/SettingsLayout'
import SettingsMembers from './pages/SettingsMembers'
import SettingsSets from './pages/SettingsSets'
import Workloads from './pages/Workloads'

function Home({ user }: { user: User }) {
  return (
    <div style={{ maxWidth: '24rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Cluster Console</h1>
      <p>
        <strong>{user.username}</strong> ({user.role})
      </p>
    </div>
  )
}

function AppShell({
  user,
  onLogout,
  children,
}: {
  user: User
  onLogout: () => void
  children: React.ReactNode
}) {
  const linkStyle = { display: 'block', marginBottom: '0.75rem', textDecoration: 'none', color: '#0366d6' }
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: '11rem',
          borderRight: '1px solid #ccc',
          padding: '1rem',
          background: '#f8f8f8',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '1rem' }}>Cluster Console</div>
        <nav>
          <Link to="/" style={linkStyle}>Home</Link>
          <Link to="/workloads" style={linkStyle}>Workloads</Link>
          {user.role === 'owner' && (
            <Link to="/settings/members" style={linkStyle}>Settings</Link>
          )}
        </nav>
        <button type="button" onClick={onLogout} style={{ marginTop: '1rem' }}>
          Log out
        </button>
      </aside>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
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
    me()
      .then((u) => {
        setUser(u)
      })
      .catch(() => {
        setUser(null)
      })
      .finally(() => {
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
      <AppShell user={user} onLogout={onLogout}>
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/workloads" element={<Workloads />} />
          <Route path="/workloads/:ns/pods/:pod/logs" element={<PodLogs />} />
          <Route path="/settings" element={<OwnerGuard user={user} />}>
            <Route index element={<Navigate to="members" replace />} />
            <Route path="members" element={<SettingsMembers />} />
            <Route path="sets" element={<SettingsSets />} />
            <Route path="audit" element={<SettingsAudit />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
