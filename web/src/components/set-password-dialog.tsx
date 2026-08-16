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
import { generatePassword, passwordError } from '@/lib/password'

export function SetPasswordDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  pending: boolean
  error: string
  onConfirm: (password: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = passwordError(password, confirm)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirm('')
    }
  }, [open])

  function fillGenerated() {
    const next = generatePassword()
    setPassword(next)
    setConfirm(next)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (mismatch || pending) return
            void onConfirm(password)
          }}
        >
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="set-password">New password</Label>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={fillGenerated}>
                Generate
              </Button>
            </div>
            <Input
              id="set-password"
              type="text"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="set-password-confirm">Confirm password</Label>
            <Input
              id="set-password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          {mismatch && password && confirm ? <p className="text-sm text-destructive">{mismatch}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || Boolean(mismatch)}>
              {pending ? 'Saving…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
