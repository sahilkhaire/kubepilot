import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { PageBody, PageHeader } from '@/components/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const tabs = [
  { value: 'members', label: 'Members', to: '/settings/members' },
  { value: 'sets', label: 'Permission sets', to: '/settings/sets' },
  { value: 'audit', label: 'Audit', to: '/settings/audit' },
  { value: 'app', label: 'App', to: '/settings/app' },
]

export default function SettingsLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = tabs.find((t) => pathname.startsWith(t.to))?.value ?? 'members'

  return (
    <PageBody>
      <PageHeader title="Settings" description="Owner-only members, grants, audit, and app configuration." />
      <Tabs
        value={current}
        onValueChange={(value) => {
          const tab = tabs.find((t) => t.value === value)
          if (tab) navigate(tab.to)
        }}
        className="px-3 pt-2"
      >
        <TabsList variant="line">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <Outlet />
      </div>
    </PageBody>
  )
}
