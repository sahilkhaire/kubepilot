import { useEffect, useState } from 'react'

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
          throw new Error('failed to load settings')
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
        throw new Error('failed to save settings')
      }
      const data: AppSettings = await res.json()
      setRepos(data.helmRepositories ?? [])
      setMessage('Saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p>Loading…</p>
  }

  return (
    <div>
      <h2>App settings</h2>
      <p>Configure Helm chart repositories. No public repos are added by default.</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}
      <form onSubmit={onSave}>
        {repos.map((repo, index) => (
          <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Name"
              value={repo.name}
              onChange={(e) => updateRepo(index, 'name', e.target.value)}
              required
            />
            <input
              type="url"
              placeholder="https://charts.example.com"
              value={repo.url}
              onChange={(e) => updateRepo(index, 'url', e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <button type="button" onClick={() => removeRepo(index)}>Remove</button>
          </div>
        ))}
        <div style={{ marginTop: '1rem' }}>
          <button type="button" onClick={addRepo} style={{ marginRight: '0.5rem' }}>Add repository</button>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
