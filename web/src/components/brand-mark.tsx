import { ShipWheelIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The KubePilot logo tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        className,
      )}
    >
      <ShipWheelIcon className="size-[60%]" />
    </span>
  )
}
