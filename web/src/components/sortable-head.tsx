import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import type { SortDir } from '@/lib/table-sort'
import { cn } from '@/lib/utils'

export function SortableHead({
  column,
  label,
  sortKey,
  sortDir,
  onSort,
  className,
  align,
}: {
  column: string
  label: string
  sortKey: string | null
  sortDir: SortDir | null
  onSort: (key: string) => void
  className?: string
  align?: 'left' | 'right'
}) {
  const active = sortKey === column
  return (
    <TableHead
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(align === 'right' && 'text-right', className)}
    >
      <button
        type="button"
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-foreground',
          active && 'text-foreground',
          align === 'right' && 'w-full justify-end',
        )}
        onClick={() => onSort(column)}
      >
        {label}
        {active && sortDir === 'asc' ? (
          <ChevronUpIcon className="size-3" />
        ) : active && sortDir === 'desc' ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronsUpDownIcon className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}
