import type { ComponentProps, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ActionTooltip({
  label,
  children,
  side = 'bottom',
}: {
  label: string
  children: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function IconActionButton({
  tooltip,
  side = 'bottom',
  variant = 'ghost',
  size = 'icon-xs',
  ...props
}: ComponentProps<typeof Button> & {
  tooltip: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <ActionTooltip label={tooltip} side={side}>
      <span className="inline-flex">
        <Button variant={variant} size={size} {...props} aria-label={tooltip} />
      </span>
    </ActionTooltip>
  )
}
