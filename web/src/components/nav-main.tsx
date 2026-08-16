import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { catalog, kindUrl, settingsSection, type CatalogSection } from '@/lib/catalog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { ChevronRightIcon } from 'lucide-react'

function sectionActive(pathname: string, section: CatalogSection): boolean {
  if (section.url) {
    if (section.url === '/') return pathname === '/'
    return pathname === section.url || pathname.startsWith(`${section.url}/`)
  }
  if (!section.basePath) return false
  return pathname === section.basePath || pathname.startsWith(`${section.basePath}/`)
}

function leafActive(pathname: string, url: string): boolean {
  return pathname === url || pathname.startsWith(`${url}/`)
}

function NavSection({ section }: { section: CatalogSection }) {
  const { pathname } = useLocation()
  const active = sectionActive(pathname, section)
  const Icon = section.icon

  const [open, setOpen] = useState(active)
  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  if (!section.kinds?.length) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={section.title} className="h-7 text-[13px]">
          <NavLink to={section.url ?? '/'}>
            <Icon />
            <span>{section.title}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={section.title} className="h-7 text-[13px]">
            <Icon />
            <span>{section.title}</span>
            <ChevronRightIcon className="ml-auto size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-2 gap-0 border-l py-0 pr-0">
            {section.kinds.map((kind) => {
              const url = kindUrl(section, kind)
              return (
                <SidebarMenuSubItem key={url}>
                  <SidebarMenuSubButton asChild size="sm" isActive={leafActive(pathname, url)}>
                    <NavLink to={url}>
                      <span>{kind.label}</span>
                    </NavLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function NavMain({ includeSettings }: { includeSettings: boolean }) {
  const sections = includeSettings ? [...catalog, settingsSection] : catalog
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {sections.map((section) => (
            <NavSection key={section.id} section={section} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
