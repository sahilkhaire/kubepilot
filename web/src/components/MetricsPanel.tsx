import { useCallback, useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'

type ResourceMetric = {
  usage: number
  capacity?: number
}

type MetricsResponse = {
  available: boolean
  source?: string
  cpu?: ResourceMetric
  memory?: ResourceMetric
  disk?: ResourceMetric
}

type MetricsPanelProps = {
  scope: 'cluster' | 'node' | 'pod'
  namespace?: string
  name?: string
  title?: string
  compact?: boolean
}

function formatCores(n: number): string {
  if (n >= 10) return n.toFixed(1)
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KiB`
  return `${n.toFixed(0)} B`
}

function usagePercent(usage: number, capacity?: number): number | null {
  if (!capacity || capacity <= 0) return null
  return Math.min(100, (usage / capacity) * 100)
}

const metricSortValues = new Map<string, number>()
const metricSortListeners = new Set<() => void>()
let metricSortNotifyTimer: number | undefined

function rememberMetricSortValue(key: string, value: number | undefined) {
  if (value == null || Number.isNaN(value)) {
    if (!metricSortValues.delete(key)) return
  } else if (metricSortValues.get(key) === value) {
    return
  } else {
    metricSortValues.set(key, value)
  }
  if (metricSortNotifyTimer != null) return
  metricSortNotifyTimer = window.setTimeout(() => {
    metricSortNotifyTimer = undefined
    metricSortListeners.forEach((fn) => fn())
  }, 50)
}

function metricRank(metric?: ResourceMetric): number | undefined {
  if (!metric) return undefined
  return usagePercent(metric.usage, metric.capacity) ?? metric.usage
}

export function metricSortValue(key: string): number | undefined {
  return metricSortValues.get(key)
}

export function useMetricSortTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const fn = () => setTick((n) => n + 1)
    metricSortListeners.add(fn)
    return () => {
      metricSortListeners.delete(fn)
    }
  }, [])
}

function MetricCard({
  label,
  usage,
  capacity,
  format,
  tone,
}: {
  label: string
  usage: number
  capacity?: number
  format: (n: number) => string
  tone: 'cpu' | 'memory'
}) {
  const pct = usagePercent(usage, capacity)
  const bar =
    pct != null && pct > 85
      ? '*:data-[slot=progress-indicator]:bg-destructive'
      : pct != null && pct > 70
        ? '*:data-[slot=progress-indicator]:bg-warning'
        : tone === 'cpu'
          ? '*:data-[slot=progress-indicator]:bg-chart-1'
          : '*:data-[slot=progress-indicator]:bg-chart-2'
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={tone === 'cpu' ? 'size-2 rounded-full bg-chart-1' : 'size-2 rounded-full bg-chart-2'} />
          {label}
        </span>
        {pct != null ? <span className="tabular-nums">{pct.toFixed(0)}%</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {format(usage)}
        {capacity ? <span className="text-sm font-normal text-muted-foreground"> / {format(capacity)}</span> : null}
      </p>
      {pct != null ? <Progress value={pct} className={`mt-3 h-1.5 ${bar}`} /> : null}
    </div>
  )
}

export default function MetricsPanel({ scope, namespace, name, title, compact }: MetricsPanelProps) {
  const user = useUser()
  const allowed = can(user, 'metrics', 'view')
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useSingleFlight(
    useCallback(
    async (initial = false) => {
      if (!allowed) {
        setLoading(false)
        setData(null)
        return
      }
      if (initial) setLoading(true)
      const params = new URLSearchParams({ scope })
      if (namespace) params.set('namespace', namespace)
      if (name) params.set('name', name)
      try {
        const res = await fetch(`/api/streams/metrics?${params}`, { credentials: 'same-origin' })
        if (res.status === 403 || res.status === 401) {
          setData(null)
          return
        }
        const body: MetricsResponse = await res.json()
        setData(body)
      } catch {
        setData((prev) => prev ?? { available: false })
      } finally {
        if (initial) setLoading(false)
      }
    },
    [scope, namespace, name, allowed],
    ),
  )

  useEffect(() => {
    void load(true)
  }, [load])
  useLiveRefresh(() => load(false), allowed)

  if (!allowed) {
    return null
  }

  if (loading) {
    if (compact) return <Skeleton className="h-4 w-24" />
    return (
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    )
  }

  if (!data?.available) {
    return null
  }

  if (compact) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {data.cpu ? (
          <MetricCard label="CPU" tone="cpu" usage={data.cpu.usage} capacity={data.cpu.capacity} format={formatCores} />
        ) : null}
        {data.memory ? (
          <MetricCard label="Memory" tone="memory" usage={data.memory.usage} capacity={data.memory.capacity} format={formatBytes} />
        ) : null}
      </div>
    )
  }

  return (
    <section className="@container/main space-y-3">
      {title ? <h2 className="text-[13px] font-medium">{title}</h2> : null}
      <div className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2">
        {data.cpu ? (
          <MetricCard label="CPU" tone="cpu" usage={data.cpu.usage} capacity={data.cpu.capacity} format={formatCores} />
        ) : null}
        {data.memory ? (
          <MetricCard label="Memory" tone="memory" usage={data.memory.usage} capacity={data.memory.capacity} format={formatBytes} />
        ) : null}
      </div>
      {data.source ? <p className="text-[11px] text-muted-foreground/70">Source: {data.source}</p> : null}
    </section>
  )
}

export function MetricsCell({ scope, namespace, name }: Pick<MetricsPanelProps, 'scope' | 'namespace' | 'name'>) {
  const user = useUser()
  const allowed = can(user, 'metrics', 'view')
  const [text, setText] = useState('—')

  const load = useSingleFlight(
    useCallback(async () => {
    if (!allowed) {
      setText('—')
      return
    }
    const params = new URLSearchParams({ scope })
    if (namespace) params.set('namespace', namespace)
    if (name) params.set('name', name)
    try {
      const res = await fetch(`/api/streams/metrics?${params}`, { credentials: 'same-origin' })
      if (!res.ok) return
      const body: MetricsResponse = await res.json()
      if (!body.available || !body.cpu || !body.memory) return
      rememberMetricSortValue(`pod:${namespace ?? ''}/${name ?? ''}`, metricRank(body.cpu))
      setText(`${formatCores(body.cpu.usage)} / ${formatBytes(body.memory.usage)}`)
    } catch {
      // keep last value on background refresh
    }
  }, [scope, namespace, name, allowed]),
  )

  useEffect(() => {
    void load()
  }, [load])
  useLiveRefresh(load, allowed)

  return <span className="font-mono text-sm text-muted-foreground tabular-nums">{text}</span>
}

const barColors = {
  cpu: '*:data-[slot=progress-indicator]:bg-chart-1',
  memory: '*:data-[slot=progress-indicator]:bg-chart-2',
  disk: '*:data-[slot=progress-indicator]:bg-chart-3',
}

function UsageBar({
  metric,
  kind,
  format,
}: {
  metric?: ResourceMetric
  kind: keyof typeof barColors
  format: (n: number) => string
}) {
  if (!metric) {
    return <span className="text-muted-foreground">—</span>
  }
  const pct = usagePercent(metric.usage, metric.capacity)
  const label = metric.capacity
    ? `${format(metric.usage)} / ${format(metric.capacity)}`
    : format(metric.usage)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex w-24 cursor-default flex-col justify-center gap-1">
          {pct != null ? (
            <Progress
              value={pct}
              className={`h-1.5 ${pct > 85 ? '*:data-[slot=progress-indicator]:bg-destructive' : pct > 70 ? '*:data-[slot=progress-indicator]:bg-warning' : barColors[kind]}`}
            />
          ) : (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{format(metric.usage)}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {pct != null ? ` · ${pct.toFixed(0)}%` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

export function useNodeMetrics(name: string, enabled: boolean) {
  const [data, setData] = useState<MetricsResponse | null>(null)

  const load = useSingleFlight(
    useCallback(async () => {
    if (!enabled || !name) {
      setData(null)
      return
    }
    try {
      const res = await fetch(`/api/streams/metrics?scope=node&name=${encodeURIComponent(name)}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) return
      const body: MetricsResponse = await res.json()
      const next = body.available ? body : null
      rememberMetricSortValue(`node:${name}:cpu`, metricRank(next?.cpu))
      rememberMetricSortValue(`node:${name}:memory`, metricRank(next?.memory))
      rememberMetricSortValue(`node:${name}:disk`, metricRank(next?.disk))
      setData(next)
    } catch {
      // keep last value on background refresh
    }
  }, [name, enabled]),
  )

  useEffect(() => {
    if (!enabled || !name) {
      setData(null)
      return
    }
    void load()
  }, [load, enabled, name])
  useLiveRefresh(load, enabled && Boolean(name))

  return data
}

export function NodeCPUBar({ metric }: { metric?: ResourceMetric }) {
  return <UsageBar metric={metric} kind="cpu" format={formatCores} />
}

export function NodeMemoryBar({ metric }: { metric?: ResourceMetric }) {
  return <UsageBar metric={metric} kind="memory" format={formatBytes} />
}

export function NodeDiskBar({ metric }: { metric?: ResourceMetric }) {
  return <UsageBar metric={metric} kind="disk" format={formatBytes} />
}
