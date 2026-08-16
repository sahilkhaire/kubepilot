import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ScaleDialog({
  open,
  name,
  current,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  name: string
  current: number
  pending: boolean
  onConfirm: (replicas: number) => void | Promise<void>
  onCancel: () => void
}) {
  const [replicas, setReplicas] = useState(String(current))

  useEffect(() => {
    if (open) setReplicas(String(current))
  }, [open, current])

  const parsed = Number.parseInt(replicas, 10)
  const valid = Number.isInteger(parsed) && parsed >= 0

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scale {name}</DialogTitle>
          <DialogDescription>Set the desired number of replicas. Current: {current}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="replicas">Replicas</Label>
          <Input
            id="replicas"
            type="number"
            min={0}
            value={replicas}
            onChange={(e) => setReplicas(e.target.value)}
            disabled={pending}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || !valid} onClick={() => void onConfirm(parsed)}>
            {pending ? 'Scaling…' : 'Scale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
