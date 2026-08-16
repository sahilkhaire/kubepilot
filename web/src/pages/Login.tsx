import { useState } from 'react'
import { login, me, type User } from '@/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LayoutDashboardIcon } from 'lucide-react'

type Props = {
  onLogin: (user: User) => void
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(username, password)
      const u = await me()
      if (!u) {
        throw new Error('invalid credentials')
      }
      onLogin(u)
      setPassword('')
    } catch {
      setError('Invalid credentials')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LayoutDashboardIcon className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">KubePilot</CardTitle>
            <CardDescription>Sign in with your username and password.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
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
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Signing in…' : 'Log in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
