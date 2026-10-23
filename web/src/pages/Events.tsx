import { useCallback, useEffect, useMemo, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { readAPIError } from '@/api'
import { FilterInput } from '@/components/namespace-select'
import { StatusBadge } from '@/components/status-badge'
import { Toggle } from '@/components/ui/toggle'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  SerialHead,
  SerialCell,
} from '@/components/ui/table'
import { formatAge } from '@/lib/k8s-fields'
import { sortBy, timestampSortValue, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'

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
  const [warningsOnly, setWarningsOnly] = useState(false)

  const load = useSingleFlight(
    useCallback(async (initial = false) => {
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
      if (!res.ok) throw new Error(await readAPIError(res, 'Failed to load events'))
      const data: EventItem[] = await res.json()
      setEvents(Array.isArray(data) ? data : [])
      setError('')
    } catch (e) {
      if (initial) setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      if (initial) setLoading(false)
    }
  }, []),
  )

  useEffect(() => {
    void load(true)
  }, [load])
  useLiveRefresh(() => load(false))

  const visible = useMemo(() => {
    const q = query.toLowerCase()
    const pool = warningsOnly ? events.filter((ev) => ev.type === 'Warning') : events
    if (!q) return pool
    return pool.filter((ev) => {
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
  }, [events, query, warningsOnly])
  const warningCount = useMemo(() => events.filter((ev) => ev.type === 'Warning').length, [events])
  const { sort, sortKey, sortDir, onSort } = useTableSort('events')
  const sorted = useMemo(
    () =>
      // Newest first until the user picks a column.
      sortBy(visible, sort ?? { key: 'age', dir: 'desc' }, (ev, key) => {
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
      <PageHeader title="Events" count={visible.length}>
        <Toggle
          size="sm"
          variant="outline"
          pressed={warningsOnly}
          onPressedChange={setWarningsOnly}
          className="h-7 gap-1.5 px-2 text-xs data-[state=on]:border-destructive/40 data-[state=on]:text-destructive"
        >
          Warnings only
          <span className="tabular-nums text-muted-foreground">{warningCount}</span>
        </Toggle>
        <FilterInput value={query} onChange={setQuery} placeholder="Filter by object, reason, message…" />
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <SerialHead />
              <SortableHead column="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="namespace" label="Namespace" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="object" label="Object" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="reason" label="Reason" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortableHead column="message" label="Message" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ev, index) => {
              const ns = ev.metadata?.namespace ?? ''
              const obj = ev.involvedObject
              const objLabel = obj
                ? `${obj.kind ?? ''}/${obj.namespace ? obj.namespace + '/' : ''}${obj.name ?? ''}`
                : ''
              const key = `${ns}/${ev.metadata?.name ?? objLabel}`
              return (
                <TableRow key={key}>
                  <SerialCell index={index} />
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatAge(ev.lastTimestamp || ev.eventTime || ev.metadata?.creationTimestamp)}
                  </TableCell>
                  <TableCell>{ns}</TableCell>
                  <TableCell className="font-medium">{objLabel}</TableCell>
                  <TableCell>{ev.reason ?? ''}</TableCell>
                  <TableCell>
                    <StatusBadge value={ev.type ?? ''} />
                  </TableCell>
                  <TableCell className="max-w-xl truncate" title={ev.message ?? ''}>
                    {ev.message ?? ''}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {sorted.length === 0 && !error ? (
          <EmptyState>
            {query ? `No events match “${query}”.` : warningsOnly ? 'No warning events.' : 'No recent events.'}
          </EmptyState>
        ) : null}
      </div>
    </PageBody>
  )
}
