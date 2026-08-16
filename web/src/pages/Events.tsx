import { useEffect, useState } from 'react'

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
    return <p>Loading…</p>
  }

  return (
    <div style={{ maxWidth: '72rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Events</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {events.length === 0 ? (
        <p style={{ color: '#666' }}>No events.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Namespace</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Object</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Reason</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Type</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Message</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const ns = ev.metadata?.namespace ?? ''
              const obj = ev.involvedObject
              const objLabel = obj
                ? `${obj.kind ?? ''}/${obj.namespace ? obj.namespace + '/' : ''}${obj.name ?? ''}`
                : ''
              const key = `${ns}/${ev.metadata?.name ?? objLabel}`
              return (
                <tr key={key}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{ns}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{objLabel}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{ev.reason ?? ''}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{ev.type ?? ''}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{ev.message ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
