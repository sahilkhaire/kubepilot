import { useState } from 'react'
import { login, me, type User } from '@/api'
import { BrandMark } from '@/components/brand-mark'
import { ErrorAlert } from '@/components/error-alert'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/theme-toggle'

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
    <main className="relative flex min-h-svh items-center justify-center bg-muted/40 p-4 sm:p-6">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2.5 px-1">
          <BrandMark className="size-9" />
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">KubePilot</p>
            <p className="text-xs text-muted-foreground">Kubernetes console</p>
          </div>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold tracking-tight">Sign in</CardTitle>
            <CardDescription>Use the username and password your administrator gave you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4">
              {notice && !error ? (
                <Alert>
                  <AlertDescription>{notice}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
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
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <ErrorAlert message={error} className="mx-0 mt-0" onDismiss={() => setError('')} />
              <Button type="submit" disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
