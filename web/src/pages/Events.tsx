import { useEffect, useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type EventItem = {
  metadata?: { name?: string; namespace?: string }
  involvedObject?: { kind?: string; name?: string; namespace?: string }
  reason?: string
  message?: string
  type?: string
  lastTimestamp?: string
}

export default function Events() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        if (!res.ok) {
          throw new Error('failed to load events')
        }
        const data: EventItem[] = await res.json()
        if (!cancelled) setEvents(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <PageLoading />
  }

  return (
    <PageBody>
      <PageHeader title="Events" description="Recent cluster and namespaced events." />
      <ErrorAlert message={error} />
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {events.length === 0 ? (
            <EmptyState>No events.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namespace</TableHead>
                  <TableHead>Object</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => {
                  const ns = ev.metadata?.namespace ?? ''
                  const obj = ev.involvedObject
                  const objLabel = obj
                    ? `${obj.kind ?? ''}/${obj.namespace ? obj.namespace + '/' : ''}${obj.name ?? ''}`
                    : ''
                  const key = `${ns}/${ev.metadata?.name ?? objLabel}`
                  const warning = (ev.type ?? '').toLowerCase() === 'warning'
                  return (
                    <TableRow key={key}>
                      <TableCell>{ns}</TableCell>
                      <TableCell className="font-medium">{objLabel}</TableCell>
                      <TableCell>{ev.reason ?? ''}</TableCell>
                      <TableCell>
                        <Badge variant={warning ? 'destructive' : 'outline'}>{ev.type ?? ''}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate whitespace-normal">{ev.message ?? ''}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageBody>
  )
}
