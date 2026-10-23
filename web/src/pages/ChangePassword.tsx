import { useState } from 'react'
import { changePassword } from '@/api'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import { Label } from '@/components/ui/label'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordError } from '@/lib/password'

type Props = {
  onChanged: () => void
  onLogout: () => void
}

export default function ChangePassword({ onChanged, onLogout }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const mismatch = passwordError(newPassword, confirm)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mismatch) {
      setError(mismatch)
      return
    }
    setError('')
    setPending(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">Change password</CardTitle>
          <CardDescription>
            Your administrator set a temporary password. Choose a new one ({PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH}{' '}
            characters) to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {mismatch && newPassword && confirm ? <p className="text-xs text-destructive">{mismatch}</p> : null}
            <ErrorAlert message={error} className="mx-0 mt-0" onDismiss={() => setError('')} />
            <Button type="submit" disabled={pending || Boolean(mismatch && newPassword && confirm)}>
              {pending ? 'Saving…' : 'Change password'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onLogout} disabled={pending}>
              Sign out instead
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
