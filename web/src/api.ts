export type User = {
  username: string
  displayName?: string
  role: string
  mustChangePassword: boolean
  enabled?: boolean
  permissionSetId?: string
  grants?: Record<string, string[]>
}

export type Member = {
  id: string
  username: string
  displayName: string
  role: string
  mustChangePassword: boolean
  enabled: boolean
  permissionSetId: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export type NamespaceScope = 'all' | 'selected'

export type PermissionSet = {
  id: string
  name: string
  description: string
  builtinTemplate?: string
  grants: Record<string, string[]>
  namespaceScope: NamespaceScope
  namespaces: string[]
  namespaceRegex: string[]
  memberCount?: number
  createdAt?: string
  updatedAt?: string
}

export type CatalogModule = {
  id: string
  label: string
  scope: 'ns' | 'cluster' | 'mixed'
  actions: string[]
  notes?: string
}

export type CatalogGroup = {
  id: string
  title: string
  modules: CatalogModule[]
}

export type AuditLog = {
  id: string
  timestamp?: string
  userId?: string
  username?: string
  role?: string
  ip?: string
  userAgent?: string
  sessionId?: string
  module?: string
  action?: string
  result?: string
  httpStatus?: number
  apiVersion?: string
  kind?: string
  namespace?: string
  name?: string
  path?: string
  method?: string
  details?: Record<string, unknown>
  error?: string
}

export type AuditFilters = {
  from?: string
  to?: string
  username?: string
  module?: string
  action?: string
  result?: string
  namespace?: string
  kind?: string
}

const statusMessages: Record<number, string> = {
  400: 'The request was invalid.',
  401: 'Your session has expired. Sign in again.',
  403: "You don't have permission to do that.",
  404: 'Not found. It may have been deleted.',
  409: 'It already exists or was changed by someone else.',
  429: 'Too many attempts. Wait a moment and try again.',
  503: 'The cluster connection is unavailable.',
}

/** Builds a readable error from an API response: the server message if any, else a status-based fallback. */
export async function readAPIError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: string }
    if (typeof body.error === 'string' && body.error) {
      return capitalize(body.error)
    }
  } catch {
    // ignore non-JSON error bodies
  }
  return statusMessages[res.status] ?? `${capitalize(fallback)} (HTTP ${res.status}).`
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { ...init, credentials: 'same-origin' })
}

/** POSTs JSON (or nothing) and throws a readable error on failure. */
async function postJSON(path: string, body: unknown, fallback: string): Promise<Response> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, fallback))
  }
  return res
}

let sessionWatcherInstalled = false

/**
 * Calls `onExpired` when any API request (other than the auth endpoints) returns 401,
 * so an expired session sends the user back to the login screen instead of failing silently.
 */
export function installSessionWatcher(onExpired: () => void): void {
  if (sessionWatcherInstalled) return
  sessionWatcherInstalled = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const res = await originalFetch(input, init)
    if (res.status === 401) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const path = new URL(url, window.location.origin).pathname
      if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
        onExpired()
      }
    }
    return res
  }
}

function nsPath(namespace: string, module: string, name: string, action: string): string {
  return `/api/k8s/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(module)}/${encodeURIComponent(name)}/${action}`
}

export async function login(username: string, password: string): Promise<User> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 400) {
      throw new Error('Incorrect username or password.')
    }
    throw new Error(await readAPIError(res, 'Sign-in failed'))
  }
  return res.json()
}

export async function me(): Promise<User | null> {
  const res = await apiFetch('/api/auth/me')
  if (!res.ok) {
    return null
  }
  return res.json()
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' })
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await apiFetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Current password is incorrect.')
    }
    throw new Error(await readAPIError(res, 'Password change failed'))
  }
}

export async function listMembers(): Promise<Member[]> {
  const res = await apiFetch('/api/settings/members')
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to list members'))
  }
  return res.json()
}

export async function createMember(data: {
  username: string
  displayName: string
  permissionSetId: string
  password: string
}): Promise<{ user: Member; password: string }> {
  const res = await apiFetch('/api/settings/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to create member'))
  }
  return res.json()
}

export async function updateMember(
  id: string,
  data: {
    displayName?: string
    permissionSetId?: string
    enabled?: boolean
  },
): Promise<Member> {
  const res = await apiFetch(`/api/settings/members/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to update member'))
  }
  return res.json()
}

export async function deleteMember(id: string): Promise<void> {
  const res = await apiFetch(`/api/settings/members/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to delete member'))
  }
}

export async function resetMemberPassword(id: string, password: string): Promise<{ password: string }> {
  const res = await apiFetch(`/api/settings/members/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to reset password'))
  }
  return res.json()
}

export async function listPermissionSets(): Promise<PermissionSet[]> {
  const res = await apiFetch('/api/settings/permission-sets')
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to list permission sets'))
  }
  return res.json()
}

export async function listPermissionSetTemplates(): Promise<PermissionSet[]> {
  const res = await apiFetch('/api/settings/permission-sets/templates')
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to list templates'))
  }
  return res.json()
}

export async function listPermissionSetCatalog(): Promise<CatalogGroup[]> {
  const res = await apiFetch('/api/settings/permission-sets/catalog')
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to load catalog'))
  }
  return res.json()
}

export async function getPermissionSet(id: string): Promise<PermissionSet> {
  const res = await apiFetch(`/api/settings/permission-sets/${id}`)
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to load permission set'))
  }
  return res.json()
}

export async function createPermissionSet(data: {
  name: string
  description: string
  grants?: Record<string, string[]>
  cloneFromTemplate?: string
  namespaceScope?: NamespaceScope
  namespaces?: string[]
  namespaceRegex?: string[]
}): Promise<PermissionSet> {
  const res = await apiFetch('/api/settings/permission-sets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to create permission set'))
  }
  return res.json()
}

export async function updatePermissionSet(
  id: string,
  data: {
    name?: string
    description?: string
    grants?: Record<string, string[]>
    namespaceScope?: NamespaceScope
    namespaces?: string[]
    namespaceRegex?: string[]
  },
): Promise<PermissionSet> {
  const res = await apiFetch(`/api/settings/permission-sets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to update permission set'))
  }
  return res.json()
}

