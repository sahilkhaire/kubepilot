import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, CompassIcon } from 'lucide-react'
import { readAPIError } from '@/api'
import EmptyState from '@/components/EmptyState'
import { PageBody, PageHeader } from '@/components/page-header'
import { ErrorAlert } from '@/components/error-alert'
import MetricsPanel from '@/components/MetricsPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
import { useUser } from '@/lib/auth-context'
import { catalog, kindUrl } from '@/lib/catalog'
import { can, hasView } from '@/lib/grants'
import { workloadKinds } from '@/lib/workload-kinds'

/** First page the user may open, used when they cannot see the overview. */
function firstAllowedPage(user: ReturnType<typeof useUser>): { title: string; url: string } | null {
  for (const section of catalog) {
    if (section.id === 'overview') continue
    if (section.url && section.grantModule && hasView(user.grants, section.grantModule)) {
      return { title: section.title, url: section.url }
    }
    for (const kind of section.kinds ?? []) {
      if (hasView(user.grants, kind.grantModule ?? kind.module)) {
        return { title: `${section.title} · ${kind.label}`, url: kindUrl(section, kind) }
      }
    }
  }
  return null
}

export default function Home() {
  const user = useUser()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const canOverview = can(user, 'cluster.overview', 'view')
  const canMetrics = can(user, 'metrics', 'view')
  const visibleCards = workloadKinds.filter((kind) => can(user, kind.module, 'view'))
  const greeting = user.displayName || user.username

  const load = useSingleFlight(
    useCallback(
      async (initial = false) => {
        if (!canOverview) {
          setLoading(false)
          return
        }
        try {
          const res = await fetch('/api/k8s/cluster/overview', { credentials: 'same-origin' })
          if (!res.ok) throw new Error(await readAPIError(res, 'Failed to load the cluster overview'))
          const data: Record<string, number> = await res.json()
          setCounts(data)
          setError('')
        } catch (e) {
          if (initial) setError(e instanceof Error ? e.message : 'Load failed')
        } finally {
          if (initial) setLoading(false)
        }
      },
      [canOverview],
    ),
  )

  useEffect(() => {
    void load(true)
  }, [load])
  useLiveRefresh(() => load(false), canOverview)

  if (!canOverview && !canMetrics) {
    const next = firstAllowedPage(user)
    return (
      <PageBody>
        <PageHeader title={`Welcome, ${greeting}`} />
        <EmptyState
          icon={CompassIcon}
          action={
            next ? (
              <Link
                to={next.url}
                className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              >
                Go to {next.title}
                <ArrowRightIcon className="size-3.5" />
              </Link>
            ) : null
          }
        >
          {next
            ? 'The cluster overview is not part of your permissions. Use the sidebar to open the areas you can access.'
            : 'Your account has no permissions yet. Ask the owner to assign you a permission set.'}
        </EmptyState>
      </PageBody>
    )
  }

  return (
    <PageBody className="overflow-auto">
      <PageHeader title="Overview" description="Workloads across the namespaces you can access" />
      <ErrorAlert message={error} />
      {canOverview && visibleCards.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
          {visibleCards.map((kind) => {
            const Icon = kind.icon
            return (
              <Link
                key={kind.module}
                to={kind.href}
                className="group flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Icon className="size-3.5" />
                    {kind.label}
                  </span>
                  <ArrowRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                {loading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <span className="text-2xl font-semibold tabular-nums">{counts[kind.module] ?? '—'}</span>
                )}
              </Link>
            )
          })}
        </div>
      ) : null}
      {canMetrics ? (
        <div className="px-3 pb-3">
          <MetricsPanel scope="cluster" title="Cluster metrics" />
        </div>
      ) : null}
    </PageBody>
  )
}
