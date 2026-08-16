import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function statusTone(value: string): 'ok' | 'bad' | 'warn' | 'neutral' {
  const v = value.toLowerCase()
  if (
    v === 'running' ||
    v === 'ready' ||
    v === 'bound' ||
    v === 'active' ||
    v === 'available' ||
    v === 'true' ||
    v === 'completed' ||
    v === 'succeeded'
  ) {
    return 'ok'
  }
  if (
    v === 'failed' ||
    v === 'error' ||
    v === 'notready' ||
    v === 'evicted' ||
    v.includes('backoff') ||
    v.includes('errimage')
  ) {
    return 'bad'
  }
  if (
    v === 'pending' ||
    v === 'terminating' ||
    v === 'containercreating' ||
    v === 'podinitializing' ||
    v === 'waiting' ||
    v.startsWith('init:')
  ) {
    return 'warn'
  }
  return 'neutral'
}

export function StatusBadge({ value }: { value: string }) {
  const tone = statusTone(value)
  return (
    <Badge
      variant={tone === 'bad' ? 'destructive' : tone === 'ok' ? 'outline' : 'secondary'}
      className={cn(
        'h-5 px-1.5 text-[10px] font-medium',
        tone === 'ok' && 'border-emerald-500/40 text-emerald-500',
        tone === 'warn' && 'text-amber-500',
      )}
    >
      {value || '—'}
    </Badge>
  )
}

export function statusTextClass(value: string): string | undefined {
  const tone = statusTone(value)
  if (tone === 'ok') return 'text-emerald-500'
  if (tone === 'bad') return 'text-destructive'
  if (tone === 'warn') return 'text-amber-500'
  return undefined
}
