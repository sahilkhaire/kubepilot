import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  createPermissionSet,
  deletePermissionSet,
  listPermissionSetCatalog,
  listPermissionSetTemplates,
  listPermissionSets,
  updatePermissionSet,
  type CatalogGroup,
  type NamespaceScope,
  type PermissionSet,
} from '@/api'
import { SortableHead } from '@/components/sortable-head'
import { ConfirmDialog } from '@/components/confirm-dialog'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PermissionGrantEditor } from '@/components/permission-grant-editor'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { grantSummary, namespaceGrantLabel } from '@/lib/grants'
import { sortBy, useTableSort } from '@/lib/table-sort'
import { NamespaceGrantEditor } from '@/components/namespace-grant-editor'

type EditorState = {
  id?: string
  name: string
  description: string
  grants: Record<string, string[]>
  namespaceScope: NamespaceScope
  namespaces: string[]
  namespaceRegex: string[]
}

const emptyEditor: EditorState = {
  name: '',
  description: '',
  grants: {},
  namespaceScope: 'all',
  namespaces: [],
  namespaceRegex: [],
}

function editorFromSet(ps: PermissionSet, name = ps.name): EditorState {
  return {
    id: ps.id,
    name,
    description: ps.description,
    grants: { ...ps.grants },
    namespaceScope: ps.namespaceScope === 'selected' ? 'selected' : 'all',
    namespaces: [...(ps.namespaces ?? [])],
    namespaceRegex: [...(ps.namespaceRegex ?? [])],
  }
}

