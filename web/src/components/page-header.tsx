import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function PageBody({
  children,
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)} {...props}>
      {children}
    </div>
  )
}
