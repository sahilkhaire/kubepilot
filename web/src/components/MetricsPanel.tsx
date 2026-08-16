import { useEffect, useState } from 'react'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

type ResourceMetric = {
  usage: number
  capacity?: number
}

type MetricsResponse = {
  available: boolean
  source?: string
  cpu?: ResourceMetric
  memory?: ResourceMetric
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
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [scope, namespace, name])

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
  const [text, setText] = useState('—')

  useEffect(() => {
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
  }, [scope, namespace, name])

  return <span className="font-mono text-sm text-muted-foreground tabular-nums">{text}</span>
}
