import { PageBody } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full opacity-70" style={{ opacity: 1 - i * 0.09 }} />
      ))}
    </div>
  )
}

export function PageLoading({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-5 w-40" />
        <TableSkeleton rows={5} />
      </div>
    )
  }
  return (
    <PageBody className="gap-3 overflow-hidden" aria-busy="true" aria-label="Loading">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="px-3">
        <TableSkeleton />
      </div>
    </PageBody>
  )
}
