import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const wsStreamStdin = 0
const wsStreamStdout = 1
const wsStreamResize = 4

function sendStdin(ws: WebSocket, data: string) {
  const enc = new TextEncoder().encode(data)
  const msg = new Uint8Array(1 + enc.length)
  msg[0] = wsStreamStdin
  msg.set(enc, 1)
  ws.send(msg)
}

function sendResize(ws: WebSocket, cols: number, rows: number) {
  const enc = new TextEncoder().encode(JSON.stringify({ Width: cols, Height: rows }))
  const msg = new Uint8Array(1 + enc.length)
  msg[0] = wsStreamResize
  msg.set(enc, 1)
  ws.send(msg)
}

export default function PodExec() {
  const { ns, pod } = useParams<{ ns: string; pod: string }>()
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState('')
  const termRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!ns || !pod || !termRef.current) return
    const namespace = ns
    const podName = pod

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      theme: { background: '#111111', foreground: '#eeeeee' },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termRef.current)
    fitAddon.fit()
    termInstance.current = term

    const params = new URLSearchParams({ namespace, pod: podName })
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/streams/exec?${params.toString()}`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setStatus('connected')
      setError('')
      fitAddon.fit()
      sendResize(ws, term.cols, term.rows)
    }

    ws.onmessage = (ev) => {
      const data = new Uint8Array(ev.data as ArrayBuffer)
      if (data.length < 2) return
      if (data[0] === wsStreamStdout) {
        term.write(new TextDecoder().decode(data.slice(1)))
      }
    }

    ws.onerror = () => {
      setError('connection error')
      setStatus('closed')
    }

    ws.onclose = () => {
      setStatus('closed')
    }

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        sendStdin(ws, data)
      }
    })

    const onResize = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        sendResize(ws, cols, rows)
      }
    })

    const onWindowResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', onWindowResize)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      onData.dispose()
      onResize.dispose()
      ws.close()
      term.dispose()
      termInstance.current = null
    }
  }, [ns, pod])

  if (!ns || !pod) {
    return (
      <PageBody>
        <PageHeader title="Terminal" description="Missing pod." />
      </PageBody>
    )
  }

  return (
    <PageBody>
      <PageHeader title={`Terminal: ${pod}`} description={`Namespace ${ns}`}>
        <Badge variant="outline" className="capitalize">
          {status}
        </Badge>
        <Button variant="outline" asChild>
          <Link to="/workloads/pods">Back to Pods</Link>
        </Button>
      </PageHeader>
      <ErrorAlert message={error} />
      <div ref={termRef} className="min-h-0 flex-1 rounded-xl bg-zinc-950 p-2" />
    </PageBody>
  )
}
