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
import { SidebarTrigger } from '@/components/ui/sidebar'
import { catalog, kindUrl, settingsSection } from '@/lib/catalog'

type Crumb = { label: string; href?: string }

function crumbsFor(pathname: string): Crumb[] {
  if (pathname.includes('/logs')) return [{ label: 'Workloads', href: '/workloads/overview' }, { label: 'Pods', href: '/workloads/pods' }, { label: 'Logs' }]
  if (pathname.includes('/exec')) return [{ label: 'Workloads', href: '/workloads/overview' }, { label: 'Pods', href: '/workloads/pods' }, { label: 'Terminal' }]
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

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1 px-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.flatMap((crumb, i) => {
              const last = i === crumbs.length - 1
              const nodes = []
              if (i > 0) {
                nodes.push(<BreadcrumbSeparator key={`sep-${crumb.label}`} />)
              }
              nodes.push(
                <BreadcrumbItem key={crumb.label}>
                  {last || !crumb.href ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
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
      </div>
    </header>
  )
}
