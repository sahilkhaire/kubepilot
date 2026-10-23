import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  count,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Item count shown as a pill next to the title. */
  count?: number | string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
        {count != null ? (
          <span className="rounded-full border border-border bg-muted/60 px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
        {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function PageBody({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)} {...props}>
      {children}
    </div>
  )
}
