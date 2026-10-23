import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  BoxIcon,
  CornerDownLeftIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  type LucideIcon,
} from 'lucide-react'
import { getJSON } from '@/api'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUser } from '@/lib/auth-context'
import { catalog, grantModuleId, kindUrl, settingsIcons, settingsSection } from '@/lib/catalog'
import { can } from '@/lib/grants'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type SearchHit = { kind: string; namespace: string; name: string }

type Item = {
  id: string
  group: 'Go to' | 'Resources' | 'Preferences'
  label: string
  hint?: string
  icon: LucideIcon
  keywords?: string
  run: () => void
}

/** Where each searchable workload kind lives in the app. */
const kindPaths: Record<string, string> = {
  Pod: '/workloads/pods',
  Deployment: '/workloads/deployments',
  StatefulSet: '/workloads/statefulsets',
  DaemonSet: '/workloads/daemonsets',
  ReplicaSet: '/workloads/replicasets',
  Job: '/workloads/jobs',
  CronJob: '/workloads/cronjobs',
}

const PaletteContext = createContext<{ open: () => void } | null>(null)

export function useCommandPalette() {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider')
  return ctx
}

function matches(item: Item, q: string): boolean {
  if (!q) return true
  const hay = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((part) => hay.includes(part))
}

export function CommandPaletteProvider({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo(() => ({ open }), [open])
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={isOpen} onOpenChange={setOpen} onLogout={onLogout} />
    </PaletteContext.Provider>
  )
}

function CommandPalette({
  open,
  onOpenChange,
  onLogout,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogout: () => void
}) {
  const user = useUser()
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const canSearch = Object.values(kindPaths).some((path) => can(user, path.split('/')[2], 'view'))

  useEffect(() => {
    if (open) {
      setQuery('')
      setHits([])
      setActive(0)
    }
  }, [open])

  // Resource search hits the cluster, so wait until typing pauses.
  useEffect(() => {
    const q = query.trim()
    if (!open || !canSearch || q.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      getJSON<SearchHit[]>(`/api/k8s/search?q=${encodeURIComponent(q)}`, 'Search failed')
        .then((data) => {
          if (!cancelled) setHits(Array.isArray(data) ? data.slice(0, 30) : [])
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, open, canSearch])

  const go = useCallback(
    (path: string) => {
      onOpenChange(false)
      navigate(path)
    },
    [navigate, onOpenChange],
  )

  const pages = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const section of catalog) {
      if (section.url) {
        const mod = grantModuleId(section)
        if (mod && !can(user, mod, 'view')) continue
        out.push({
          id: `page:${section.url}`,
          group: 'Go to',
          label: section.title,
          icon: section.icon,
          run: () => go(section.url as string),
        })
        continue
      }
      for (const kind of section.kinds ?? []) {
        const mod = grantModuleId(section, kind)
        if (mod && !can(user, mod, 'view')) continue
        const url = kindUrl(section, kind)
        out.push({
          id: `page:${url}`,
          group: 'Go to',
          label: kind.label,
          hint: section.title,
          icon: section.icon,
          run: () => go(url),
        })
      }
    }
    if (user.role === 'owner') {
      for (const kind of settingsSection.kinds ?? []) {
        const url = kindUrl(settingsSection, kind)
        out.push({
          id: `page:${url}`,
          group: 'Go to',
          label: kind.label,
          hint: 'Settings',
          icon: settingsIcons[kind.module as keyof typeof settingsIcons] ?? settingsSection.icon,
          run: () => go(url),
        })
      }
    }
    return out
  }, [user, go])

  const preferences = useMemo<Item[]>(
    () => [
      { id: 'theme:dark', group: 'Preferences', label: 'Dark theme', icon: MoonIcon, keywords: 'appearance mode', run: () => { setTheme('dark'); onOpenChange(false) } },
      { id: 'theme:light', group: 'Preferences', label: 'Light theme', icon: SunIcon, keywords: 'appearance mode', run: () => { setTheme('light'); onOpenChange(false) } },
      { id: 'theme:system', group: 'Preferences', label: 'System theme', icon: MonitorIcon, keywords: 'appearance mode auto', run: () => { setTheme('system'); onOpenChange(false) } },
      { id: 'logout', group: 'Preferences', label: 'Log out', icon: LogOutIcon, keywords: 'sign out', run: () => { onOpenChange(false); onLogout() } },
    ],
    [setTheme, onOpenChange, onLogout],
  )

  const items = useMemo<Item[]>(() => {
    const q = query.trim()
    const resourceItems: Item[] = hits
      .filter((hit) => kindPaths[hit.kind])
      .map((hit) => ({
        id: `res:${hit.kind}:${hit.namespace}/${hit.name}`,
        group: 'Resources',
        label: hit.name,
        hint: `${hit.kind} · ${hit.namespace}`,
        icon: BoxIcon,
        run: () => go(`${kindPaths[hit.kind]}?select=${encodeURIComponent(`${hit.namespace}/${hit.name}`)}`),
      }))
    return [
      ...pages.filter((item) => matches(item, q)).slice(0, q ? 8 : 40),
      ...resourceItems,
      ...preferences.filter((item) => matches(item, q)),
    ]
  }, [pages, preferences, hits, query, go])

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(items.length - 1, 0)))
  }, [items.length])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (items.length ? (i + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[active]?.run()
    }
  }

  let lastGroup = ''
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[14vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search pages, resources and actions.</DialogDescription>
        <div className="flex items-center gap-2.5 border-b px-4">
          {searching ? (
            <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search pages, pods, deployments…"
            aria-label="Search"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searching ? 'Searching…' : `No results for “${query}”.`}
            </p>
          ) : (
            items.map((item, index) => {
              const header = item.group !== lastGroup ? item.group : null
              lastGroup = item.group
              const Icon = item.icon
              return (
                <div key={item.id}>
                  {header ? (
                    <p className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{header}</p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => item.run()}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm',
                      index === active ? 'bg-foreground/[0.06] text-foreground' : 'text-foreground/85',
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', index === active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="truncate">{item.label}</span>
                    {item.hint ? <span className="truncate text-xs text-muted-foreground">{item.hint}</span> : null}
                    {index === active ? (
                      <ArrowRightIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                  </button>
                </div>
              )
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="flex items-center rounded border bg-background px-1">
              <CornerDownLeftIcon className="size-3" />
            </kbd>
            open
          </span>
          <span className="ml-auto">Type 2+ letters to search workloads</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
