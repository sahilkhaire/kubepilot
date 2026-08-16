import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
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

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {resourceLabel} {resourceName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. Type the name to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="confirm-name">Resource name</Label>
          <Input
            id="confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={resourceName}
            disabled={pending}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!matches || pending} onClick={() => void onConfirm()}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
