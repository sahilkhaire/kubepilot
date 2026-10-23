import { useState } from 'react'
import { login, me, type User } from '@/api'
import { AuthLayout } from '@/components/auth-layout'
import { ErrorAlert } from '@/components/error-alert'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  notice?: string
  onLogin: (user: User) => void
}

export default function Login({ notice, onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(username.trim(), password)
      const u = await me()
      if (!u) {
        throw new Error('Signed in, but the session could not be loaded. Check that cookies are enabled.')
      }
      setPassword('')
      onLogin(u)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout title="Sign in to KubePilot" subtitle="Use the account your administrator gave you.">
      <form onSubmit={onSubmit} className="grid gap-4">
        {notice && !error ? (
          <Alert className="border-primary/30 bg-primary/5">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="username" className="text-xs text-muted-foreground">
            Username
          </Label>
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            className="h-9"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password" className="text-xs text-muted-foreground">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-9"
          />
        </div>
        <ErrorAlert message={error} className="mx-0 mt-0" onDismiss={() => setError('')} />
        <Button type="submit" disabled={pending} className="h-9">
          {pending ? 'Signing in…' : 'Continue'}
        </Button>
      </form>
    </AuthLayout>
  )
}
