import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, CircleCheckIcon, CompassIcon, TriangleAlertIcon } from 'lucide-react'
import { readAPIError } from '@/api'
import EmptyState from '@/components/EmptyState'
import { eventTime, type EventItem } from '@/components/detail-parts'
import { PageBody, PageHeader } from '@/components/page-header'
import { ErrorAlert } from '@/components/error-alert'
import MetricsPanel from '@/components/MetricsPanel'
import { StatusBadge, statusTone } from '@/components/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
import { useUser } from '@/lib/auth-context'
import { catalog, kindUrl } from '@/lib/catalog'
import { can, hasView } from '@/lib/grants'
import { formatAge, objectName, objectNamespace, podRestarts, podStatus, type K8sObject } from '@/lib/k8s-fields'
import { timestampSortValue } from '@/lib/table-sort'
import { workloadKinds } from '@/lib/workload-kinds'

const OVERVIEW_REFRESH_MS = 5000

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

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        {icon}
        <h2 className="text-[13px] font-medium">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

export default function Home() {
  const user = useUser()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [pods, setPods] = useState<K8sObject[] | null>(null)
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const canOverview = can(user, 'cluster.overview', 'view')
  const canMetrics = can(user, 'metrics', 'view')
  const canPods = can(user, 'pods', 'view')
  const canEvents = can(user, 'events', 'view')
  const visibleCards = workloadKinds.filter((kind) => can(user, kind.module, 'view'))
  const name = user.displayName || user.username

  const load = useSingleFlight(
    useCallback(
      async (initial = false) => {
        if (!canOverview) {
          setLoading(false)
          return
        }
        try {
          const [overviewRes, podsRes, eventsRes] = await Promise.all([
            fetch('/api/k8s/cluster/overview', { credentials: 'same-origin' }),
            canPods ? fetch('/api/k8s/namespaces/_all/pods', { credentials: 'same-origin' }) : Promise.resolve(null),
            canEvents ? fetch('/api/k8s/events', { credentials: 'same-origin' }) : Promise.resolve(null),
          ])
          if (!overviewRes.ok) throw new Error(await readAPIError(overviewRes, 'Failed to load the cluster overview'))
          setCounts(await overviewRes.json())
          if (podsRes?.ok) setPods(await podsRes.json())
          if (eventsRes?.ok) setEvents(await eventsRes.json())
          setError('')
        } catch (e) {
          if (initial) setError(e instanceof Error ? e.message : 'Load failed')
        } finally {
          if (initial) setLoading(false)
        }
      },
      [canOverview, canPods, canEvents],
    ),
  )

  useEffect(() => {
    void load(true)
  }, [load])
  useLiveRefresh(() => load(false), canOverview, OVERVIEW_REFRESH_MS)

  const unhealthy = useMemo(() => {
    if (!pods) return null
    return pods
      .map((pod) => ({ pod, status: pod.metadata?.deletionTimestamp ? 'Terminating' : podStatus(pod) }))
      .filter(({ status }) => {
        const tone = statusTone(status)
        return tone === 'bad' || tone === 'warn'
      })
      .sort((a, b) => (statusTone(a.status) === 'bad' ? -1 : 0) - (statusTone(b.status) === 'bad' ? -1 : 0))
  }, [pods])

  const warnings = useMemo(() => {
    if (!events) return null
    return events
      .filter((ev) => ev.type === 'Warning')
      .sort((a, b) => timestampSortValue(eventTime(b)) - timestampSortValue(eventTime(a)))
      .slice(0, 8)
  }, [events])

  if (!canOverview && !canMetrics) {
    const next = firstAllowedPage(user)
    return (
      <PageBody>
        <PageHeader title={`Welcome, ${name}`} />
        <EmptyState
          icon={CompassIcon}
          action={
            next ? (
              <Link
                to={next.url}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
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

  const unhealthyCount = unhealthy?.length ?? 0

  return (
    <PageBody className="overflow-auto">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pt-6 pb-8 sm:px-6">
        <div>
          <h1 className="text-gradient text-2xl font-semibold tracking-tight">
            {greeting()}, {name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? 'Checking the cluster…'
              : unhealthy == null
                ? 'Here is what is running across the namespaces you can access.'
                : unhealthyCount === 0
                  ? 'All pods you can see are healthy.'
                  : `${unhealthyCount} pod${unhealthyCount === 1 ? ' needs' : 's need'} attention.`}
          </p>
        </div>
        <ErrorAlert message={error} className="mx-0 mt-0" />

        {canOverview && visibleCards.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {visibleCards.map((kind) => {
              const Icon = kind.icon
              return (
                <Link
                  key={kind.module}
                  to={kind.href}
                  className="group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-3.5 transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_8px_24px_-12px_var(--glow)] focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
                >
                  <span className="flex items-center justify-between">
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-3.5" />
                    </span>
                    <ArrowRightIcon className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span>
                    {loading ? (
                      <Skeleton className="h-7 w-10" />
                    ) : (
                      <span className="block text-2xl font-semibold tracking-tight tabular-nums">
                        {counts[kind.module] ?? '—'}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{kind.label}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        ) : null}

        {canOverview && (canPods || canEvents) ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {canPods ? (
              <Panel
                title="Unhealthy pods"
                icon={
                  unhealthyCount > 0 ? (
                    <TriangleAlertIcon className="size-4 text-warning" />
                  ) : (
                    <CircleCheckIcon className="size-4 text-success" />
                  )
                }
                action={
                  <Link to="/workloads/pods" className="text-xs text-muted-foreground hover:text-foreground">
                    All pods →
                  </Link>
                }
              >
                {unhealthy == null ? (
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-4/5" />
                  </div>
                ) : unhealthy.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">Every pod is running or completed.</p>
                ) : (
                  <ul className="max-h-72 divide-y overflow-y-auto">
                    {unhealthy.slice(0, 20).map(({ pod, status }) => {
                      const ns = objectNamespace(pod)
                      const podName = objectName(pod)
                      return (
                        <li key={`${ns}/${podName}`}>
                          <Link
                            to={`/workloads/pods?select=${encodeURIComponent(`${ns}/${podName}`)}`}
                            className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-foreground/[0.035]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{podName}</span>
                              <span className="text-xs text-muted-foreground">
                                {ns} · {podRestarts(pod)} restart{podRestarts(pod) === 1 ? '' : 's'}
                              </span>
                            </span>
                            <StatusBadge value={status} />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>
            ) : null}
            {canEvents ? (
              <Panel
                title="Recent warnings"
                icon={<TriangleAlertIcon className="size-4 text-muted-foreground" />}
                action={
                  <Link to="/events" className="text-xs text-muted-foreground hover:text-foreground">
                    All events →
                  </Link>
                }
              >
                {warnings == null ? (
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-3/5" />
                  </div>
                ) : warnings.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No warning events.</p>
                ) : (
                  <ul className="max-h-72 divide-y overflow-y-auto">
                    {warnings.map((ev, i) => (
                      <li key={`${ev.metadata?.namespace}/${ev.metadata?.name ?? i}`} className="px-4 py-2 text-[13px]">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-destructive">{ev.reason}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {ev.involvedObject?.kind}/{ev.involvedObject?.name}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatAge(eventTime(ev))}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground" title={ev.message}>
                          {ev.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}
          </div>
        ) : null}

        {canMetrics ? <MetricsPanel scope="cluster" title="Cluster resources" /> : null}
      </div>
    </PageBody>
  )
}