export async function deletePermissionSet(id: string): Promise<void> {
  const res = await apiFetch(`/api/settings/permission-sets/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to delete permission set'))
  }
}

export async function queryAudit(filters: AuditFilters): Promise<AuditLog[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value)
    }
  }
  const qs = params.toString()
  const res = await apiFetch(`/api/settings/audit${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to query audit'))
  }
  return res.json()
}

export async function deleteAuditIds(ids: string[]): Promise<void> {
  const res = await apiFetch('/api/settings/audit', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to delete audit entries'))
  }
}

export async function deleteAuditFilter(filters: AuditFilters): Promise<void> {
  const params = new URLSearchParams({ filter: '1' })
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value)
    }
  }
  const res = await apiFetch(`/api/settings/audit?${params.toString()}`, {
    method: 'DELETE',
    headers: { 'X-Confirm': 'delete' },
  })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to delete audit entries'))
  }
}

export async function cordonNode(name: string): Promise<void> {
  const res = await apiFetch(`/api/k8s/nodes/${encodeURIComponent(name)}/cordon`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to cordon node'))
  }
}

export async function uncordonNode(name: string): Promise<void> {
  const res = await apiFetch(`/api/k8s/nodes/${encodeURIComponent(name)}/uncordon`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to uncordon node'))
  }
}

export async function drainNode(name: string): Promise<void> {
  const res = await apiFetch(`/api/k8s/nodes/${encodeURIComponent(name)}/drain`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to drain node'))
  }
}

export async function scaleK8sResource(
  module: string,
  name: string,
  namespace: string,
  replicas: number,
): Promise<void> {
  await postJSON(nsPath(namespace, module, name, 'scale'), { replicas }, 'Failed to scale resource')
}

export type PodEnvOwner = {
  kind: string
  name: string
}

export async function updateResourceEnv(
  module: 'pods' | 'deployments',
  namespace: string,
  name: string,
  containers: {
    name: string
    kind: string
    env: { name: string; value?: string; valueFrom?: Record<string, unknown> }[]
  }[],
): Promise<PodEnvOwner> {
  const res = await apiFetch(
    `/api/k8s/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(module)}/${encodeURIComponent(name)}/env`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ containers }),
    },
  )
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to update environment'))
  }
  return res.json()
}

export async function updatePodEnv(
  namespace: string,
  name: string,
  containers: {
    name: string
    kind: string
    env: { name: string; value?: string; valueFrom?: Record<string, unknown> }[]
  }[],
): Promise<PodEnvOwner> {
  return updateResourceEnv('pods', namespace, name, containers)
}

export async function restartK8sResource(module: string, name: string, namespace: string): Promise<void> {
  await postJSON(nsPath(namespace, module, name, 'restart'), undefined, 'Failed to restart resource')
}

export async function deleteK8sResource(
  module: string,
  name: string,
  options?: { namespace?: string; clusterScoped?: boolean },
): Promise<void> {
  const path = options?.clusterScoped
    ? `/api/k8s/${encodeURIComponent(module)}/${encodeURIComponent(name)}/delete`
    : nsPath(options?.namespace ?? '', module, name, 'delete')
  await postJSON(path, { confirm: name }, 'Failed to delete resource')
}

export async function rollbackDeployment(namespace: string, name: string, revision: number): Promise<void> {
  await postJSON(nsPath(namespace, 'deployments', name, 'rollback'), { revision }, 'Failed to roll back deployment')
}

export async function triggerCronJob(namespace: string, name: string): Promise<void> {
  await postJSON(nsPath(namespace, 'cronjobs', name, 'trigger'), undefined, 'Failed to start job')
}

export async function createNamespace(name: string): Promise<void> {
  await postJSON('/api/k8s/namespaces', { name }, 'Failed to create namespace')
}

export async function rollbackHelmRelease(name: string, namespace: string, revision?: number): Promise<void> {
  await postJSON(
    `/api/helm/releases/${encodeURIComponent(name)}/rollback`,
    revision ? { namespace, revision } : { namespace },
    'Failed to roll back release',
  )
}

export async function uninstallHelmRelease(name: string, namespace: string): Promise<void> {
  await postJSON(`/api/helm/releases/${encodeURIComponent(name)}/uninstall`, { namespace }, 'Failed to uninstall release')
}

/** GETs JSON and throws a readable error on failure. */
export async function getJSON<T>(path: string, fallback: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) {
    throw new Error(await readAPIError(res, fallback))
  }
  return res.json() as Promise<T>
}
