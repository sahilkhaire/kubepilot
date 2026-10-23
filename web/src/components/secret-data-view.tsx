import { useMemo, useState } from 'react'
import { CheckIcon, ChevronRightIcon, CopyIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

type Entry = { key: string; value: string; binary: boolean }

function unquote(text: string): string {
  const t = text.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

function decodeBase64(b64: string): { value: string; binary: boolean } {
  try {
    const bytes = Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0))
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { value, binary: false }
  } catch {
    return { value: `${b64.length} bytes of base64 (binary)`, binary: true }
  }
}

/**
 * Reads the top-level `data:` block of a Secret manifest. Kubernetes serializes each
 * value as a single base64 line, so a small line parser is enough here.
 */
function parseSecretData(yaml: string): Entry[] | null {
  const lines = yaml.split('\n')
  const start = lines.findIndex((line) => /^data:\s*(\{\})?\s*$/.test(line))
  if (start === -1) return null
  const out: Entry[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (!/^\s/.test(line)) break
    const match = /^\s+("[^"]*"|'[^']*'|[^:]+):\s*(.*)$/.exec(line)
    if (!match) continue
    const decoded = decodeBase64(unquote(match[2]))
    out.push({ key: unquote(match[1]), ...decoded })
  }
  return out
}

function EntryRow({ entry }: { entry: Entry }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.value)
      setCopied(true)
      toast.success(`Copied ${entry.key}`)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }
  const multiline = entry.value.includes('\n')
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-start gap-2 border-b px-3 py-1.5 last:border-b-0">
      <span className="truncate pt-0.5 font-mono text-[11px] font-medium" title={entry.key}>
        {entry.key}
      </span>
      <pre
        className={`max-h-32 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all ${entry.binary ? 'text-muted-foreground italic' : ''} ${multiline ? '' : 'pt-0.5'}`}
      >
        {entry.value || <span className="text-muted-foreground italic">empty</span>}
      </pre>
      {!entry.binary ? (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Copy ${entry.key}`} onClick={() => void copy()}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      ) : (
        <span className="size-6" />
      )}
    </li>
  )
}

/** Decoded view of a revealed Secret's values, kept in sync with the YAML being edited. */
export function SecretDataView({ yaml }: { yaml: string }) {
  const entries = useMemo(() => parseSecretData(yaml), [yaml])
  const [open, setOpen] = useState(true)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="shrink-0 rounded-md border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium">
        <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="whitespace-nowrap">Decoded values</span>
        <span className="text-muted-foreground tabular-nums">{entries?.length ?? 0}</span>
        <span className="ml-auto truncate font-normal text-muted-foreground max-sm:hidden">
          To change a value, edit its base64 in the YAML
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {entries && entries.length > 0 ? (
          <ul className="max-h-60 overflow-y-auto border-t">
            {entries.map((entry) => (
              <EntryRow key={entry.key} entry={entry} />
            ))}
          </ul>
        ) : (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">This secret has no data.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
