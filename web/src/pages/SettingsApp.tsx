import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { readAPIError } from '@/api'
import { ErrorAlert } from '@/components/error-alert'
import EmptyState from '@/components/EmptyState'
import { PageLoading } from '@/components/page-loading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type HelmRepository = {
  name: string
  url: string
}

type AppSettings = {
  helmRepositories: HelmRepository[]
}

export default function SettingsApp() {
  const [repos, setRepos] = useState<HelmRepository[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/settings/app', { credentials: 'same-origin' })
        if (!res.ok) {
          throw new Error(await readAPIError(res, 'Failed to load settings'))
        }
        const data: AppSettings = await res.json()
        if (!cancelled) {
          setRepos(data.helmRepositories ?? [])
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function updateRepo(index: number, field: keyof HelmRepository, value: string) {
    setRepos((prev) => prev.map((repo, i) => (i === index ? { ...repo, [field]: value } : repo)))
  }

  function addRepo() {
    setRepos((prev) => [...prev, { name: '', url: '' }])
  }

  function removeRepo(index: number) {
    setRepos((prev) => prev.filter((_, i) => i !== index))
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/settings/app', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helmRepositories: repos }),
      })
      if (!res.ok) {
        throw new Error(await readAPIError(res, 'Failed to save settings'))
      }
      const data: AppSettings = await res.json()
      setRepos(data.helmRepositories ?? [])
      setMessage('')
      toast.success('Settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <PageLoading compact />
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-medium">Helm repositories</h2>
        <p className="text-xs text-muted-foreground">Chart sources for Helm installs. No public repositories are added by default.</p>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <ErrorAlert message={error} className="mx-0 mt-0" />
        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={onSave} className="space-y-4">
          {repos.length === 0 ? (
            <EmptyState className="py-6">No Helm repositories configured.</EmptyState>
          ) : null}
          {repos.map((repo, index) => (
            <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-2">
                <Label htmlFor={`repo-name-${index}`}>Name</Label>
                <Input
                  id={`repo-name-${index}`}
                  type="text"
                  placeholder="Name"
                  value={repo.name}
                  onChange={(e) => updateRepo(index, 'name', e.target.value)}
                  required
                />
              </div>
              <div className="grid flex-[2] gap-2">
                <Label htmlFor={`repo-url-${index}`}>URL</Label>
                <Input
                  id={`repo-url-${index}`}
                  type="url"
                  placeholder="https://charts.example.com"
                  value={repo.url}
                  onChange={(e) => updateRepo(index, 'url', e.target.value)}
                  required
                />
              </div>
              <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => removeRepo(index)}>
                Remove
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={addRepo}>
              Add repository
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
