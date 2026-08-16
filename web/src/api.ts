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

async function readAPIError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (typeof body.error === 'string' && body.error) {
      return body.error
    }
  } catch {
    // ignore non-JSON error bodies
  }
  return fallback
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { ...init, credentials: 'same-origin' })
}

export async function login(username: string, password: string): Promise<User> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    throw new Error('invalid credentials')
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
    throw new Error('password change failed')
  }
}

export async function listMembers(): Promise<Member[]> {
  const res = await apiFetch('/api/settings/members')
  if (!res.ok) {
    throw new Error('failed to list members')
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
    throw new Error('failed to create member')
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
    throw new Error('failed to update member')
  }
  return res.json()
}

export async function deleteMember(id: string): Promise<void> {
  const res = await apiFetch(`/api/settings/members/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error('failed to delete member')
  }
}

export async function resetMemberPassword(id: string, password: string): Promise<{ password: string }> {
  const res = await apiFetch(`/api/settings/members/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    throw new Error('failed to reset password')
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
    throw new Error('failed to query audit')
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
    throw new Error('failed to delete audit entries')
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
    throw new Error('failed to delete audit entries')
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
  const res = await apiFetch(
    `/api/k8s/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(module)}/${encodeURIComponent(name)}/scale`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replicas }),
    },
  )
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to scale resource'))
  }
}

export async function restartK8sResource(module: string, name: string, namespace: string): Promise<void> {
  const res = await apiFetch(
    `/api/k8s/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(module)}/${encodeURIComponent(name)}/restart`,
    { method: 'POST' },
  )
  if (!res.ok) {
    throw new Error(await readAPIError(res, 'failed to restart resource'))
  }
}

export async function deleteK8sResource(
  module: string,
  name: string,
  options?: { namespace?: string; clusterScoped?: boolean },
): Promise<void> {
  const clusterScoped = options?.clusterScoped ?? false
  const ns = options?.namespace
  const path = clusterScoped
    ? `/api/k8s/${encodeURIComponent(module)}/${encodeURIComponent(name)}/delete`
    : `/api/k8s/namespaces/${encodeURIComponent(ns!)}/${encodeURIComponent(module)}/${encodeURIComponent(name)}/delete`
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: name }),
  })
  if (!res.ok) {
    throw new Error('failed to delete resource')
  }
}
