import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 p-3', className)}>{children}</div>
  )
}
