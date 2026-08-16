import * as React from 'react'
import { Link } from 'react-router-dom'
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
import { LayoutDashboardIcon } from 'lucide-react'

export function AppSidebar({
  user,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { username: string; role: string }
  onLogout: () => void
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/">
                <LayoutDashboardIcon className="size-5!" />
                <span className="text-sm font-semibold">KubePilot</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <NavMain includeSettings={user.role === 'owner'} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: user.username, role: user.role }} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
