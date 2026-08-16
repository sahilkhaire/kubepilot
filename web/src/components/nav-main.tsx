import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { User } from '@/api'
import { catalog, grantModuleId, kindUrl, settingsSection, type CatalogKind, type CatalogSection } from '@/lib/catalog'
import { hasView } from '@/lib/grants'
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

function visibleKinds(section: CatalogSection, isOwner: boolean, grants?: Record<string, string[]>): CatalogKind[] {
  if (!section.kinds?.length) return []
  if (isOwner) return section.kinds
  return section.kinds.filter((kind) => {
    const module = grantModuleId(section, kind)
    return module ? hasView(grants, module) : false
  })
}

function sectionVisible(section: CatalogSection, isOwner: boolean, grants?: Record<string, string[]>): boolean {
  if (isOwner) return true
  if (section.kinds?.length) return visibleKinds(section, isOwner, grants).length > 0
  const module = grantModuleId(section)
  return module ? hasView(grants, module) : false
}

function NavSection({
  section,
  isOwner,
  grants,
}: {
  section: CatalogSection
  isOwner: boolean
  grants?: Record<string, string[]>
}) {
  const { pathname } = useLocation()
  const active = sectionActive(pathname, section)
  const Icon = section.icon
  const kinds = visibleKinds(section, isOwner, grants)

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

  if (kinds.length === 0) return null

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
            {kinds.map((kind) => {
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

export function NavMain({ user }: { user: User }) {
  const isOwner = user.role === 'owner'
  const sections = (isOwner ? [...catalog, settingsSection] : catalog).filter((section) =>
    sectionVisible(section, isOwner, user.grants),
  )
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {sections.map((section) => (
            <NavSection key={section.id} section={section} isOwner={isOwner} grants={user.grants} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
