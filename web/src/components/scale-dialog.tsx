import { useEffect, useState } from 'react'
import { MinusIcon, PlusIcon } from 'lucide-react'
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
  kindLabel,
  current,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  name: string
  kindLabel?: string
  current: number
  pending: boolean
  onConfirm: (replicas: number) => void | Promise<void>
  onCancel: () => void
}) {
  const [replicas, setReplicas] = useState(() => clampReplicas(current))

  useEffect(() => {
    if (open) setReplicas(clampReplicas(current))
  }, [open, current])

  const unchanged = replicas === current

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!pending && !unchanged) void onConfirm(replicas)
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-all">Scale {name}</DialogTitle>
            <DialogDescription>
              Set the desired number of replicas{kindLabel ? ` for this ${kindLabel}` : ''}. Currently {current}.
              {replicas === 0 && current > 0 ? ' Scaling to 0 stops all pods.' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="replicas">Replicas</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Decrease replicas"
                  disabled={pending || replicas <= MIN_REPLICAS}
                  onClick={() => setReplicas((r) => clampReplicas(r - 1))}
                >
                  <MinusIcon />
                </Button>
                <Input
                  id="replicas"
                  type="number"
                  inputMode="numeric"
                  min={MIN_REPLICAS}
                  max={MAX_REPLICAS}
                  value={replicas}
                  onChange={(e) => setReplicas(clampReplicas(Number.parseInt(e.target.value || '0', 10)))}
                  onFocus={(e) => e.target.select()}
                  disabled={pending}
                  className="h-8 w-16 text-center tabular-nums"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Increase replicas"
                  disabled={pending || replicas >= MAX_REPLICAS}
                  onClick={() => setReplicas((r) => clampReplicas(r + 1))}
                >
                  <PlusIcon />
                </Button>
              </div>
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
            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>{MIN_REPLICAS}</span>
              <span>{MAX_REPLICAS}</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || unchanged}>
              {pending ? 'Scaling…' : `Scale to ${replicas}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
