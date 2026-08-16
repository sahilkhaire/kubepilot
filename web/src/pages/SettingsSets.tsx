import { useEffect, useMemo, useState } from 'react'
import {
  createPermissionSet,
  deletePermissionSet,
  listPermissionSetCatalog,
  listPermissionSetTemplates,
  listPermissionSets,
  updatePermissionSet,
  type CatalogGroup,
  type PermissionSet,
} from '@/api'
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
import { ScrollArea } from '@/components/ui/scroll-area'
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
} from '@/components/ui/table'
import { grantSummary } from '@/lib/grants'

type EditorState = {
  id?: string
  name: string
  description: string
  grants: Record<string, string[]>
}

const emptyEditor: EditorState = { name: '', description: '', grants: {} }

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

  const templateById = useMemo(() => {
    const map = new Map<string, PermissionSet>()
    for (const tmpl of templates) {
      const id = tmpl.builtinTemplate || tmpl.id
      map.set(id, tmpl)
    }
    return map
  }, [templates])

  function openCreate() {
    setStartFrom('')
    setEditor({ ...emptyEditor })
  }

  function openEdit(ps: PermissionSet) {
    setStartFrom('')
    setEditor({
      id: ps.id,
      name: ps.name,
      description: ps.description,
      grants: { ...ps.grants },
    })
  }

  function openClone(ps: PermissionSet) {
    setStartFrom('')
    setEditor({
      name: `${ps.name} copy`,
      description: ps.description,
      grants: { ...ps.grants },
    })
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
    setError('')
    setSaving(true)
    try {
      if (editor.id) {
        await updatePermissionSet(editor.id, {
          name: editor.name,
          description: editor.description,
          grants: editor.grants,
        })
      } else {
        await createPermissionSet({
          name: editor.name,
          description: editor.description,
          grants: editor.grants,
        })
      }
      setEditor(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permission set')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!setToDelete) return
    setError('')
    try {
      await deletePermissionSet(setToDelete.id)
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
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Grants</TableHead>
                <TableHead>Members</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sets.map((ps) => {
                const summary = grantSummary(ps.grants)
                return (
                  <TableRow key={ps.id}>
                    <TableCell className="font-medium">{ps.name}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {ps.description || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {summary.modules} module{summary.modules === 1 ? '' : 's'}
                      </Badge>
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

      <Dialog open={editor != null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editor?.id ? 'Edit permission set' : 'New permission set'}</DialogTitle>
            <DialogDescription>
              Grants apply on the next API call. Owner-only settings cannot be granted to members.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
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
              <ScrollArea className="min-h-0 flex-1 pr-3">
                <PermissionGrantEditor
                  catalog={catalog}
                  grants={editor.grants}
                  onChange={(grants) => setEditor({ ...editor, grants })}
                />
              </ScrollArea>
              <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
                <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !editor.name.trim()}>
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
        destructive
        onConfirm={onDelete}
        onCancel={() => setSetToDelete(null)}
      />
    </div>
  )
}
