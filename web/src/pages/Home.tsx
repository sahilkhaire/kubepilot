import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { User } from '@/api'
import { Badge } from '@/components/ui/badge'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { ErrorAlert } from '@/components/error-alert'
import MetricsPanel from '@/components/MetricsPanel'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const labels: Record<string, { label: string; href: string }> = {
  pods: { label: 'Pods', href: '/workloads/pods' },
  deployments: { label: 'Deployments', href: '/workloads/deployments' },
  statefulsets: { label: 'Stateful Sets', href: '/workloads/statefulsets' },
  daemonsets: { label: 'Daemon Sets', href: '/workloads/daemonsets' },
  replicasets: { label: 'Replica Sets', href: '/workloads/replicasets' },
  jobs: { label: 'Jobs', href: '/workloads/jobs' },
  cronjobs: { label: 'Cron Jobs', href: '/workloads/cronjobs' },
}

export default function Home({ user }: { user: User }) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/k8s/cluster/overview', { credentials: 'same-origin' })
        if (!res.ok) {
          throw new Error('failed to load cluster overview')
        }
        const data: Record<string, number> = await res.json()
        if (!cancelled) setCounts(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageBody>
      <PageHeader title="Overview" description="Workload counts across granted namespaces.">
        <Badge variant="outline" className="h-5 capitalize">
          {user.username} · {user.role}
        </Badge>
      </PageHeader>
      <ErrorAlert message={error} />
      {loading ? (
        <PageLoading compact />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          {Object.entries(labels).map(([key, meta]) => (
            <Link key={key} to={meta.href} className="min-w-0">
              <Card className="shadow-none ring-foreground/8 transition-colors hover:bg-muted/40">
                <CardHeader className="gap-1 py-3">
                  <CardDescription className="text-[11px]">{meta.label}</CardDescription>
                  <CardTitle className="text-xl tabular-nums">{counts[key] ?? '—'}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <MetricsPanel scope="cluster" title="Cluster metrics" />
    </PageBody>
  )
}
