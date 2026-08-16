import { useEffect, useState } from 'react'
import {
  createPermissionSet,
  deletePermissionSet,
  listPermissionSets,
  updatePermissionSet,
  type PermissionSet,
} from '@/api'
import { ConfirmDialog } from '@/components/confirm-dialog'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { PageLoading } from '@/components/page-loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type CreateMode = 'template' | 'custom'

export default function SettingsSets() {
  const [sets, setSets] = useState<PermissionSet[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode>('template')
  const [createTemplate, setCreateTemplate] = useState('viewer')
  const [createGrantsJson, setCreateGrantsJson] = useState('{"pods":["view"]}')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [setToDelete, setSetToDelete] = useState<PermissionSet | null>(null)

  async function load() {
    setError('')
    try {
      setSets(await listPermissionSets())
    } catch {
      setError('Failed to load permission sets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (createMode === 'template') {
        await createPermissionSet({
          name: createName,
          description: createDescription,
          cloneFromTemplate: createTemplate,
        })
      } else {
        const grants = JSON.parse(createGrantsJson) as Record<string, string[]>
        await createPermissionSet({
          name: createName,
          description: createDescription,
          grants,
        })
      }
      setCreateName('')
      setCreateDescription('')
      await load()
    } catch {
      setError('Failed to create permission set')
    }
  }

  function startEdit(ps: PermissionSet) {
    setEditingId(ps.id)
    setEditName(ps.name)
    setEditDescription(ps.description)
  }

  async function onSaveEdit(id: string) {
    setError('')
    try {
      await updatePermissionSet(id, { name: editName, description: editDescription })
      setEditingId(null)
      await load()
    } catch {
      setError('Failed to update permission set')
    }
  }

  async function onDelete() {
    if (!setToDelete) return
    setError('')
    try {
      await deletePermissionSet(setToDelete.id)
      setSetToDelete(null)
      await load()
    } catch {
      setError('Failed to delete permission set')
    }
  }

  if (loading) return <PageLoading compact />

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Create permission set</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="set-name">Name</Label>
              <Input id="set-name" value={createName} onChange={(e) => setCreateName(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="set-desc">Description</Label>
              <Input id="set-desc" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={createMode} onValueChange={(v) => setCreateMode(v as CreateMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">Clone from template</SelectItem>
                  <SelectItem value="custom">Custom grants (JSON)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createMode === 'template' ? (
              <div className="grid gap-2">
                <Label>Template</Label>
                <Select value={createTemplate} onValueChange={setCreateTemplate}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="grants-json">Grants JSON</Label>
                <Textarea
                  id="grants-json"
                  value={createGrantsJson}
                  onChange={(e) => setCreateGrantsJson(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                  required
                />
              </div>
            )}
            <div>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sets.map((ps) => (
                <TableRow key={ps.id}>
                  <TableCell className="font-medium">
                    {editingId === ps.id ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    ) : (
                      ps.name
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === ps.id ? (
                      <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                    ) : (
                      ps.description
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === ps.id ? (
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" onClick={() => onSaveEdit(ps.id)}>
                          Save
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(ps)}>
                          Edit
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => setSetToDelete(ps)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sets.length === 0 ? <EmptyState>No permission sets yet.</EmptyState> : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={setToDelete != null}
        title="Delete permission set"
        description={setToDelete ? `Delete permission set "${setToDelete.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
        onCancel={() => setSetToDelete(null)}
      />
    </div>
  )
}
