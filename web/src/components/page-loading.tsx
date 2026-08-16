import { PageBody } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'

export function PageLoading({ compact = false }: { compact?: boolean }) {
  const content = (
    <>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </>
  )
  if (compact) {
    return <div className="space-y-4">{content}</div>
  }
  return <PageBody className="gap-3 p-3">{content}</PageBody>
}
