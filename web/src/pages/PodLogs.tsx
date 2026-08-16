import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
    return (
      <PageBody>
        <PageHeader title="Logs" description="Missing pod." />
      </PageBody>
    )
  }

  return (
    <PageBody>
      <PageHeader title={`Logs: ${pod}`} description={`Namespace ${ns}`}>
        {loading ? <Badge variant="outline">Streaming</Badge> : null}
        <Button variant="outline" asChild>
          <Link to="/workloads/pods">Back to Pods</Link>
        </Button>
      </PageHeader>
      <ErrorAlert message={error} />
      <pre
        ref={preRef}
        className="min-h-0 flex-1 overflow-auto rounded-xl bg-zinc-950 p-4 font-mono text-[0.85rem] leading-relaxed text-zinc-100"
      >
        {text || (loading ? '' : '(empty)')}
      </pre>
    </PageBody>
  )
}
