import type { User } from '@/api'
import { Badge } from '@/components/ui/badge'
import { PageBody, PageHeader } from '@/components/page-header'
import MetricsPanel from '@/components/MetricsPanel'

export default function Home({ user }: { user: User }) {
  return (
    <PageBody>
      <PageHeader
        title="Overview"
        description="Cluster metrics for the current session."
      >
        <Badge variant="outline" className="capitalize">
          {user.username} · {user.role}
        </Badge>
      </PageHeader>
      <MetricsPanel scope="cluster" title="Cluster metrics" />
    </PageBody>
  )
}
