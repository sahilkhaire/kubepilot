import { ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatAge } from '@/lib/k8s-fields'
import { timestampSortValue } from '@/lib/table-sort'
import { cn } from '@/lib/utils'

export type EventItem = {
  metadata?: { name?: string; namespace?: string; creationTimestamp?: string }
  involvedObject?: { kind?: string; name?: string; namespace?: string }
  reason?: string
  message?: string
  type?: string
  count?: number
  lastTimestamp?: string
  eventTime?: string
}

export function eventTime(ev: EventItem): string | undefined {
  return ev.lastTimestamp || ev.eventTime || ev.metadata?.creationTimestamp
}

/** Side panel used for resource details next to a list. */
export function DetailPanel({
  kind,
  name,
  actions,
  children,
}: {
  kind: string
  name: string
  actions: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-l bg-background max-sm:absolute max-sm:inset-0 max-sm:z-20 sm:w-md lg:w-lg xl:w-xl">
      <header className="flex min-h-11 items-center gap-1 border-b px-3 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] leading-tight text-muted-foreground">{kind}</p>
          <h2 className="truncate text-sm leading-tight font-semibold" title={name}>
            {name}
          </h2>
        </div>
        {actions}
      </header>
      {children}
    </aside>
  )
}

export function DetailSection({
  title,
  count,
  children,
  className,
}: {
  title: string
  count?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('border-b px-3 py-3 last:border-b-0', className)}>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {title}
        {count != null ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
            {count}
          </Badge>
        ) : null}
      </h3>
      {children}
    </section>
  )
}

export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function MetaList({ entries }: { entries: Record<string, string> }) {
  const keys = Object.keys(entries).sort()
  if (keys.length === 0) return <span className="text-muted-foreground">None</span>
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRightIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        {keys.length} {keys.length === 1 ? 'entry' : 'entries'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 space-y-0.5 rounded-md bg-muted/50 p-2 font-mono text-[11px]">
          {keys.map((key) => (
            <li key={key} className="break-all">
              <span className="text-muted-foreground">{key}=</span>
              {entries[key]}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ConditionBadges({ conditions }: { conditions: { key: string; label: string; ok: boolean }[] }) {
  if (conditions.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {conditions.map((c) => (
        <Badge
          key={c.key}
          variant="outline"
          className={cn(
            'h-5 px-1.5 text-[11px]',
            c.ok
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive',
          )}
        >
          {c.label}
        </Badge>
      ))}
    </div>
  )
}

/** Events, newest first. */
export function EventList({ events, emptyText = 'No recent events.' }: { events: EventItem[]; emptyText?: string }) {
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>
  }
  const sorted = [...events].sort((a, b) => timestampSortValue(eventTime(b)) - timestampSortValue(eventTime(a)))
  return (
    <ul className="space-y-2.5">
      {sorted.map((ev, i) => {
        const warning = ev.type === 'Warning'
        return (
          <li
            key={`${ev.metadata?.namespace}/${ev.metadata?.name ?? i}`}
            className={cn('border-l-2 pl-2 text-xs', warning ? 'border-destructive' : 'border-border')}
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={cn('font-medium', warning && 'text-destructive')}>{ev.reason || 'Event'}</span>
              <span className="text-muted-foreground">
                {formatAge(eventTime(ev))} ago{ev.count && ev.count > 1 ? ` · ×${ev.count}` : ''}
              </span>
            </div>
            {ev.message ? <p className="mt-0.5 break-words text-muted-foreground">{ev.message}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}
