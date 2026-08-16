export type K8sObject = {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
}

export function formatAge(iso?: string): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function objectName(obj: K8sObject): string {
  return obj.metadata?.name ?? ''
}

export function objectNamespace(obj: K8sObject): string {
  return obj.metadata?.namespace ?? ''
}

export function podPhase(obj: K8sObject): string {
  return str(obj.status?.phase) || 'Unknown'
}

export function podNode(obj: K8sObject): string {
  return str(obj.spec?.nodeName)
}

export function podRestarts(obj: K8sObject): number {
  const statuses = obj.status?.containerStatuses
  if (!Array.isArray(statuses)) return 0
  return statuses.reduce((sum, c) => {
    const row = c as { restartCount?: number }
    return sum + (row.restartCount ?? 0)
  }, 0)
}

export function podReady(obj: K8sObject): string {
  const statuses = obj.status?.containerStatuses
  if (!Array.isArray(statuses) || statuses.length === 0) return '—'
  const ready = statuses.filter((c) => Boolean((c as { ready?: boolean }).ready)).length
  return `${ready}/${statuses.length}`
}

export function daemonReady(obj: K8sObject): string {
  const ready = num(obj.status?.numberReady) ?? 0
  const desired = num(obj.status?.desiredNumberScheduled) ?? 0
  return `${ready}/${desired}`
}

export function replicaReady(obj: K8sObject): string {
  const ready = num(obj.status?.readyReplicas) ?? 0
  const desired = num(obj.spec?.replicas) ?? num(obj.status?.replicas) ?? 0
  return `${ready}/${desired}`
}

export function jobCompletions(obj: K8sObject): string {
  const succeeded = num(obj.status?.succeeded) ?? 0
  const completions = num((obj.spec?.completions as number | undefined) ?? undefined) ?? 1
  return `${succeeded}/${completions}`
}

export function serviceType(obj: K8sObject): string {
  return str(obj.spec?.type) || 'ClusterIP'
}

export function serviceClusterIP(obj: K8sObject): string {
  return str(obj.spec?.clusterIP) || '—'
}

export function pvcStatus(obj: K8sObject): string {
  return str(obj.status?.phase) || '—'
}

export function pvcStorage(obj: K8sObject): string {
  const resources = obj.spec?.resources as { requests?: { storage?: string } } | undefined
  return resources?.requests?.storage ?? '—'
}

export function nodeReady(obj: K8sObject): string {
  const conditions = obj.status?.conditions
  if (!Array.isArray(conditions)) return 'Unknown'
  const ready = conditions.find((c) => (c as { type?: string }).type === 'Ready') as
    | { status?: string }
    | undefined
  return ready?.status === 'True' ? 'Ready' : 'NotReady'
}

export function nodeVersion(obj: K8sObject): string {
  const info = obj.status?.nodeInfo as { kubeletVersion?: string } | undefined
  return info?.kubeletVersion ?? '—'
}

export function nodeUnschedulable(obj: K8sObject): boolean {
  return obj.spec?.unschedulable === true
}

export function nodeTaintCount(obj: K8sObject): number {
  const taints = obj.spec?.taints
  return Array.isArray(taints) ? taints.length : 0
}

export function nodeRoles(obj: K8sObject): string {
  const labels = obj.metadata?.labels ?? {}
  const roles: string[] = []
  for (const [key, value] of Object.entries(labels)) {
    if (key.startsWith('node-role.kubernetes.io/')) {
      const role = key.slice('node-role.kubernetes.io/'.length)
      if (role) roles.push(role)
    } else if (key === 'kubernetes.io/role' && value) {
      roles.push(value)
    }
  }
  return roles.length > 0 ? [...new Set(roles)].join(', ') : 'node'
}

export function nodeInternalIP(obj: K8sObject): string {
  const addresses = obj.status?.addresses
  if (!Array.isArray(addresses)) return ''
  const internal = addresses.find((a) => (a as { type?: string }).type === 'InternalIP') as
    | { address?: string }
    | undefined
  return internal?.address ?? ''
}

