import { useCallback, useEffect, useMemo, useState } from 'react'
import { EllipsisVerticalIcon, FileCodeIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { createNamespace, deleteK8sResource, readAPIError } from '@/api'
import DeleteConfirm from '@/components/DeleteConfirm'
import EmptyState from '@/components/EmptyState'
import ResourceYAMLSheet from '@/components/resource-yaml-sheet'
import { SortableHead } from '@/components/sortable-head'
import { ErrorAlert } from '@/components/error-alert'
import { ActionTooltip } from '@/components/icon-action-button'
import { FilterInput } from '@/components/namespace-select'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import { sortBy, useTableSort } from '@/lib/table-sort'
import { useLiveRefresh, useSingleFlight } from '@/hooks/use-live-refresh'
import type { YAMLTarget } from '@/lib/k8s-yaml'

const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

function namespaceNameError(name: string): string {
  if (!name) return ''
  if (name.length > 63) return 'Must be 63 characters or fewer.'
  if (!DNS_LABEL.test(name)) return 'Use lowercase letters, numbers and hyphens; start and end with a letter or number.'
  return ''
}

function CreateNamespaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const validation = namespaceNameError(name)

  useEffect(() => {
    if (open) {
      setName('')
      setError('')
    }
  }, [open])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || validation) return
    setPending(true)
    setError('')
    try {
      await createNamespace(name)
      toast.success(`Created namespace ${name}`)
      onCreated(name)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create namespace')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New namespace</DialogTitle>
            <DialogDescription>Namespaces group resources and scope permissions.</DialogDescription>
          </DialogHeader>
          <ErrorAlert message={error} className="mx-0 mt-0" />
          <div className="grid gap-2">
            <Label htmlFor="ns-name">Name</Label>
            <Input
              id="ns-name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="team-staging"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={pending}
              aria-invalid={Boolean(validation)}
              className="font-mono"
            />
            {validation ? <p className="text-xs text-destructive">{validation}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name || Boolean(validation)}>
              {pending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Namespaces() {
  const user = useUser()
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [yamlTarget, setYamlTarget] = useState<YAMLTarget | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteName, setDeleteName] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const canCreate = can(user, 'namespaces', 'create')
  const canDelete = can(user, 'namespaces', 'delete')

  const load = useSingleFlight(
    useCallback(async (initial = false) => {
      try {
        const res = await fetch('/api/k8s/namespaces', { credentials: 'same-origin' })
        if (!res.ok) throw new Error(await readAPIError(res, 'Failed to load namespaces'))
        const data: string[] = await res.json()
        setNamespaces(Array.isArray(data) ? data : [])
        setError('')
      } catch (e) {
        if (initial) setError(e instanceof Error ? e.message : 'Load failed')
      } finally {
        if (initial) setLoading(false)
      }
    }, []),
  )

  useEffect(() => {
    void load(true)
  }, [load])
  useLiveRefresh(() => load(false))

  const visible = useMemo(() => {
    const q = query.toLowerCase()
    return namespaces.filter((ns) => !q || ns.toLowerCase().includes(q))
  }, [namespaces, query])
  const { sort, sortKey, sortDir, onSort } = useTableSort('namespaces')
  const sorted = useMemo(() => sortBy(visible, sort, (ns) => ns), [visible, sort])

  async function runDelete() {
    if (!deleteName) return
    const name = deleteName
    setDeleting(true)
    try {
      await deleteK8sResource('namespaces', name, { clusterScoped: true })
      toast.success(`Deleting namespace ${name}. Its resources are removed in the background.`)
      setDeleteName(null)
      await load(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <PageLoading />

  return (
    <PageBody>
      <PageHeader title="Namespaces" description={`${visible.length} item${visible.length === 1 ? '' : 's'}`}>
        <FilterInput value={query} onChange={setQuery} />
        {canCreate ? (
          <Button size="sm" className="h-7" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New namespace
          </Button>
        ) : null}
      </PageHeader>
      <ErrorAlert message={error} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <SerialHead />
              <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <TableHead className="w-8">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ns, index) => (
              <TableRow
                key={ns}
                className="cursor-pointer"
                onClick={() => setYamlTarget({ module: 'namespaces', name: ns, clusterScoped: true })}
              >
                <SerialCell index={index} />
                <TableCell className="font-medium">{ns}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <ActionTooltip label="Actions">
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${ns}`}>
                          <EllipsisVerticalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                    </ActionTooltip>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem
                        onSelect={() => setYamlTarget({ module: 'namespaces', name: ns, clusterScoped: true })}
                      >
                        <FileCodeIcon />
                        {can(user, 'namespaces', 'yaml_edit') ? 'Edit YAML' : 'View YAML'}
                      </DropdownMenuItem>
                      {canDelete ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteName(ns)}>
                            <Trash2Icon />
                            Delete…
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {sorted.length === 0 && !error ? (
          <EmptyState>{query ? `No namespaces match “${query}”.` : 'No namespaces you can view.'}</EmptyState>
        ) : null}
      </div>
      <ResourceYAMLSheet
        target={yamlTarget}
        canEdit={can(user, 'namespaces', 'yaml_edit')}
        canDelete={canDelete}
        onOpenChange={(open) => {
          if (!open) setYamlTarget(null)
        }}
        onDeleted={() => {
          if (yamlTarget) {
            setNamespaces((prev) => prev.filter((ns) => ns !== yamlTarget.name))
          }
        }}
      />
      <CreateNamespaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(name) => setNamespaces((prev) => (prev.includes(name) ? prev : [...prev, name]))}
      />
      {deleteName ? (
        <DeleteConfirm
          resourceName={deleteName}
          resourceLabel="namespace"
          pending={deleting}
          onConfirm={runDelete}
          onCancel={() => !deleting && setDeleteName(null)}
        />
      ) : null}
    </PageBody>
  )
}
