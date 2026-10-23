import { useEffect, useMemo, useState } from 'react'
import { ListFilterIcon } from 'lucide-react'
import {
  deleteAuditFilter,
  deleteAuditIds,
  queryAudit,
  type AuditFilters,
  type AuditLog,
} from '@/api'
import { SortableHead } from '@/components/sortable-head'
import { ConfirmDialog } from '@/components/confirm-dialog'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SerialHead,
  SerialCell,
} from '@/components/ui/table'
import { sortBy, timestampSortValue, useTableSort } from '@/lib/table-sort'

function toRFC3339(datetimeLocal: string): string | undefined {
  if (!datetimeLocal) return undefined
  const d = new Date(datetimeLocal)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export default function SettingsAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<'selected' | 'filter' | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [fromLocal, setFromLocal] = useState('')
  const [toLocal, setToLocal] = useState('')
  const [username, setUsername] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [result, setResult] = useState('')
  const [namespace, setNamespace] = useState('')
  const [kind, setKind] = useState('')

  function buildFilters(): AuditFilters {
    return {
      from: toRFC3339(fromLocal),
      to: toRFC3339(toLocal),
      username: username || undefined,
      module: module || undefined,
      action: action || undefined,
      result: result || undefined,
      namespace: namespace || undefined,
      kind: kind || undefined,
    }
  }

  async function load() {
    setError('')
    try {
      const data = await queryAudit(buildFilters())
      setLogs(data)
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const { sort, sortKey, sortDir, onSort } = useTableSort('settings-audit')
  const sortedLogs = useMemo(
    () =>
      sortBy(logs, sort, (log, key) => {
        switch (key) {
          case 'time':
            return timestampSortValue(log.timestamp)
          case 'user':
            return log.username ?? ''
          case 'module':
            return log.module ?? ''
          case 'action':
            return log.action ?? ''
          case 'result':
            return log.result ?? ''
          case 'path':
            return log.path ?? ''
          default:
            return ''
        }
      }),
    [logs, sort],
  )

  function onFilterSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFiltersOpen(false)
    void load()
  }

  function onClearFilters() {
    setFromLocal('')
    setToLocal('')
    setUsername('')
    setModule('')
    setAction('')
    setResult('')
    setNamespace('')
    setKind('')
  }

  const activeFilterCount = [
    fromLocal,
    toLocal,
    username,
    module,
    action,
    result,
    namespace,
    kind,
  ].filter(Boolean).length

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === logs.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(logs.map((l) => l.id)))
    }
  }

  async function onConfirmDelete() {
    setError('')
    try {
      if (confirm === 'selected') {
        await deleteAuditIds([...selected])
      } else if (confirm === 'filter') {
        await deleteAuditFilter(buildFilters())
      }
      setConfirm(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete audit entries')
    }
  }

  if (loading && logs.length === 0) return <PageLoading compact />

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" onClick={() => setConfirm('selected')} disabled={selected.size === 0}>
            Delete selected ({selected.size})
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirm('filter')}>
            Delete matching filter
          </Button>
        </div>
        <Button type="button" variant="outline" onClick={() => setFiltersOpen(true)}>
          <ListFilterIcon />
          Filter
          {activeFilterCount > 0 ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SerialHead />
                <TableHead className="w-10">
                  <Checkbox
                    checked={logs.length > 0 && selected.size === logs.length}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <SortableHead column="time" label="Time" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="user" label="User" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="module" label="Module" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="action" label="Action" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="result" label="Result" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="path" label="Path" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLogs.map((log, index) => (
                <TableRow key={log.id}>
                  <SerialCell index={index} />
                  <TableCell>
                    <Checkbox
                      checked={selected.has(log.id)}
                      onCheckedChange={() => toggleSelect(log.id)}
                      aria-label={`Select ${log.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.timestamp ?? ''}</TableCell>
                  <TableCell>{log.username ?? ''}</TableCell>
                  <TableCell>{log.module ?? ''}</TableCell>
                  <TableCell>{log.action ?? ''}</TableCell>
                  <TableCell>{log.result ?? ''}</TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs">{log.path ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {logs.length === 0 ? <EmptyState>No audit entries.</EmptyState> : null}
        </CardContent>
      </Card>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the audit log by time, user, or resource.</SheetDescription>
          </SheetHeader>
          <form onSubmit={onFilterSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="grid gap-4 overflow-auto px-4">
              <div className="grid gap-2">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="datetime-local" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="datetime-local" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="module">Module</Label>
                <Input id="module" value={module} onChange={(e) => setModule(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="action">Action</Label>
                <Input id="action" value={action} onChange={(e) => setAction(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="result">Result</Label>
                <Input id="result" value={result} onChange={(e) => setResult(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="namespace">Namespace</Label>
                <Input id="namespace" value={namespace} onChange={(e) => setNamespace(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kind">Kind</Label>
                <Input id="kind" value={kind} onChange={(e) => setKind(e.target.value)} />
              </div>
            </div>
            <SheetFooter className="flex-row justify-end">
              <Button type="button" variant="outline" onClick={onClearFilters}>
                Clear
              </Button>
              <Button type="submit">Apply</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirm != null}
        title={confirm === 'selected' ? 'Delete selected entries' : 'Delete matching entries'}
        description={
          confirm === 'selected'
            ? `Delete ${selected.size} audit entries?`
            : 'Delete all entries matching the current filter?'
        }
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
