import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { logout, me, type User } from './api'
import AccessControl from './pages/AccessControl'
import ChangePassword from './pages/ChangePassword'
import Config from './pages/Config'
import CustomResources from './pages/CustomResources'
import Events from './pages/Events'
import Helm from './pages/Helm'
import Login from './pages/Login'
import Network from './pages/Network'
import Nodes from './pages/Nodes'
import PodExec from './pages/PodExec'
import PodLogs from './pages/PodLogs'
import ResourceYAML from './pages/ResourceYAML'
import WorkloadYAML from './pages/WorkloadYAML'
import SettingsAudit from './pages/SettingsAudit'
import SettingsApp from './pages/SettingsApp'
import SettingsLayout from './pages/SettingsLayout'
import SettingsMembers from './pages/SettingsMembers'
import SettingsSets from './pages/SettingsSets'
import Storage from './pages/Storage'
import Workloads from './pages/Workloads'
import MetricsPanel from './components/MetricsPanel'

function Home({ user }: { user: User }) {
  return (
    <div style={{ maxWidth: '40rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Cluster Console</h1>
      <p>
        <strong>{user.username}</strong> ({user.role})
      </p>
      <MetricsPanel scope="cluster" title="Cluster metrics" />
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
          <Link to="/nodes" style={linkStyle}>Nodes</Link>
          <Link to="/events" style={linkStyle}>Events</Link>
          <Link to="/access" style={linkStyle}>Access Control</Link>
          <Link to="/config" style={linkStyle}>Config</Link>
          <Link to="/network" style={linkStyle}>Network</Link>
          <Link to="/storage" style={linkStyle}>Storage</Link>
          <Link to="/custom-resources" style={linkStyle}>Custom Resources</Link>
          <Link to="/helm" style={linkStyle}>Helm</Link>
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
          <Route path="/workloads/:ns/:resource/:name/yaml" element={<WorkloadYAML />} />
          <Route path="/workloads/:ns/pods/:pod/logs" element={<PodLogs />} />
          <Route path="/workloads/:ns/pods/:pod/exec" element={<PodExec />} />
          <Route path="/nodes" element={<Nodes />} />
          <Route path="/nodes/cluster/:resource/:name/yaml" element={<ResourceYAML backLink="/nodes" backLabel="Nodes" />} />
          <Route path="/events" element={<Events />} />
          <Route path="/access" element={<AccessControl />} />
          <Route path="/access/:ns/:resource/:name/yaml" element={<ResourceYAML backLink="/access" backLabel="Access Control" />} />
          <Route path="/access/cluster/:resource/:name/yaml" element={<ResourceYAML backLink="/access" backLabel="Access Control" />} />
          <Route path="/config" element={<Config />} />
          <Route path="/config/:ns/:resource/:name/yaml" element={<ResourceYAML backLink="/config" backLabel="Config" />} />
          <Route path="/config/cluster/:resource/:name/yaml" element={<ResourceYAML backLink="/config" backLabel="Config" />} />
          <Route path="/network" element={<Network />} />
          <Route path="/network/:ns/:resource/:name/yaml" element={<ResourceYAML backLink="/network" backLabel="Network" />} />
          <Route path="/network/cluster/:resource/:name/yaml" element={<ResourceYAML backLink="/network" backLabel="Network" />} />
          <Route path="/storage" element={<Storage />} />
          <Route path="/storage/:ns/:resource/:name/yaml" element={<ResourceYAML backLink="/storage" backLabel="Storage" />} />
          <Route path="/storage/cluster/:resource/:name/yaml" element={<ResourceYAML backLink="/storage" backLabel="Storage" />} />
          <Route path="/custom-resources" element={<CustomResources />} />
          <Route path="/helm" element={<Helm />} />
          <Route path="/settings" element={<OwnerGuard user={user} />}>
            <Route index element={<Navigate to="members" replace />} />
            <Route path="members" element={<SettingsMembers />} />
            <Route path="sets" element={<SettingsSets />} />
            <Route path="audit" element={<SettingsAudit />} />
            <Route path="app" element={<SettingsApp />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
