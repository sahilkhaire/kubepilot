import { useEffect, useState } from 'react'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

function MetricCard({
  label,
  usage,
  capacity,
  format,
}: {
  label: string
  usage: number
  capacity?: number
  format: (n: number) => string
}) {
  const pct = usagePercent(usage, capacity)
  return (
    <Card className="@container/card shadow-sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {format(usage)}
          {capacity ? <span className="text-base font-normal text-muted-foreground"> / {format(capacity)}</span> : null}
        </CardTitle>
      </CardHeader>
      {pct != null ? (
        <CardFooter className="flex-col items-stretch gap-2">
          <Progress value={pct} className={pct > 85 ? '*:data-[slot=progress-indicator]:bg-destructive' : undefined} />
          <p className="text-sm text-muted-foreground">{pct.toFixed(0)}% of capacity</p>
        </CardFooter>
      ) : null}
    </Card>
  )
}

export default function MetricsPanel({ scope, namespace, name, title, compact }: MetricsPanelProps) {
  const user = useUser()
  const allowed = can(user, 'metrics', 'view')
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      setData(null)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = new URLSearchParams({ scope })
      if (namespace) params.set('namespace', namespace)
      if (name) params.set('name', name)
      try {
        const res = await fetch(`/api/streams/metrics?${params}`, { credentials: 'same-origin' })
        if (res.status === 403 || res.status === 401) {
          if (!cancelled) setData(null)
          return
        }
        const body: MetricsResponse = await res.json()
        if (!cancelled) setData(body)
      } catch {
        if (!cancelled) setData({ available: false })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [scope, namespace, name, allowed])

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
      <div className="min-w-40 space-y-2">
        {data.cpu ? (
          <p className="text-sm text-muted-foreground">
            CPU {formatCores(data.cpu.usage)}
            {data.cpu.capacity ? ` / ${formatCores(data.cpu.capacity)}` : ''}
          </p>
        ) : null}
        {data.memory ? (
          <p className="text-sm text-muted-foreground">
            Memory {formatBytes(data.memory.usage)}
            {data.memory.capacity ? ` / ${formatBytes(data.memory.capacity)}` : ''}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <section className="@container/main space-y-3">
      {title ? <h2 className="text-sm font-medium text-muted-foreground">{title}</h2> : null}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        {data.cpu ? (
          <MetricCard label="CPU" usage={data.cpu.usage} capacity={data.cpu.capacity} format={formatCores} />
        ) : null}
        {data.memory ? (
          <MetricCard label="Memory" usage={data.memory.usage} capacity={data.memory.capacity} format={formatBytes} />
        ) : null}
      </div>
      {data.source ? <p className="text-xs text-muted-foreground">Source: {data.source}</p> : null}
    </section>
  )
}

export function MetricsCell({ scope, namespace, name }: Pick<MetricsPanelProps, 'scope' | 'namespace' | 'name'>) {
  const user = useUser()
  const allowed = can(user, 'metrics', 'view')
  const [text, setText] = useState('—')

  useEffect(() => {
    if (!allowed) {
      setText('—')
      return
    }
    let cancelled = false
    async function load() {
      const params = new URLSearchParams({ scope })
      if (namespace) params.set('namespace', namespace)
      if (name) params.set('name', name)
      try {
        const res = await fetch(`/api/streams/metrics?${params}`, { credentials: 'same-origin' })
        if (!res.ok) {
          if (!cancelled) setText('—')
          return
        }
        const body: MetricsResponse = await res.json()
        if (!body.available || !body.cpu || !body.memory) {
          if (!cancelled) setText('—')
          return
        }
        if (!cancelled) {
          setText(`${formatCores(body.cpu.usage)} / ${formatBytes(body.memory.usage)}`)
        }
      } catch {
        if (!cancelled) setText('—')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [scope, namespace, name, allowed])

  return <span className="font-mono text-sm text-muted-foreground tabular-nums">{text}</span>
}

const barColors = {
  cpu: '*:data-[slot=progress-indicator]:bg-sky-500',
  memory: '*:data-[slot=progress-indicator]:bg-violet-500',
  disk: '*:data-[slot=progress-indicator]:bg-zinc-400',
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
              className={`h-1.5 ${pct > 85 ? '*:data-[slot=progress-indicator]:bg-destructive' : barColors[kind]}`}
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

  useEffect(() => {
    if (!enabled || !name) {
      setData(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/streams/metrics?scope=node&name=${encodeURIComponent(name)}`, {
          credentials: 'same-origin',
        })
        if (!res.ok) {
          if (!cancelled) setData(null)
          return
        }
        const body: MetricsResponse = await res.json()
        if (!cancelled) setData(body.available ? body : null)
      } catch {
        if (!cancelled) setData(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [name, enabled])

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
