import { useEffect, useState } from 'react'
import { Trash2Icon } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type DeleteConfirmProps = {
  resourceName: string
  resourceLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  pending?: boolean
  open?: boolean
}

export default function DeleteConfirm({
  resourceName,
  resourceLabel = 'resource',
  onConfirm,
  onCancel,
  pending = false,
  open = true,
}: DeleteConfirmProps) {
  const [typed, setTyped] = useState('')
  const matches = typed === resourceName

  useEffect(() => {
    if (open) setTyped('')
  }, [open, resourceName])

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          // Start in the confirmation box rather than on Cancel.
          e.preventDefault()
          document.getElementById('confirm-name')?.focus()
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (matches && !pending) void onConfirm()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive ring-1 ring-destructive/20">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle className="break-all">
              Delete {resourceLabel} {resourceName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Type <span className="font-mono font-medium text-foreground">{resourceName}</span>{' '}
              to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="confirm-name" className="sr-only">
              Resource name
            </Label>
            <Input
              id="confirm-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={resourceName}
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
