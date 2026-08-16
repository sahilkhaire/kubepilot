import { useCallback, useEffect, useState } from 'react'

export type SortDir = 'asc' | 'desc'

export type TableSort = {
  key: string
  dir: SortDir
}

export function toggleSort(current: TableSort | null, key: string): TableSort | null {
  if (!current || current.key !== key) {
    return { key, dir: 'asc' }
  }
  if (current.dir === 'asc') {
    return { key, dir: 'desc' }
  }
  return null
}

export function compareValues(a: unknown, b: unknown): number {
  const aEmpty = isEmptySortValue(a)
  const bEmpty = isEmptySortValue(b)
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b)
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function sortBy<T>(
  rows: T[],
  sort: TableSort | null,
  getValue: (row: T, key: string) => unknown,
): T[] {
  if (!sort) return rows
  const copy = [...rows]
  copy.sort((a, b) => {
    const cmp = compareValues(getValue(a, sort.key), getValue(b, sort.key))
    return sort.dir === 'asc' ? cmp : -cmp
  })
  return copy
}

export function useTableSort(resetKey?: string) {
  const [sort, setSort] = useState<TableSort | null>(null)
  const onSort = useCallback((key: string) => {
    setSort((prev) => toggleSort(prev, key))
  }, [])
  useEffect(() => {
    setSort(null)
  }, [resetKey])
  return {
    sort,
    sortKey: sort?.key ?? null,
    sortDir: sort?.dir ?? null,
    onSort,
  }
}

export function ratioSortValue(value: string): number {
  const match = /^(\d+)\s*\/\s*(\d+)/.exec(value)
  if (!match) return Number.NEGATIVE_INFINITY
  const ready = Number(match[1])
  const total = Number(match[2])
  if (total === 0) return ready
  return ready / total + ready * 1e-6
}

export function timestampSortValue(iso?: string): number {
  if (!iso) return Number.NEGATIVE_INFINITY
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

function isEmptySortValue(value: unknown): boolean {
  return (
    value == null ||
    value === '' ||
    value === '—' ||
    value === Number.NEGATIVE_INFINITY
  )
}
