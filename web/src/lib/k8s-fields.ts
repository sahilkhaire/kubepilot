export type K8sObject = {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
    labels?: Record<string, string>
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
  return name.includes(needle) || ns.includes(needle)
}
