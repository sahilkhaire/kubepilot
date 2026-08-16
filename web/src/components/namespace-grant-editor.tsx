import { useEffect, useState } from 'react'
import type { NamespaceScope } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { XIcon } from 'lucide-react'

export type NamespaceGrantValue = {
  namespaceScope: NamespaceScope
  namespaces: string[]
  namespaceRegex: string[]
}

function addUnique(list: string[], value: string): string[] {
  const next = value.trim()
  if (!next || list.includes(next)) return list
  return [...list, next]
}

function ChipList({
  items,
  onRemove,
  prefix,
  suffix,
}: {
  items: string[]
  onRemove: (value: string) => void
  prefix?: string
  suffix?: string
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">None yet.</p>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item} variant="outline" className="gap-1 pr-1">
          <span className="font-mono">
            {prefix}
            {item}
            {suffix}
          </span>
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-muted"
            onClick={() => onRemove(item)}
            aria-label={`Remove ${item}`}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  )
}

export function NamespaceGrantEditor({
  value,
  onChange,
}: {
  value: NamespaceGrantValue
  onChange: (value: NamespaceGrantValue) => void
}) {
  const [clusterNamespaces, setClusterNamespaces] = useState<string[]>([])
  const [nameInput, setNameInput] = useState('')
  const [regexInput, setRegexInput] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
        if (!res.ok) return
        const data = (await res.json()) as string[]
        if (!cancelled) setClusterNamespaces(data)
      } catch {
        // cluster list is optional for typing names that do not exist yet
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function addName(raw: string) {
    const next = addUnique(value.namespaces, raw)
    if (next === value.namespaces) return
    onChange({ ...value, namespaces: next })
    setNameInput('')
  }

  function addRegex(raw: string) {
    const next = addUnique(value.namespaceRegex, raw)
    if (next === value.namespaceRegex) return
    onChange({ ...value, namespaceRegex: next })
    setRegexInput('')
  }

  const selected = value.namespaceScope === 'selected'

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <h3 className="text-sm font-medium">Namespaces</h3>
        <p className="text-xs text-muted-foreground">
          Applies to namespaced modules. The install namespace is never granted. Cluster-scoped
          modules ignore this list.
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={selected ? 'outline' : 'default'}
          onClick={() => onChange({ ...value, namespaceScope: 'all' })}
        >
          All namespaces
        </Button>
        <Button
          type="button"
          size="sm"
          variant={selected ? 'default' : 'outline'}
          onClick={() => onChange({ ...value, namespaceScope: 'selected' })}
        >
          Selected
        </Button>
      </div>
      {selected ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ps-ns-name">Exact names</Label>
            <div className="flex gap-2">
              <Input
                id="ps-ns-name"
                list="ps-ns-cluster"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addName(nameInput)
                  }
                }}
                placeholder="dev"
              />
              <Button type="button" variant="outline" onClick={() => addName(nameInput)}>
                Add
              </Button>
            </div>
            <datalist id="ps-ns-cluster">
              {clusterNamespaces.map((ns) => (
                <option key={ns} value={ns} />
              ))}
            </datalist>
            <ChipList
              items={value.namespaces}
              onRemove={(item) =>
                onChange({ ...value, namespaces: value.namespaces.filter((ns) => ns !== item) })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ps-ns-regex">Regex (full name)</Label>
            <div className="flex gap-2">
              <Input
                id="ps-ns-regex"
                value={regexInput}
                onChange={(e) => setRegexInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addRegex(regexInput)
                  }
                }}
                placeholder="team-.*"
              />
              <Button type="button" variant="outline" onClick={() => addRegex(regexInput)}>
                Add
              </Button>
            </div>
            <ChipList
              items={value.namespaceRegex}
              prefix="/"
              suffix="/"
              onRemove={(item) =>
                onChange({
                  ...value,
                  namespaceRegex: value.namespaceRegex.filter((pattern) => pattern !== item),
                })
              }
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          All current and future namespaces except the install namespace.
        </p>
      )}
    </div>
  )
}
