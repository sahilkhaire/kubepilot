import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  createMember,
  deleteMember,
  listMembers,
  listPermissionSets,
  resetMemberPassword,
  updateMember,
  type Member,
  type PermissionSet,
} from '@/api'
import { SortableHead } from '@/components/sortable-head'
import { ConfirmDialog } from '@/components/confirm-dialog'
import EmptyState from '@/components/EmptyState'
import { ErrorAlert } from '@/components/error-alert'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { sortBy, useTableSort } from '@/lib/table-sort'
import { namespaceGrantLabel } from '@/lib/grants'
import { PageLoading } from '@/components/page-loading'

export default function SettingsMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [sets, setSets] = useState<PermissionSet[]>([])
  const [error, setError] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)

  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteSetId, setInviteSetId] = useState('')

  async function load() {
    setError('')
    try {
      const [m, s] = await Promise.all([listMembers(), listPermissionSets()])
      setMembers(m)
      setSets(s)
      if (!inviteSetId && s.length > 0) {
        setInviteSetId(s[0].id)
      }
    } catch {
      setError('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const { sort, sortKey, sortDir, onSort } = useTableSort('settings-members')
  const sortedMembers = useMemo(
    () =>
      sortBy(members, sort, (m, key) => {
        switch (key) {
          case 'username':
            return m.username
          case 'displayName':
            return m.displayName
          case 'permissionSet':
            return sets.find((s) => s.id === m.permissionSetId)?.name ?? m.permissionSetId
          case 'namespaces':
            return namespaceGrantLabel(sets.find((s) => s.id === m.permissionSetId) ?? {})
          case 'enabled':
            return m.enabled
          default:
            return ''
        }
      }),
    [members, sort, sets],
  )

  function dismissPassword() {
    setGeneratedPassword('')
  }

  async function copyPassword() {
    if (!generatedPassword) return
    try {
      await navigator.clipboard.writeText(generatedPassword)
      toast.success('Password copied')
    } catch {
      setError('Failed to copy password')
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const result = await createMember({
        username: inviteUsername,
        displayName: inviteDisplayName,
        permissionSetId: inviteSetId,
      })
      setGeneratedPassword(result.password)
      setInviteUsername('')
      setInviteDisplayName('')
      await load()
    } catch {
      setError('Failed to invite member')
    }
  }

  async function onResetPassword(id: string) {
    setError('')
    try {
      const result = await resetMemberPassword(id)
      setGeneratedPassword(result.password)
    } catch {
      setError('Failed to reset password')
    }
  }

  async function onToggleEnabled(member: Member) {
    setError('')
    try {
      await updateMember(member.id, { enabled: !member.enabled })
      await load()
    } catch {
      setError('Failed to update member')
    }
  }

  async function onDelete() {
    if (!memberToDelete) return
    setError('')
    try {
      await deleteMember(memberToDelete.id)
      setMemberToDelete(null)
      await load()
    } catch {
      setError('Failed to delete member')
    }
  }

  if (loading) return <PageLoading compact />

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />
      {generatedPassword ? (
        <Alert>
          <AlertTitle>Generated password</AlertTitle>
          <AlertDescription>
            Copy now — dismiss to hide:{' '}
            <span className="font-mono font-medium">{generatedPassword}</span>
          </AlertDescription>
          <AlertAction className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={copyPassword}>
              Copy
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={dismissPassword}>
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Invite member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onInvite} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="invite-username">Username</Label>
              <Input
                id="invite-username"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-display">Display name</Label>
              <Input
                id="invite-display"
                value={inviteDisplayName}
                onChange={(e) => setInviteDisplayName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-set">Permission set</Label>
              <Select value={inviteSetId} onValueChange={setInviteSetId} required>
                <SelectTrigger id="invite-set" className="w-full">
                  <SelectValue placeholder="Select a set" />
                </SelectTrigger>
                <SelectContent>
                  {sets.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button type="submit">Invite</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="username" label="Username" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="displayName" label="Display name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="permissionSet" label="Permission set" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="namespaces" label="Namespaces" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="enabled" label="Enabled" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.username}</TableCell>
                  <TableCell>{m.displayName}</TableCell>
                  <TableCell>{sets.find((s) => s.id === m.permissionSetId)?.name ?? m.permissionSetId}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {namespaceGrantLabel(sets.find((s) => s.id === m.permissionSetId) ?? {})}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.enabled ? 'outline' : 'secondary'}>{m.enabled ? 'yes' : 'no'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => onResetPassword(m.id)}>
                        Reset password
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => onToggleEnabled(m)}>
                        {m.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => setMemberToDelete(m)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {members.length === 0 ? <EmptyState>No members yet.</EmptyState> : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={memberToDelete != null}
        title="Delete member"
        description={memberToDelete ? `Delete member "${memberToDelete.username}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
        onCancel={() => setMemberToDelete(null)}
      />
    </div>
  )
}