export function nodeConditionLabels(obj: K8sObject): { text: string; ok: boolean }[] {
  const ready = nodeReady(obj)
  const out = [{ text: ready, ok: ready === 'Ready' }]
  if (nodeUnschedulable(obj)) {
    out.push({ text: 'SchedulingDisabled', ok: false })
  }
  return out
}

export function objectLabels(obj: K8sObject): Record<string, string> {
  return obj.metadata?.labels ?? {}
}

export function objectAnnotations(obj: K8sObject): Record<string, string> {
  return obj.metadata?.annotations ?? {}
}

export function nodeAddresses(obj: K8sObject): { type: string; address: string }[] {
  const addresses = obj.status?.addresses
  if (!Array.isArray(addresses)) return []
  return addresses
    .map((a) => {
      const row = a as { type?: string; address?: string }
      return { type: row.type ?? '', address: row.address ?? '' }
    })
    .filter((a) => a.type && a.address)
}

export type NodeInfo = {
  osImage: string
  kernelVersion: string
  containerRuntimeVersion: string
  kubeletVersion: string
  operatingSystem: string
  architecture: string
}

export function nodeInfo(obj: K8sObject): NodeInfo {
  const info = (obj.status?.nodeInfo ?? {}) as Partial<NodeInfo>
  return {
    osImage: info.osImage ?? '—',
    kernelVersion: info.kernelVersion ?? '—',
    containerRuntimeVersion: info.containerRuntimeVersion ?? '—',
    kubeletVersion: info.kubeletVersion ?? '—',
    operatingSystem: info.operatingSystem ?? '—',
    architecture: info.architecture ?? '—',
  }
}

export function nodeResourceMap(obj: K8sObject, field: 'capacity' | 'allocatable'): Record<string, string> {
  const raw = obj.status?.[field]
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export function k8sQuantityNumber(raw?: string): number {
  if (!raw || raw === '—') return Number.NEGATIVE_INFINITY
  const match = /^([0-9.]+)([A-Za-z]*)$/.exec(raw.trim())
  if (!match) return Number.NEGATIVE_INFINITY
  const value = Number(match[1])
  const unit = match[2]
  if (Number.isNaN(value)) return Number.NEGATIVE_INFINITY
  if (unit === 'm') return value / 1000
  const mul: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    K: 1000,
    M: 1e6,
    G: 1e9,
    T: 1e12,
  }
  const factor = mul[unit]
  return factor ? value * factor : value
}

export function formatK8sQuantity(raw?: string): string {
  if (!raw) return '—'
  const bytes = k8sQuantityNumber(raw)
  if (bytes === Number.NEGATIVE_INFINITY) return raw
  const match = /^([0-9.]+)([A-Za-z]*)$/.exec(raw)
  const unit = match?.[2] ?? ''
  if (unit === 'm') {
    const cores = bytes
    return Number.isInteger(cores) ? String(cores) : cores.toFixed(2)
  }
  if (!unit || !(unit in { Ki: 1, Mi: 1, Gi: 1, Ti: 1, K: 1, M: 1, G: 1, T: 1 })) {
    return raw
  }
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`
  return `${bytes.toFixed(0)} B`
}

export const nodeResourceColumns = [
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: 'Memory' },
  { key: 'ephemeral-storage', label: 'Ephemeral Storage' },
  { key: 'pods', label: 'Pods' },
] as const

export function ingressClass(obj: K8sObject): string {
  return str(obj.spec?.ingressClassName) || '—'
}

export function hpaReplicas(obj: K8sObject): string {
  const current = num(obj.status?.currentReplicas) ?? 0
  const min = num(obj.spec?.minReplicas) ?? 1
  const max = num(obj.spec?.maxReplicas) ?? 0
  return `${current} (${min}–${max})`
}

export function cronSchedule(obj: K8sObject): string {
  return str(obj.spec?.schedule) || '—'
}

export function secretType(obj: K8sObject): string {
  return str((obj as { type?: string }).type) || 'Opaque'
}

export function matchesQuery(obj: K8sObject, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  const name = objectName(obj).toLowerCase()
  const ns = objectNamespace(obj).toLowerCase()
  const ip = nodeInternalIP(obj).toLowerCase()
  return name.includes(needle) || ns.includes(needle) || ip.includes(needle)
}
