import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, RotateCwIcon } from 'lucide-react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ContainerSelect, usePodContainers } from '@/components/container-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme, type ResolvedTheme } from '@/lib/theme'

const wsStreamStdin = 0
const wsStreamStdout = 1
const wsStreamStderr = 2
const wsStreamResize = 4

type Status = 'connecting' | 'connected' | 'closed' | 'error'

const statusBadge: Record<Status, { label: string; className: string }> = {
  connecting: { label: 'Connecting', className: 'text-muted-foreground' },
  connected: { label: 'Connected', className: 'border-success/30 bg-success/10 text-success' },
  closed: { label: 'Session ended', className: 'text-muted-foreground' },
  error: { label: 'Connection failed', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
}

// xterm needs hex colors; these mirror the --console tokens in index.css.
const terminalThemes: Record<ResolvedTheme, ITheme> = {
  dark: {
    background: '#0e1016',
    foreground: '#e2e4ea',
    cursor: '#e2e4ea',
    selectionBackground: '#3b4a7a',
  },
  light: {
    background: '#fbfcfe',
    foreground: '#262a35',
    cursor: '#262a35',
    selectionBackground: '#c9d6f5',
    // Darker ANSI colors so output stays readable on a light background.
    black: '#262a35',
    red: '#c4302b',
    green: '#1f7a3f',
    yellow: '#8a6100',
    blue: '#2453c7',
    magenta: '#8a3fb8',
    cyan: '#11707d',
    white: '#6b7080',
    brightBlack: '#4a4f5c',
    brightWhite: '#262a35',
  },
}

const encoder = new TextEncoder()

function frame(stream: number, payload: string): Uint8Array {
  const enc = encoder.encode(payload)
  const msg = new Uint8Array(1 + enc.length)
  msg[0] = stream
  msg.set(enc, 1)
  return msg
}

export default function PodExec() {
  const { ns, pod } = useParams<{ ns: string; pod: string }>()
  const navigate = useNavigate()
  const { containers, container, setContainer, ready: containersReady } = usePodContainers(ns, pod)
  const [status, setStatus] = useState<Status>('connecting')
  const [attempt, setAttempt] = useState(0)
  const termRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const { resolved } = useTheme()
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved

  // Recolor the open terminal when the theme changes, without reconnecting.
  useEffect(() => {
    if (termInstance.current) termInstance.current.options.theme = terminalThemes[resolved]
  }, [resolved])

  useEffect(() => {
    if (!ns || !pod || !containersReady || !termRef.current) return
    const host = termRef.current
    setStatus('connecting')

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      scrollback: 5000,
      theme: terminalThemes[resolvedRef.current],
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(host)
    termInstance.current = term
    fitAddon.fit()
    term.focus()
    term.writeln(`\x1b[2mConnecting to ${pod}${container ? ` (${container})` : ''}…\x1b[0m`)

    const params = new URLSearchParams({ namespace: ns, pod })
    if (container) params.set('container', container)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/streams/exec?${params.toString()}`)
    ws.binaryType = 'arraybuffer'
    // One decoder per stream so multi-byte characters split across frames decode correctly.
    const stdout = new TextDecoder()
    const stderr = new TextDecoder()
    let opened = false

    ws.onopen = () => {
      opened = true
      setStatus('connected')
      fitAddon.fit()
      ws.send(frame(wsStreamResize, JSON.stringify({ Width: term.cols, Height: term.rows })))
    }

    ws.onmessage = (ev) => {
      const data = new Uint8Array(ev.data as ArrayBuffer)
      if (data.length < 2) return
      if (data[0] === wsStreamStdout) term.write(stdout.decode(data.subarray(1), { stream: true }))
      else if (data[0] === wsStreamStderr) term.write(stderr.decode(data.subarray(1), { stream: true }))
    }

    ws.onerror = () => {
      if (!opened) setStatus('error')
    }

    ws.onclose = () => {
      if (opened) {
        setStatus('closed')
        term.writeln('\r\n\x1b[2m[session ended — press Reconnect to start a new one]\x1b[0m')
      } else {
        setStatus('error')
        term.writeln(
          '\r\n\x1b[31mCould not open a shell. The container may not include /bin/sh, or it is not running.\x1b[0m',
        )
      }
    }

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame(wsStreamStdin, data))
    })
    const onResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame(wsStreamResize, JSON.stringify({ Width: cols, Height: rows })))
    })

    // Refit on any container size change (window resize, sidebar toggle, panel layout).
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        // terminal already disposed
      }
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      onData.dispose()
      onResize.dispose()
      ws.onclose = null
      ws.close()
      term.dispose()
      termInstance.current = null
    }
  }, [ns, pod, container, containersReady, attempt])

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/workloads/pods')
  }

  if (!ns || !pod) {
    return (
      <PageBody>
        <PageHeader title="Shell" description="No pod selected." />
      </PageBody>
    )
  }

  const badge = statusBadge[status]

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
        description={`Shell · ${ns}`}
      >
        <Badge variant="outline" className={cn('h-5 text-[11px]', badge.className)}>
          {badge.label}
        </Badge>
        <ContainerSelect containers={containers} value={container} onChange={setContainer} includeInit={false} />
        <Button variant="outline" size="sm" className="h-7" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCwIcon />
          Reconnect
        </Button>
      </PageHeader>
      <div className="min-h-0 flex-1 bg-console p-2">
        <div ref={termRef} className="h-full w-full" />
      </div>
    </PageBody>
  )
}
