import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  DownloadIcon,
  EraserIcon,
  HistoryIcon,
  RotateCwIcon,
  WrapTextIcon,
} from 'lucide-react'
import { readAPIError } from '@/api'
import { ContainerSelect, usePodContainers } from '@/components/container-select'
import { ErrorAlert } from '@/components/error-alert'
import { IconActionButton } from '@/components/icon-action-button'
import { FilterInput } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Maximum number of log lines kept in memory and rendered. */
const MAX_DISPLAY_LOG_LINES = 5000
const TAIL_LINES = 500

type StreamState = 'connecting' | 'streaming' | 'ended' | 'error'

function capLogLines(text: string, maxLines: number): string {
  if (maxLines <= 0) return ''
  let lineCount = 0
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '\n') {
      lineCount++
      if (lineCount >= maxLines) return text.slice(i + 1)
    }
  }
  return text
}

const stateBadge: Record<StreamState, { label: string; className: string }> = {
  connecting: { label: 'Connecting', className: 'text-muted-foreground' },
  streaming: { label: 'Live', className: 'border-success/30 bg-success/10 text-success' },
  ended: { label: 'Stream ended', className: 'text-muted-foreground' },
  error: { label: 'Disconnected', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
}

export default function PodLogs() {
  const { ns, pod } = useParams<{ ns: string; pod: string }>()
  const navigate = useNavigate()
  const { containers, container, setContainer, ready: containersReady } = usePodContainers(ns, pod)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [state, setState] = useState<StreamState>('connecting')
  const [previous, setPrevious] = useState(false)
  const [wrap, setWrap] = useState(true)
  const [follow, setFollow] = useState(true)
  const [filter, setFilter] = useState('')
  const [attempt, setAttempt] = useState(0)
  const preRef = useRef<HTMLPreElement>(null)
  const bufferRef = useRef('')
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!ns || !pod || !containersReady) return
    const ac = new AbortController()
    let cancelled = false

    function scheduleUpdate() {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!cancelled) setText(bufferRef.current)
      })
    }

    async function loadLogs() {
      setState('connecting')
      setError('')
      setText('')
      bufferRef.current = ''
      const params = new URLSearchParams({
        namespace: ns as string,
        pod: pod as string,
        follow: previous ? '0' : '1',
        tail: String(TAIL_LINES),
      })
      if (container) params.set('container', container)
      if (previous) params.set('previous', '1')
      try {
        const res = await fetch(`/api/streams/logs?${params.toString()}`, {
          credentials: 'same-origin',
          signal: ac.signal,
        })
        if (!res.ok) {
          throw new Error(await readAPIError(res, 'Could not stream logs'))
        }
        const reader = res.body?.getReader()
        if (!reader) throw new Error('This browser does not support streaming responses.')
        setState('streaming')
        const decoder = new TextDecoder()
        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          bufferRef.current = capLogLines(bufferRef.current + decoder.decode(value, { stream: true }), MAX_DISPLAY_LOG_LINES)
          scheduleUpdate()
        }
        bufferRef.current = capLogLines(bufferRef.current + decoder.decode(), MAX_DISPLAY_LOG_LINES)
        scheduleUpdate()
        if (!cancelled) setState('ended')
      } catch (e) {
        if (!cancelled && !ac.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Could not stream logs')
          setState('error')
        }
      }
    }

    void loadLogs()
    return () => {
      cancelled = true
      ac.abort()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [ns, pod, container, previous, containersReady, attempt])

  const lines = useMemo(() => {
    const all = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text ? text.split('\n') : []
    if (!filter) return all
    const q = filter.toLowerCase()
    return all.filter((line) => line.toLowerCase().includes(q))
  }, [text, filter])

  useEffect(() => {
    const el = preRef.current
    if (el && follow) el.scrollTop = el.scrollHeight
  }, [lines, follow])

  function onScroll() {
    const el = preRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (atBottom !== follow) setFollow(atBottom)
  }

  function download() {
    const blob = new Blob([bufferRef.current], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pod}${container ? `-${container}` : ''}${previous ? '-previous' : ''}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/workloads/pods')
  }

  if (!ns || !pod) {
    return (
      <PageBody>
        <PageHeader title="Logs" description="No pod selected." />
      </PageBody>
    )
  }

  const badge = stateBadge[state]

  return (
    <PageBody>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" onClick={goBack} aria-label="Back">
              <ArrowLeftIcon />
            </Button>
            <span className="truncate">{pod}</span>
          </span>
        }
        description={`Logs · ${ns}`}
      >
        <Badge variant="outline" className={cn('h-5 text-[11px]', badge.className)}>
          {badge.label}
        </Badge>
        <ContainerSelect containers={containers} value={container} onChange={setContainer} />
        <FilterInput value={filter} onChange={setFilter} placeholder="Find in logs…" />
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Toggle
                  size="sm"
                  pressed={previous}
                  onPressedChange={setPrevious}
                  aria-label="Show logs from the previous container instance"
                  className="h-7 min-w-7"
                >
                  <HistoryIcon />
                </Toggle>
              </span>
            </TooltipTrigger>
            <TooltipContent>Previous instance (after a restart)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Toggle size="sm" pressed={wrap} onPressedChange={setWrap} aria-label="Wrap lines" className="h-7 min-w-7">
                  <WrapTextIcon />
                </Toggle>
              </span>
            </TooltipTrigger>
            <TooltipContent>Wrap lines</TooltipContent>
          </Tooltip>
          <IconActionButton
            tooltip="Clear"
            onClick={() => {
              bufferRef.current = ''
              setText('')
            }}
          >
            <EraserIcon />
          </IconActionButton>
          <IconActionButton tooltip="Download" onClick={download} disabled={!text}>
            <DownloadIcon />
          </IconActionButton>
          <IconActionButton tooltip="Reconnect" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCwIcon />
          </IconActionButton>
        </div>
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="relative min-h-0 flex-1">
        <pre
          ref={preRef}
          onScroll={onScroll}
          className={cn(
            'absolute inset-0 overflow-auto bg-zinc-950 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-100',
            wrap ? 'break-all whitespace-pre-wrap' : 'whitespace-pre',
          )}
        >
          {lines.length > 0
            ? lines.join('\n')
            : state === 'connecting'
              ? 'Connecting…'
              : filter
                ? `No lines match “${filter}”.`
                : previous
                  ? 'No logs from a previous instance.'
                  : 'No log output yet.'}
        </pre>
        {!follow ? (
          <Button
            size="sm"
            variant="secondary"
            className="absolute right-4 bottom-4 shadow-md"
            onClick={() => setFollow(true)}
          >
            <ArrowDownToLineIcon />
            Jump to latest
          </Button>
        ) : null}
      </div>
    </PageBody>
  )
}
