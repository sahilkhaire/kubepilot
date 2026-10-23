import { Link, useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { SearchIcon } from 'lucide-react'
import { useCommandPalette } from '@/components/command-palette'
import { catalog, kindUrl, settingsSection } from '@/lib/catalog'

type Crumb = { label: string; href?: string }

function crumbsFor(pathname: string): Crumb[] {
  const podView = pathname.match(/^\/workloads\/[^/]+\/pods\/([^/]+)\/(logs|exec)$/)
  if (podView) {
    return [
      { label: 'Workloads', href: '/workloads/overview' },
      { label: 'Pods', href: '/workloads/pods' },
      { label: decodeURIComponent(podView[1]) },
      { label: podView[2] === 'logs' ? 'Logs' : 'Shell' },
    ]
  }
  if (pathname.endsWith('/yaml')) {
    const parts = pathname.split('/').filter(Boolean)
    const group = parts[0]
    const module = parts[1] === 'cluster' ? parts[2] : parts[2]
    const section = [...catalog, settingsSection].find((s) => s.id === group || s.basePath === `/${group}`)
    const kind = section?.kinds?.find((k) => k.module === module)
    if (section && kind) {
      return [
        { label: section.title, href: section.url ?? kindUrl(section, section.kinds![0]) },
        { label: kind.label, href: kindUrl(section, kind) },
        { label: 'YAML' },
      ]
    }
    return [{ label: 'YAML' }]
  }

  for (const section of [...catalog, settingsSection]) {
    if (section.url && (pathname === section.url || (section.url !== '/' && pathname.startsWith(`${section.url}/`)))) {
      return [{ label: section.title }]
    }
    if (section.basePath && (pathname === section.basePath || pathname.startsWith(`${section.basePath}/`))) {
      const rest = pathname.slice(section.basePath.length).replace(/^\//, '')
      const module = rest.split('/')[0]
      const kind = section.kinds?.find((k) => k.module === module)
      if (kind) {
        return [{ label: section.title, href: kindUrl(section, section.kinds![0]) }, { label: kind.label }]
      }
      return [{ label: section.title }]
    }
  }
  return [{ label: 'KubePilot' }]
}

export function SiteHeader() {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname)
  const palette = useCommandPalette()
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/70">
      <div className="flex w-full min-w-0 items-center gap-1 px-3">
        <SidebarTrigger className="-ml-1 text-muted-foreground" />
        <Separator orientation="vertical" className="mx-1.5 data-[orientation=vertical]:h-4" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap text-[13px]">
            {crumbs.flatMap((crumb, i) => {
              const last = i === crumbs.length - 1
              const nodes = []
              if (i > 0) {
                nodes.push(<BreadcrumbSeparator key={`sep-${i}`} className="text-muted-foreground/50" />)
              }
              nodes.push(
                <BreadcrumbItem key={`crumb-${i}`} className="min-w-0">
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>,
              )
              return nodes
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={palette.open}
            className="flex h-7 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground sm:w-56 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            aria-label="Open command palette"
          >
            <SearchIcon className="size-3.5" />
            <span className="hidden sm:inline">Search…</span>
            <kbd className="ml-auto hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
              {isMac ? '⌘' : 'Ctrl'} K
            </kbd>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
