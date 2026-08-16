import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

/** Maximum number of log lines kept in memory and rendered. */
const MAX_DISPLAY_LOG_LINES = 5000

function capLogLines(text: string, maxLines: number): string {
  if (maxLines <= 0) {
    return ''
  }
  let lineCount = 0
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '\n') {
      lineCount++
      if (lineCount >= maxLines) {
        return text.slice(i + 1)
      }
    }
  }
  return text
}

export default function PodLogs() {
  const { ns, pod } = useParams<{ ns: string; pod: string }>()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const preRef = useRef<HTMLPreElement>(null)
  const bufferRef = useRef('')
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!ns || !pod) return
    const namespace = ns
    const podName = pod
    const ac = new AbortController()
    let cancelled = false

    function scheduleUpdate() {
      if (rafRef.current !== null) {
        return
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!cancelled) {
          setText(bufferRef.current)
        }
      })
    }

    async function loadLogs() {
      setLoading(true)
      setError('')
      setText('')
      bufferRef.current = ''
      const params = new URLSearchParams({
        namespace,
        pod: podName,
        follow: '1',
        tail: '200',
      })
      try {
        const res = await fetch(`/api/streams/logs?${params.toString()}`, {
          credentials: 'same-origin',
          signal: ac.signal,
        })
        if (!res.ok) {
          throw new Error(`logs request failed (${res.status})`)
        }
        const reader = res.body?.getReader()
        if (!reader) {
          throw new Error('streaming not supported')
        }
        const decoder = new TextDecoder()
        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          bufferRef.current = capLogLines(
            bufferRef.current + decoder.decode(value, { stream: true }),
            MAX_DISPLAY_LOG_LINES,
          )
          scheduleUpdate()
        }
        bufferRef.current = capLogLines(
          bufferRef.current + decoder.decode(),
          MAX_DISPLAY_LOG_LINES,
        )
        scheduleUpdate()
      } catch (e) {
        if (!cancelled && !ac.signal.aborted) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadLogs()
    return () => {
      cancelled = true
      ac.abort()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [ns, pod])

  useEffect(() => {
    const el = preRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [text])

  if (!ns || !pod) {
    return <p>Missing pod.</p>
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/workloads">← Workloads</Link>
      </p>
      <h1>
        Logs: {pod} <span style={{ fontWeight: 'normal', color: '#666' }}>({ns})</span>
      </h1>
      {loading && <p>Streaming…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <pre
        ref={preRef}
        style={{
          background: '#111',
          color: '#eee',
          padding: '1rem',
          overflow: 'auto',
          maxHeight: '70vh',
          fontSize: '0.85rem',
          lineHeight: 1.4,
        }}
      >
        {text || (loading ? '' : '(empty)')}
      </pre>
    </div>
  )
}
