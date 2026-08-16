import * as React from 'react'
import { Link } from 'react-router-dom'
import { NavMain, type NavGroup } from '@/components/nav-main'
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
import {
  BoxesIcon,
  ClipboardListIcon,
  FileCogIcon,
  HardDriveIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  NetworkIcon,
  PuzzleIcon,
  ScrollTextIcon,
  ServerIcon,
  ShieldIcon,
  ShipIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from 'lucide-react'

const mainGroups: NavGroup[] = [
  {
    label: 'Cluster',
    items: [
      { title: 'Overview', url: '/', icon: LayoutDashboardIcon },
      { title: 'Nodes', url: '/nodes', icon: ServerIcon },
      { title: 'Events', url: '/events', icon: ScrollTextIcon },
    ],
  },
  {
    label: 'Workloads',
    items: [{ title: 'Pods', url: '/workloads', icon: BoxesIcon }],
  },
  {
    label: 'Config',
    items: [{ title: 'Config', url: '/config', icon: FileCogIcon }],
  },
  {
    label: 'Network',
    items: [{ title: 'Network', url: '/network', icon: NetworkIcon }],
  },
  {
    label: 'Storage',
    items: [{ title: 'Storage', url: '/storage', icon: HardDriveIcon }],
  },
  {
    label: 'Access',
    items: [{ title: 'Access Control', url: '/access', icon: ShieldIcon }],
  },
  {
    label: 'Custom resources',
    items: [{ title: 'Custom Resources', url: '/custom-resources', icon: PuzzleIcon }],
  },
  {
    label: 'Helm',
    items: [{ title: 'Helm', url: '/helm', icon: ShipIcon }],
  },
]

const settingsGroup: NavGroup = {
  label: 'Settings',
  items: [
    { title: 'Members', url: '/settings/members', icon: UsersIcon },
    { title: 'Permission sets', url: '/settings/sets', icon: KeyRoundIcon },
    { title: 'Audit', url: '/settings/audit', icon: ClipboardListIcon },
    { title: 'App', url: '/settings/app', icon: SlidersHorizontalIcon },
  ],
}

export function AppSidebar({
  user,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { username: string; role: string }
  onLogout: () => void
}) {
  const groups = user.role === 'owner' ? [...mainGroups, settingsGroup] : mainGroups

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/">
                <LayoutDashboardIcon className="size-5!" />
                <span className="text-base font-semibold">KubePilot</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: user.username, role: user.role }} onLogout={onLogout} />
      </SidebarFooter>
    </Sidebar>
  )
}