export default function SettingsSets() {
  const [sets, setSets] = useState<PermissionSet[]>([])
  const [templates, setTemplates] = useState<PermissionSet[]>([])
  const [catalog, setCatalog] = useState<CatalogGroup[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [startFrom, setStartFrom] = useState('')
  const [setToDelete, setSetToDelete] = useState<PermissionSet | null>(null)
  const [editorError, setEditorError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setError('')
    try {
      const [nextSets, nextTemplates, nextCatalog] = await Promise.all([
        listPermissionSets(),
        listPermissionSetTemplates(),
        listPermissionSetCatalog(),
      ])
      setSets(nextSets)
      setTemplates(nextTemplates)
      setCatalog(nextCatalog)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permission sets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const { sort, sortKey, sortDir, onSort } = useTableSort('settings-sets')
  const sortedSets = useMemo(
    () =>
      sortBy(sets, sort, (ps, key) => {
        switch (key) {
          case 'name':
            return ps.name
          case 'description':
            return ps.description
          case 'grants':
            return grantSummary(ps.grants).modules
          case 'namespaces':
            return namespaceGrantLabel(ps)
          case 'members':
            return ps.memberCount ?? 0
          default:
            return ''
        }
      }),
    [sets, sort],
  )

  const templateById = useMemo(() => {
    const map = new Map<string, PermissionSet>()
    for (const tmpl of templates) {
      const id = tmpl.builtinTemplate || tmpl.id
      map.set(id, tmpl)
    }
    return map
  }, [templates])

  function openCreate() {
    setEditorError('')
    setStartFrom('')
    setEditor({
      ...emptyEditor,
      grants: {},
      namespaces: [],
      namespaceRegex: [],
    })
  }

  function openEdit(ps: PermissionSet) {
    setEditorError('')
    setStartFrom('')
    setEditor(editorFromSet(ps))
  }

  function openClone(ps: PermissionSet) {
    setEditorError('')
    setStartFrom('')
    const next = editorFromSet(ps, `${ps.name} copy`)
    delete next.id
    setEditor(next)
  }

  function applyTemplate(id: string) {
    setStartFrom(id)
    if (!editor) return
    if (!id) {
      setEditor({ ...editor, grants: {} })
      return
    }
    const tmpl = templateById.get(id)
    if (!tmpl) return
    setEditor({
      ...editor,
      name: editor.name || tmpl.name,
      description: editor.description || tmpl.description,
      grants: { ...tmpl.grants },
    })
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editor) return
    setEditorError('')
    setSaving(true)
    try {
      if (editor.id) {
        await updatePermissionSet(editor.id, {
          name: editor.name,
          description: editor.description,
          grants: editor.grants,
          namespaceScope: editor.namespaceScope,
          namespaces: editor.namespaces,
          namespaceRegex: editor.namespaceRegex,
        })
      } else {
        await createPermissionSet({
          name: editor.name,
          description: editor.description,
          grants: editor.grants,
          namespaceScope: editor.namespaceScope,
          namespaces: editor.namespaces,
          namespaceRegex: editor.namespaceRegex,
        })
      }
      toast.success(editor.id ? `Saved ${editor.name}` : `Created ${editor.name}`)
      setEditor(null)
      await load()
    } catch (err) {
      // Shown inside the dialog so it isn't hidden behind it.
      setEditorError(err instanceof Error ? err.message : 'Failed to save permission set')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!setToDelete) return
    setError('')
    setDeleting(true)
    try {
      await deletePermissionSet(setToDelete.id)
      toast.success(`Deleted ${setToDelete.name}`)
      setSetToDelete(null)
      await load()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message === 'permission set in use'
            ? `Cannot delete "${setToDelete.name}" while members still use it.`
            : err.message
          : 'Failed to delete permission set',
      )
      setSetToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <PageLoading compact />

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />

      <div className="flex justify-end">
        <Button type="button" onClick={openCreate}>
          New permission set
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Permission sets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SerialHead />
                <SortableHead column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="description" label="Description" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="grants" label="Grants" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="namespaces" label="Namespaces" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="members" label="Members" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSets.map((ps, index) => {
                const summary = grantSummary(ps.grants)
                return (
                  <TableRow key={ps.id}>
                    <SerialCell index={index} />
                    <TableCell className="font-medium">{ps.name}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {ps.description || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {summary.modules} module{summary.modules === 1 ? '' : 's'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {namespaceGrantLabel(ps)}
                    </TableCell>
                    <TableCell>{ps.memberCount ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(ps)}>
                          Edit
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => openClone(ps)}>
                          Duplicate
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={(ps.memberCount ?? 0) > 0}
                          onClick={() => setSetToDelete(ps)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {sets.length === 0 ? <EmptyState>No permission sets yet. Clone Viewer, Operator, or Admin to start.</EmptyState> : null}
        </CardContent>
      </Card>

      <Dialog open={editor != null} onOpenChange={(open) => !open && !saving && setEditor(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editor?.id ? 'Edit permission set' : 'New permission set'}</DialogTitle>
            <DialogDescription>
              Grants apply on the next API call. Owner-only settings cannot be granted to members.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
              <ErrorAlert
                message={editorError}
                className="mx-0 mt-0 shrink-0"
                onDismiss={() => setEditorError('')}
              />
              <div className="grid shrink-0 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="ps-name">Name</Label>
                  <Input
                    id="ps-name"
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    maxLength={80}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ps-desc">Description</Label>
                  <Input
                    id="ps-desc"
                    value={editor.description}
                    onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                    maxLength={240}
                  />
                </div>
                {!editor.id ? (
                  <div className="grid gap-2 sm:col-span-2">
                    <Label>Start from template</Label>
                    <Select value={startFrom || '__none'} onValueChange={(v) => applyTemplate(v === '__none' ? '' : v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Blank (all modules off)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Blank (all modules off)</SelectItem>
                        {templates.map((tmpl) => (
                          <SelectItem key={tmpl.builtinTemplate || tmpl.id} value={tmpl.builtinTemplate || tmpl.id}>
                            {tmpl.name}
                            {tmpl.description ? ` — ${tmpl.description}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <NamespaceGrantEditor
                value={{
                  namespaceScope: editor.namespaceScope,
                  namespaces: editor.namespaces,
                  namespaceRegex: editor.namespaceRegex,
                }}
                onChange={(next) => setEditor({ ...editor, ...next })}
              />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 max-h-[calc(90vh-18rem)]">
                <PermissionGrantEditor
                  catalog={catalog}
                  grants={editor.grants}
                  onChange={(grants) => setEditor({ ...editor, grants })}
                />
              </div>
              <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-0 bg-transparent p-0">
                <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    saving ||
                    !editor.name.trim() ||
                    (editor.namespaceScope === 'selected' &&
                      editor.namespaces.length === 0 &&
                      editor.namespaceRegex.length === 0)
                  }
                >
                  {saving ? 'Saving…' : editor.id ? 'Save' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={setToDelete != null}
        title="Delete permission set"
        description={
          setToDelete
            ? setToDelete.memberCount
              ? `Delete permission set "${setToDelete.name}"? ${setToDelete.memberCount} member${setToDelete.memberCount === 1 ? '' : 's'} still use it — reassign them first.`
              : `Delete permission set "${setToDelete.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        destructive
        pending={deleting}
        onConfirm={onDelete}
        onCancel={() => !deleting && setSetToDelete(null)}
      />
    </div>
  )
}
