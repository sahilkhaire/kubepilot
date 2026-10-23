import { useCallback, useEffect, useState } from 'react'
import { SearchIcon, XIcon } from 'lucide-react'
import { getJSON } from '@/api'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export const ALL_NAMESPACES = '__all__'
const STORAGE_KEY = 'kubepilot.namespace'

export function isAllNamespaces(value: string): boolean {
  return value === ALL_NAMESPACES || value === ''
}

export function resolveNamespaceValue(prev: string, namespaces: string[]): string {
  if (isAllNamespaces(prev) || namespaces.includes(prev)) {
    return isAllNamespaces(prev) ? ALL_NAMESPACES : prev
  }
  return ALL_NAMESPACES
}

function readStoredNamespace(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ALL_NAMESPACES
  } catch {
    return ALL_NAMESPACES
  }
}

function storeNamespace(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // storage unavailable; the choice just won't persist
  }
}

/**
 * Loads the namespaces the user can see and remembers the selected one across pages.
 * `ready` turns true once the list has loaded (or failed), so callers don't fetch with a stale selection.
 */
export function useNamespaces() {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespaceState] = useState(readStoredNamespace)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getJSON<string[]>('/api/k8s/namespaces', 'Failed to load namespaces')
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setNamespaces(list)
        setNamespaceState((prev) => resolveNamespaceValue(prev, list))
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load namespaces')
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setNamespace = useCallback((value: string) => {
    setNamespaceState(value)
    storeNamespace(value)
  }, [])

  return { namespaces, namespace, setNamespace, ready, error }
}

export function NamespaceSelect({
  namespaces,
  value,
  onChange,
}: {
  namespaces: string[]
  value: string
  onChange: (value: string) => void
}) {
  if (namespaces.length === 0) {
    return null
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-7 min-w-36 text-xs" aria-label="Namespace">
        <span className="text-muted-foreground">ns:</span>
        <SelectValue placeholder="Select namespace" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_NAMESPACES}>All namespaces</SelectItem>
        {namespaces.map((ns) => (
          <SelectItem key={ns} value={ns}>
            {ns}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function FilterInput({
  value,
  onChange,
  placeholder = 'Filter…',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('')
        }}
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, '')}
        className="h-7 w-44 pr-7 pl-7 text-xs md:text-xs sm:w-52"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
