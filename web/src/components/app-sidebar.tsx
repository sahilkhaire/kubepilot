import * as React from 'react'
import { Link } from 'react-router-dom'
import type { User } from '@/api'
import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { BrandMark } from '@/components/brand-mark'

export function AppSidebar({
  user,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User
  onLogout: () => void
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/">
                <BrandMark className="size-6 rounded-md" />
                <span className="text-sm font-semibold tracking-tight">KubePilot</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <NavMain user={user} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{ name: user.displayName || user.username, username: user.username, role: user.role }}
          onLogout={onLogout}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
