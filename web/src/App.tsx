import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { logout, me, type User } from '@/api'
import { AppShell } from '@/components/app-shell'
import { GrantGuard } from '@/components/grant-guard'
import { UserProvider } from '@/lib/auth-context'
import ChangePassword from '@/pages/ChangePassword'
import CustomResources from '@/pages/CustomResources'
import Events from '@/pages/Events'
import Helm from '@/pages/Helm'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Namespaces from '@/pages/Namespaces'
import Nodes from '@/pages/Nodes'
import PodExec from '@/pages/PodExec'
import PodLogs from '@/pages/PodLogs'
import ResourceListPage from '@/pages/ResourceListPage'
import ResourceYAML from '@/pages/ResourceYAML'
import WorkloadYAML from '@/pages/WorkloadYAML'
import SettingsAudit from '@/pages/SettingsAudit'
import SettingsApp from '@/pages/SettingsApp'
import SettingsLayout from '@/pages/SettingsLayout'
import SettingsMembers from '@/pages/SettingsMembers'
import SettingsSets from '@/pages/SettingsSets'
import Workloads from '@/pages/Workloads'
import { PageLoading } from '@/components/page-loading'

function OwnerGuard({ user }: { user: User }) {
  if (user.role !== 'owner') {
    return <Navigate to="/" replace />
  }
  return <SettingsLayout />
}

function yamlRoutes(base: string, label: string) {
  return (
    <>
      <Route path={`${base}/:ns/:resource/:name/yaml`} element={<ResourceYAML backLink={base} backLabel={label} />} />
      <Route
        path={`${base}/cluster/:resource/:name/yaml`}
        element={<ResourceYAML backLink={base} backLabel={label} />}
      />
    </>
  )
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
    <UserProvider user={user}>
      <BrowserRouter>
        <AppShell user={user} onLogout={onLogout}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/workloads" element={<Navigate to="overview" replace />} />
            <Route
              path="/workloads/overview"
              element={
                <GrantGuard module="workloads.overview">
                  <Workloads />
                </GrantGuard>
              }
            />
            <Route path="/workloads/:resource" element={<ResourceListPage group="workloads" />} />
            <Route path="/workloads/:ns/:resource/:name/yaml" element={<WorkloadYAML />} />
            <Route
              path="/workloads/:ns/pods/:pod/logs"
              element={
                <GrantGuard module="pods" action="logs">
                  <PodLogs />
                </GrantGuard>
              }
            />
            <Route
              path="/workloads/:ns/pods/:pod/exec"
              element={
                <GrantGuard module="pods" action="exec">
                  <PodExec />
                </GrantGuard>
              }
            />
            <Route
              path="/nodes"
              element={
                <GrantGuard module="nodes">
                  <Nodes />
                </GrantGuard>
              }
            />
            <Route path="/nodes/cluster/:resource/:name/yaml" element={<ResourceYAML backLink="/nodes" backLabel="Nodes" />} />
            <Route
              path="/namespaces"
              element={
                <GrantGuard module="namespaces">
                  <Namespaces />
                </GrantGuard>
              }
            />
            {yamlRoutes('/namespaces', 'Namespaces')}
            <Route
              path="/events"
              element={
                <GrantGuard module="events">
                  <Events />
                </GrantGuard>
              }
            />
            <Route path="/config" element={<Navigate to="configmaps" replace />} />
            <Route path="/config/:resource" element={<ResourceListPage group="config" />} />
            {yamlRoutes('/config', 'Config')}
            <Route path="/network" element={<Navigate to="services" replace />} />
            <Route path="/network/:resource" element={<ResourceListPage group="network" />} />
            {yamlRoutes('/network', 'Network')}
            <Route path="/storage" element={<Navigate to="pvcs" replace />} />
            <Route path="/storage/:resource" element={<ResourceListPage group="storage" />} />
            {yamlRoutes('/storage', 'Storage')}
            <Route path="/access" element={<Navigate to="serviceaccounts" replace />} />
            <Route path="/access/:resource" element={<ResourceListPage group="access" />} />
            {yamlRoutes('/access', 'Access Control')}
            <Route path="/custom-resources" element={<Navigate to="definitions" replace />} />
            <Route
              path="/custom-resources/definitions"
              element={
                <GrantGuard module="crds">
                  <CustomResources />
                </GrantGuard>
              }
            />
            <Route path="/helm" element={<Navigate to="releases" replace />} />
            <Route
              path="/helm/releases"
              element={
                <GrantGuard module="helm">
                  <Helm />
                </GrantGuard>
              }
            />
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
    </UserProvider>
  )
}
