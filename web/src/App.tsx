import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { logout, me, type User } from '@/api'
import { AppShell } from '@/components/app-shell'
import AccessControl from '@/pages/AccessControl'
import ChangePassword from '@/pages/ChangePassword'
import Config from '@/pages/Config'
import CustomResources from '@/pages/CustomResources'
import Events from '@/pages/Events'
import Helm from '@/pages/Helm'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Network from '@/pages/Network'
import Nodes from '@/pages/Nodes'
import PodExec from '@/pages/PodExec'
import PodLogs from '@/pages/PodLogs'
import ResourceYAML from '@/pages/ResourceYAML'
import WorkloadYAML from '@/pages/WorkloadYAML'
import SettingsAudit from '@/pages/SettingsAudit'
import SettingsApp from '@/pages/SettingsApp'
import SettingsLayout from '@/pages/SettingsLayout'
import SettingsMembers from '@/pages/SettingsMembers'
import SettingsSets from '@/pages/SettingsSets'
import Storage from '@/pages/Storage'
import Workloads from '@/pages/Workloads'
import { PageLoading } from '@/components/page-loading'

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
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40">
        <PageLoading />
      </div>
    )
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
