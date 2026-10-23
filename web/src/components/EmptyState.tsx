import type { LucideIcon } from 'lucide-react'
import { InboxIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  children: React.ReactNode
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
}

export default function EmptyState({ children, icon: Icon = InboxIcon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-12 text-center', className)}>
      <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}
