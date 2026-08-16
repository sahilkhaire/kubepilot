export type K8sObject = {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
    deletionTimestamp?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    ownerReferences?: { kind?: string; name?: string }[]
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

export type PodContainerKind = 'init' | 'container' | 'ephemeral'
export type PodContainerState = 'running' | 'waiting' | 'terminated' | 'unknown'

export type PodContainerInfo = {
  name: string
  kind: PodContainerKind
  state: PodContainerState
  ready: boolean
  reason: string
  restartCount: number
  exitCode?: number
}

type ContainerStateBlock = {
  running?: { startedAt?: string }
  waiting?: { reason?: string; message?: string }
  terminated?: { reason?: string; exitCode?: number; message?: string; signal?: number }
}

function parseContainerStatus(raw: unknown, kind: PodContainerKind): PodContainerInfo {
  const row = (raw ?? {}) as {
    name?: string
    ready?: boolean
    restartCount?: number
    state?: ContainerStateBlock
  }
  const name = row.name ?? ''
  const ready = Boolean(row.ready)
  const restartCount = row.restartCount ?? 0
  if (row.state?.running) {
    return { name, kind, state: 'running', ready, reason: 'Running', restartCount }
  }
  if (row.state?.waiting) {
    return {
      name,
      kind,
      state: 'waiting',
      ready,
      reason: row.state.waiting.reason || 'Waiting',
      restartCount,
    }
  }
  if (row.state?.terminated) {
    const terminated = row.state.terminated
    const exitCode = terminated.exitCode
    const ok = exitCode === 0
    return {
      name,
      kind,
      state: 'terminated',
      ready: false,
      reason: terminated.reason || (ok ? 'Completed' : 'Error'),
      restartCount,
      exitCode,
    }
  }
  return { name, kind, state: 'unknown', ready, reason: 'Pending', restartCount }
}

function specContainerNames(spec: unknown): string[] {
  if (!Array.isArray(spec)) return []
  return spec
    .map((item) => str((item as { name?: string }).name))
    .filter(Boolean)
}

function mergeContainerInfos(specs: unknown, statuses: unknown, kind: PodContainerKind): PodContainerInfo[] {
  const parsed = (Array.isArray(statuses) ? statuses : []).map((item) => parseContainerStatus(item, kind))
  const byName = new Map(parsed.map((item) => [item.name, item]))
  const names = specContainerNames(specs)
  for (const item of parsed) {
    if (item.name && !names.includes(item.name)) names.push(item.name)
  }
  return names.map(
    (name) =>
      byName.get(name) ?? {
        name,
        kind,
        state: 'waiting' as const,
        ready: false,
        reason: 'Pending',
        restartCount: 0,
      },
  )
}

export function podContainerInfos(obj: K8sObject): PodContainerInfo[] {
  const spec = obj.spec ?? {}
  const status = obj.status ?? {}
  return [
    ...mergeContainerInfos(spec.initContainers, status.initContainerStatuses, 'init'),
    ...mergeContainerInfos(spec.containers, status.containerStatuses, 'container'),
    ...mergeContainerInfos(spec.ephemeralContainers, status.ephemeralContainerStatuses, 'ephemeral'),
  ]
}

export function podContainerCounts(obj: K8sObject): { live: number; waiting: number; terminated: number; total: number } {
  const containers = podContainerInfos(obj)
  return {
    live: containers.filter((c) => c.state === 'running').length,
    waiting: containers.filter((c) => c.state === 'waiting' || c.state === 'unknown').length,
    terminated: containers.filter((c) => c.state === 'terminated').length,
    total: containers.length,
  }
}

export function podStatus(obj: K8sObject): string {
  const phase = podPhase(obj)
  let reason = str(obj.status?.reason) || phase

  const containers = podContainerInfos(obj)
  const inits = containers.filter((c) => c.kind === 'init')
  const apps = containers.filter((c) => c.kind !== 'init')

  let initializing = false
  for (let i = 0; i < inits.length; i++) {
    const init = inits[i]
    if (init.state === 'terminated' && init.exitCode === 0) continue
    initializing = true
    if (init.state === 'terminated') {
      reason = `Init:${init.reason || 'Error'}`
    } else if (init.state === 'waiting' && init.reason && init.reason !== 'PodInitializing') {
      reason = `Init:${init.reason}`
    } else {
      reason = `Init:${i}/${inits.length}`
    }
    break
  }

  if (!initializing) {
    let hasRunning = false
    for (const container of [...apps].reverse()) {
      if (container.state === 'waiting' && container.reason) {
        reason = container.reason
      } else if (container.state === 'terminated' && container.reason) {
        reason = container.reason
      } else if (container.state === 'running') {
        hasRunning = true
      }
    }
    if (reason === 'Completed' && hasRunning) {
      reason = 'Running'
    }
  }

  if (obj.metadata?.deletionTimestamp) {
    return str(obj.status?.reason) === 'NodeLost' ? 'Unknown' : 'Terminating'
  }

  if (reason === 'Succeeded') return 'Completed'
  return reason || phase
}

export function podControlledBy(obj: K8sObject): string {
  const ref = obj.metadata?.ownerReferences?.[0]
  if (!ref?.kind || !ref.name) return ''
  return `${ref.kind}/${ref.name}`
}

export const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export type PodEnvVar = {
  name: string
  value: string
  valueFrom?: Record<string, unknown>
}

export type PodEnvContainer = {
  name: string
  kind: 'container' | 'init'
  env: PodEnvVar[]
}

export function workloadEnvContainers(obj: K8sObject): PodEnvContainer[] {
  const spec = obj.spec ?? {}
  const template = spec.template as { spec?: Record<string, unknown> } | undefined
  if (template?.spec) {
    return envContainersFromPodSpec(template.spec)
  }
  return envContainersFromPodSpec(spec)
}

function envContainersFromPodSpec(spec: Record<string, unknown> | undefined): PodEnvContainer[] {
  const podSpec = spec ?? {}
  return [
    ...parseEnvContainers(podSpec.initContainers, 'init'),
    ...parseEnvContainers(podSpec.containers, 'container'),
  ]
}

function parseEnvContainers(raw: unknown, kind: 'container' | 'init'): PodEnvContainer[] {
  if (!Array.isArray(raw)) return []
  const out: PodEnvContainer[] = []
  for (const item of raw) {
    const row = (item ?? {}) as { name?: string; env?: unknown }
    const name = str(row.name)
    if (!name) continue
    out.push({ name, kind, env: parseEnvVars(row.env) })
  }
  return out
}

function parseEnvVars(raw: unknown): PodEnvVar[] {
  if (!Array.isArray(raw)) return []
  const out: PodEnvVar[] = []
  for (const item of raw) {
    const row = (item ?? {}) as { name?: string; value?: string; valueFrom?: Record<string, unknown> }
    const name = str(row.name)
    const valueFrom = row.valueFrom && typeof row.valueFrom === 'object' ? row.valueFrom : undefined
    const value = typeof row.value === 'string' ? row.value : ''
    if (!name && !value && !valueFrom) continue
    out.push({ name, value, valueFrom })
  }
  return out
}

export function envValueFromLabel(valueFrom: Record<string, unknown>): string {
  const secret = valueFrom.secretKeyRef as { name?: string; key?: string } | undefined
  if (secret?.name) return `secret:${secret.name}/${secret.key ?? ''}`
  const cm = valueFrom.configMapKeyRef as { name?: string; key?: string } | undefined
  if (cm?.name) return `configMap:${cm.name}/${cm.key ?? ''}`
  const field = valueFrom.fieldRef as { fieldPath?: string } | undefined
  if (field?.fieldPath) return `field:${field.fieldPath}`
  const resource = valueFrom.resourceFieldRef as { resource?: string } | undefined
  if (resource?.resource) return `resource:${resource.resource}`
  return 'valueFrom'
}

export function podQOS(obj: K8sObject): string {
  return str(obj.status?.qosClass) || '—'
}

export function podIP(obj: K8sObject): string {
  return str(obj.status?.podIP)
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

export function replicaDesired(obj: K8sObject): number {
  return num(obj.spec?.replicas) ?? 0
}

export function replicaStatusCounts(obj: K8sObject): {
  ready: number
  updated: number
  available: number
  replicas: number
} {
  return {
    ready: num(obj.status?.readyReplicas) ?? 0,
    updated: num(obj.status?.updatedReplicas) ?? 0,
    available: num(obj.status?.availableReplicas) ?? 0,
    replicas: num(obj.status?.replicas) ?? 0,
  }
}

export function selectorMatchLabels(obj: K8sObject): Record<string, string> {
  const selector = obj.spec?.selector
  if (!selector || typeof selector !== 'object') return {}
  const labels = (selector as { matchLabels?: Record<string, string> }).matchLabels
  return labels ?? {}
}

export function podMatchesLabels(pod: K8sObject, labels: Record<string, string>): boolean {
  const entries = Object.entries(labels)
  if (entries.length === 0) return false
  const podLabels = pod.metadata?.labels ?? {}
  return entries.every(([key, value]) => podLabels[key] === value)
}

export function workloadStrategy(obj: K8sObject): string {
  const strategy = obj.spec?.strategy as
    | { type?: string; rollingUpdate?: { maxUnavailable?: unknown; maxSurge?: unknown } }
    | undefined
  if (!strategy?.type) return '—'
  if (strategy.type === 'RollingUpdate' && strategy.rollingUpdate) {
    return `RollingUpdate (maxUnavailable ${String(strategy.rollingUpdate.maxUnavailable ?? '—')}, maxSurge ${String(strategy.rollingUpdate.maxSurge ?? '—')})`
  }
  return strategy.type
}

export function objectConditions(obj: K8sObject): { type: string; status: string; ok: boolean }[] {
  const conditions = obj.status?.conditions
  if (!Array.isArray(conditions)) return []
  return conditions
    .map((c) => {
      const row = c as { type?: string; status?: string }
      return { type: row.type ?? '', status: row.status ?? '', ok: row.status === 'True' }
    })
    .filter((c) => c.type)
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

function metadataMapMatches(map: Record<string, string>, needle: string): boolean {
  for (const [key, value] of Object.entries(map)) {
    const k = key.toLowerCase()
    const v = value.toLowerCase()
    if (k.includes(needle) || v.includes(needle) || `${k}=${v}`.includes(needle) || `${k}:${v}`.includes(needle)) {
      return true
    }
  }
  return false
}

export function matchesQuery(obj: K8sObject, q: string): boolean {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const name = objectName(obj).toLowerCase()
  const ns = objectNamespace(obj).toLowerCase()
  const ip = nodeInternalIP(obj).toLowerCase()
  if (name.includes(needle) || ns.includes(needle) || ip.includes(needle)) return true
  if (Array.isArray(obj.spec?.containers)) {
    if (podStatus(obj).toLowerCase().includes(needle)) return true
    if (podNode(obj).toLowerCase().includes(needle)) return true
    if (podControlledBy(obj).toLowerCase().includes(needle)) return true
  }
  return metadataMapMatches(objectLabels(obj), needle) || metadataMapMatches(objectAnnotations(obj), needle)
}
