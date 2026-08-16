import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { User } from '@/api'

export function AppShell({
  user,
  onLogout,
  children,
}: {
  user: User
  onLogout: () => void
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={
        {
          '--sidebar-width': '16.5rem',
          '--header-height': '2.5rem',
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="sidebar" user={user} onLogout={onLogout} />
      <SidebarInset className="min-h-0 overflow-hidden rounded-none shadow-none md:m-0">
        <SiteHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
