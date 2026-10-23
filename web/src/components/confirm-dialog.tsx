import { CircleHelpIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  pendingLabel = 'Working…',
  pending = false,
  destructive = false,
  icon,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: React.ReactNode
  confirmLabel?: string
  pendingLabel?: string
  pending?: boolean
  destructive?: boolean
  /** Badge icon; defaults to a warning for destructive actions and a question mark otherwise. */
  icon?: LucideIcon
  children?: React.ReactNode
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  const Icon = icon ?? (destructive ? TriangleAlertIcon : CircleHelpIcon)
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={
              destructive
                ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/20'
                : 'bg-primary/10 text-primary ring-1 ring-primary/20'
            }
          >
            <Icon />
          </AlertDialogMedia>
          <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => void onConfirm()}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
