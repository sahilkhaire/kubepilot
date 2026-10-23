import * as React from 'react'
import { getVersion } from '@/api'
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
  const [version, setVersion] = React.useState('')
  React.useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="hover:bg-transparent active:bg-transparent">
              <Link to="/">
                <BrandMark className="size-8 rounded-lg shadow-[0_0_0_1px_oklch(1_0_0/0.12),0_4px_14px_-4px_var(--glow)]" />
                <span className="grid leading-tight">
                  <span className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">KubePilot</span>
                  <span className="text-[11px] text-muted-foreground">Kubernetes console</span>
                </span>
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
          version={version}
          onLogout={onLogout}
        />
        {version ? (
          <p
            className="px-2 pb-1 text-[11px] text-muted-foreground/70 tabular-nums group-data-[collapsible=icon]:hidden"
            title="KubePilot version"
          >
            KubePilot {formatVersion(version)}
          </p>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}

/** Shows release tags as-is ("v0.2.0") and prefixes bare numbers with "v". */
function formatVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version
}
