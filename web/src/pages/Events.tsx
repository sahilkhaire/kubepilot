import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatAge } from '@/lib/k8s-fields'
import { sortBy, timestampSortValue, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh } from '@/hooks/use-live-refresh'

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

  const load = useCallback(async (initial = false) => {
    if (initial) {
      setLoading(true)
      setError('')
    }
    try {
      const res = await fetch('/api/k8s/events', { credentials: 'same-origin' })
      if (res.status === 403) {
        setEvents([])
        return
      }
      if (!res.ok) throw new Error('failed to load events')
      const data: EventItem[] = await res.json()
      setEvents(Array.isArray(data) ? data : [])
      setError('')
    } catch (e) {
      if (initial) setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      if (initial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])
  useLiveRefresh(() => load(false))

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
  const { sort, sortKey, sortDir, onSort } = useTableSort()
  const sorted = useMemo(
    () =>
      sortBy(visible, sort, (ev, key) => {
        const obj = ev.involvedObject
        const objLabel = obj
          ? `${obj.kind ?? ''}/${obj.namespace ? obj.namespace + '/' : ''}${obj.name ?? ''}`
          : ''
        switch (key) {
          case 'age':
            return timestampSortValue(ev.lastTimestamp || ev.eventTime || ev.metadata?.creationTimestamp)
          case 'namespace':
            return ev.metadata?.namespace ?? ''
          case 'object':
            return objLabel
          case 'reason':
            return ev.reason ?? ''
          case 'type':
            return ev.type ?? ''
          case 'message':
            return ev.message ?? ''
          default:
            return ''
        }
      }),
    [visible, sort],
  )

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
              <SortableHead column="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="namespace" label="Namespace" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="object" label="Object" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="reason" label="Reason" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="message" label="Message" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ev) => {
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
        {sorted.length === 0 ? <EmptyState>No events.</EmptyState> : null}
      </div>
    </PageBody>
  )
}
