import { useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatAge } from '@/lib/k8s-fields'

type EventItem = {
  metadata?: { name?: string; namespace?: string; creationTimestamp?: string }
  involvedObject?: { kind?: string; name?: string; namespace?: string }
  reason?: string
  message?: string
  type?: string
  lastTimestamp?: string
  eventTime?: string
}

export default function Events() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/k8s/events', { credentials: 'same-origin' })
        if (res.status === 403) {
          if (!cancelled) setEvents([])
          return
        }
        if (!res.ok) throw new Error('failed to load events')
        const data: EventItem[] = await res.json()
        if (!cancelled) setEvents(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return events
    return events.filter((ev) => {
      const hay = [
        ev.metadata?.namespace,
        ev.reason,
        ev.message,
        ev.type,
        ev.involvedObject?.kind,
        ev.involvedObject?.name,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [events, query])

  if (loading) return <PageLoading />

  return (
    <PageBody>
      <PageHeader title="Events" description={`${visible.length} item${visible.length === 1 ? '' : 's'}`}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" className="h-7 w-48 text-xs" />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Age</TableHead>
              <TableHead>Namespace</TableHead>
              <TableHead>Object</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((ev) => {
              const ns = ev.metadata?.namespace ?? ''
              const obj = ev.involvedObject
              const objLabel = obj
                ? `${obj.kind ?? ''}/${obj.namespace ? obj.namespace + '/' : ''}${obj.name ?? ''}`
                : ''
              const key = `${ns}/${ev.metadata?.name ?? objLabel}`
              const warning = (ev.type ?? '').toLowerCase() === 'warning'
              return (
                <TableRow key={key}>
                  <TableCell className="text-muted-foreground">
                    {formatAge(ev.lastTimestamp || ev.eventTime || ev.metadata?.creationTimestamp)}
                  </TableCell>
                  <TableCell>{ns}</TableCell>
                  <TableCell className="font-medium">{objLabel}</TableCell>
                  <TableCell>{ev.reason ?? ''}</TableCell>
                  <TableCell>
                    <Badge variant={warning ? 'destructive' : 'outline'} className="h-5 px-1.5 text-[10px]">
                      {ev.type ?? ''}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xl truncate">{ev.message ?? ''}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {visible.length === 0 ? <EmptyState>No events.</EmptyState> : null}
      </div>
    </PageBody>
  )
}
