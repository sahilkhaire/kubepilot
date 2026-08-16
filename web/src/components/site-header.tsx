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

type Crumb = { label: string; href?: string }

function crumbsFor(pathname: string): Crumb[] {
  if (pathname === '/') return [{ label: 'Overview' }]
  if (pathname.startsWith('/workloads') && pathname.includes('/logs')) {
    return [{ label: 'Workloads', href: '/workloads' }, { label: 'Logs' }]
  }
  if (pathname.startsWith('/workloads') && pathname.includes('/exec')) {
    return [{ label: 'Workloads', href: '/workloads' }, { label: 'Terminal' }]
  }
  if (pathname.startsWith('/workloads') && pathname.endsWith('/yaml')) {
    return [{ label: 'Workloads', href: '/workloads' }, { label: 'YAML' }]
  }
  if (pathname.startsWith('/workloads')) return [{ label: 'Workloads' }]
  if (pathname.startsWith('/nodes') && pathname.endsWith('/yaml')) {
    return [{ label: 'Nodes', href: '/nodes' }, { label: 'YAML' }]
  }
  if (pathname.startsWith('/nodes')) return [{ label: 'Nodes' }]
  if (pathname.startsWith('/events')) return [{ label: 'Events' }]
  if (pathname.startsWith('/access') && pathname.endsWith('/yaml')) {
    return [{ label: 'Access Control', href: '/access' }, { label: 'YAML' }]
  }
  if (pathname.startsWith('/access')) return [{ label: 'Access Control' }]
  if (pathname.startsWith('/config') && pathname.endsWith('/yaml')) {
    return [{ label: 'Config', href: '/config' }, { label: 'YAML' }]
  }
  if (pathname.startsWith('/config')) return [{ label: 'Config' }]
  if (pathname.startsWith('/network') && pathname.endsWith('/yaml')) {
    return [{ label: 'Network', href: '/network' }, { label: 'YAML' }]
  }
  if (pathname.startsWith('/network')) return [{ label: 'Network' }]
  if (pathname.startsWith('/storage') && pathname.endsWith('/yaml')) {
    return [{ label: 'Storage', href: '/storage' }, { label: 'YAML' }]
  }
  if (pathname.startsWith('/storage')) return [{ label: 'Storage' }]
  if (pathname.startsWith('/custom-resources')) return [{ label: 'Custom Resources' }]
  if (pathname.startsWith('/helm')) return [{ label: 'Helm' }]
  if (pathname.startsWith('/settings/members')) {
    return [{ label: 'Settings', href: '/settings/members' }, { label: 'Members' }]
  }
  if (pathname.startsWith('/settings/sets')) {
    return [{ label: 'Settings', href: '/settings/members' }, { label: 'Permission sets' }]
  }
  if (pathname.startsWith('/settings/audit')) {
    return [{ label: 'Settings', href: '/settings/members' }, { label: 'Audit' }]
  }
  if (pathname.startsWith('/settings/app')) {
    return [{ label: 'Settings', href: '/settings/members' }, { label: 'App' }]
  }
  return [{ label: 'KubePilot' }]
}

export function SiteHeader() {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
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
