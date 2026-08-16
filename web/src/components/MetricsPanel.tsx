import { useEffect, useState } from 'react'

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

function MetricBar({ label, usage, capacity, format }: {
  label: string
  usage: number
  capacity?: number
  format: (n: number) => string
}) {
  const pct = usagePercent(usage, capacity)
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
        <span>{label}</span>
        <span style={{ color: '#444' }}>
          {format(usage)}
          {capacity ? ` / ${format(capacity)}` : ''}
          {pct != null ? ` (${pct.toFixed(0)}%)` : ''}
        </span>
      </div>
      {pct != null && (
        <div style={{ background: '#eee', borderRadius: 4, height: 8, overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: pct > 85 ? '#d73a49' : '#0366d6',
            }}
          />
        </div>
      )}
    </div>
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
    return compact ? null : <p style={{ color: '#666' }}>Loading metrics…</p>
  }
  if (!data?.available) {
    if (compact) return null
    return (
      <section style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
        {title && <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{title}</h2>}
        <p style={{ color: '#666', margin: 0 }}>Metrics unavailable.</p>
      </section>
    )
  }

  const content = (
    <>
      {data.cpu && (
        <MetricBar label="CPU" usage={data.cpu.usage} capacity={data.cpu.capacity} format={formatCores} />
      )}
      {data.memory && (
        <MetricBar label="Memory" usage={data.memory.usage} capacity={data.memory.capacity} format={formatBytes} />
      )}
      {data.source && !compact && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.5rem 0 0' }}>Source: {data.source}</p>
      )}
    </>
  )

  if (compact) {
    return <div style={{ minWidth: '10rem' }}>{content}</div>
  }

  return (
    <section style={{ marginBottom: '1.5rem', padding: '1rem', background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
      {title && <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{title}</h2>}
      {content}
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

  return <span style={{ fontSize: '0.85rem', color: '#444' }}>{text}</span>
}
