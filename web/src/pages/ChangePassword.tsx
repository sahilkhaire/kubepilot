import { useState } from 'react'
import { changePassword } from '@/api'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import { Label } from '@/components/ui/label'
import { passwordError } from '@/lib/password'

type Props = {
  onChanged: () => void
}

export default function ChangePassword({ onChanged }: Props) {
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
    } catch {
      setError('Password change failed')
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
          <CardDescription>You must change your password before continuing.</CardDescription>
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
            <ErrorAlert message={error} className="mx-0 mt-0" onDismiss={() => setError('')} />
            <Button type="submit" disabled={pending || Boolean(mismatch && newPassword && confirm)}>
              {pending ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
