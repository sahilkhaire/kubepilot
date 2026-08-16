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
import { Slider } from '@/components/ui/slider'

const MIN_REPLICAS = 0
const MAX_REPLICAS = 100

function clampReplicas(value: number): number {
  if (!Number.isFinite(value)) return MIN_REPLICAS
  return Math.min(MAX_REPLICAS, Math.max(MIN_REPLICAS, Math.round(value)))
}

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
  const [replicas, setReplicas] = useState(() => clampReplicas(current))

  useEffect(() => {
    if (open) setReplicas(clampReplicas(current))
  }, [open, current])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scale {name}</DialogTitle>
          <DialogDescription>
            Set the desired number of replicas (0–100). Current: {current}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="replicas">Replicas</Label>
            <Input
              id="replicas"
              type="number"
              min={MIN_REPLICAS}
              max={MAX_REPLICAS}
              value={replicas}
              onChange={(e) => setReplicas(clampReplicas(Number.parseInt(e.target.value, 10)))}
              disabled={pending}
              className="h-7 w-16 text-center"
            />
          </div>
          <Slider
            min={MIN_REPLICAS}
            max={MAX_REPLICAS}
            step={1}
            value={[replicas]}
            onValueChange={(value) => setReplicas(clampReplicas(value[0] ?? MIN_REPLICAS))}
            disabled={pending}
            aria-label="Replicas"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{MIN_REPLICAS}</span>
            <span>{MAX_REPLICAS}</span>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => void onConfirm(replicas)}>
            {pending ? 'Scaling…' : 'Scale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
