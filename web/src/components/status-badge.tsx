import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type StatusTone = 'ok' | 'bad' | 'warn' | 'neutral'

const okValues = new Set([
  'running',
  'ready',
  'bound',
  'active',
  'available',
  'true',
  'completed',
  'complete',
  'succeeded',
  'deployed',
  'normal',
])

const warnValues = new Set([
  'pending',
  'terminating',
  'containercreating',
  'podinitializing',
  'waiting',
  'released',
  'suspended',
  'unknown',
  'superseded',
  'uninstalling',
])

export function statusTone(value: string): StatusTone {
  const v = value.toLowerCase().replace(/\s+/g, '')
  if (!v) return 'neutral'
  if (okValues.has(v)) return 'ok'
  if (
    v === 'failed' ||
    v === 'lost' ||
    v === 'notready' ||
    v === 'evicted' ||
    v === 'oomkilled' ||
    v === 'warning' ||
    v.includes('error') ||
    v.includes('backoff') ||
    v.includes('errimage') ||
    v.includes('invalid')
  ) {
    return 'bad'
  }
  if (warnValues.has(v) || v.startsWith('init:') || v.startsWith('pending-')) {
    return 'warn'
  }
  return 'neutral'
}

const dotClass: Record<StatusTone, string> = {
  ok: 'bg-success',
  bad: 'bg-destructive',
  warn: 'bg-warning',
  neutral: 'bg-muted-foreground/60',
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = statusTone(value)
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1.5 px-1.5 text-[11px] font-medium',
        tone === 'ok' && 'border-success/30 bg-success/10 text-success',
        tone === 'bad' && 'border-destructive/30 bg-destructive/10 text-destructive',
        tone === 'warn' && 'border-warning/30 bg-warning/10 text-warning',
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dotClass[tone])} />
      {value || '—'}
    </Badge>
  )
}

export function statusTextClass(value: string): string | undefined {
  const tone = statusTone(value)
  if (tone === 'ok') return 'text-success'
  if (tone === 'bad') return 'text-destructive'
  if (tone === 'warn') return 'text-warning'
  return undefined
}
