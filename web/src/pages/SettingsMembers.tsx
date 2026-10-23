import { useEffect, useMemo, useState } from 'react'
import { EllipsisVerticalIcon, KeyRoundIcon, PauseCircleIcon, PlayCircleIcon, PlusIcon, Trash2Icon, UserPenIcon } from 'lucide-react'
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
import { PageLoading } from '@/components/page-loading'
import { SetPasswordDialog } from '@/components/set-password-dialog'
import { StatusBadge } from '@/components/status-badge'
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
import { sortBy, useTableSort } from '@/lib/table-sort'
import { namespaceGrantLabel } from '@/lib/grants'
import { generatePassword, passwordError } from '@/lib/password'

export default function SettingsMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [sets, setSets] = useState<PermissionSet[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)
  const [accessTarget, setAccessTarget] = useState<Member | null>(null)
  const [accessPending, setAccessPending] = useState(false)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePending, setInvitePending] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteSetId, setInviteSetId] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteConfirm, setInviteConfirm] = useState('')
  const [resetTarget, setResetTarget] = useState<Member | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [resetError, setResetError] = useState('')
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editSetId, setEditSetId] = useState('')
  const [editPending, setEditPending] = useState(false)
  const [editError, setEditError] = useState('')
  const [deletePending, setDeletePending] = useState(false)

  async function load() {
    setError('')
    try {
      const [m, s] = await Promise.all([listMembers(), listPermissionSets()])
      setMembers(m)
      setSets(s)
      if (!inviteSetId && s.length > 0) {
        setInviteSetId(s[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
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
          case 'status':
            return m.enabled ? 'active' : 'suspended'
          default:
            return ''
        }
      }),
    [members, sort, sets],
  )

  function openInvite() {
    setInviteError('')
    setInviteUsername('')
    setInviteDisplayName('')
    setInvitePassword('')
    setInviteConfirm('')
    setInviteSetId(sets[0]?.id ?? '')
    setInviteOpen(true)
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    const pwError = passwordError(invitePassword, inviteConfirm)
    if (pwError) {
      setInviteError(pwError)
      return
    }
    setInviteError('')
    setInvitePending(true)
    try {
      await createMember({
        username: inviteUsername,
        displayName: inviteDisplayName,
        permissionSetId: inviteSetId,
        password: invitePassword,
      })
      toast.success(`Added ${inviteUsername}. They can sign in with the password you set.`)
      setInviteOpen(false)
      await load()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setInvitePending(false)
    }
  }

  async function onResetPassword(password: string) {
    if (!resetTarget) return
    setResetPending(true)
    setResetError('')
    try {
      await resetMemberPassword(resetTarget.id, password)
      toast.success(`Password updated for ${resetTarget.username}`)
      setResetTarget(null)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetPending(false)
    }
  }

  async function onConfirmAccess() {
    if (!accessTarget) return
    const resume = !accessTarget.enabled
    setAccessPending(true)
    setError('')
    try {
      await updateMember(accessTarget.id, { enabled: resume })
      toast.success(resume ? `Resumed access for ${accessTarget.username}` : `Suspended ${accessTarget.username}`)
      setAccessTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : resume ? 'Failed to resume member' : 'Failed to suspend member')
    } finally {
      setAccessPending(false)
    }
  }

  async function onDelete() {
    if (!memberToDelete) return
    const target = memberToDelete
    setDeletePending(true)
    try {
      await deleteMember(target.id)
      toast.success(`Deleted ${target.username}`)
      setMemberToDelete(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete member')
    } finally {
      setDeletePending(false)
    }
  }

  function openEdit(m: Member) {
    setEditTarget(m)
    setEditDisplayName(m.displayName)
    setEditSetId(m.permissionSetId)
    setEditError('')
  }

  async function onEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditPending(true)
    setEditError('')
    try {
      await updateMember(editTarget.id, { displayName: editDisplayName.trim(), permissionSetId: editSetId })
      toast.success(`Updated ${editTarget.username}`)
      setEditTarget(null)
      await load()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update member')
    } finally {
      setEditPending(false)
    }
  }

  if (loading) return <PageLoading compact />

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />

      <div className="flex justify-end">
        <Button type="button" onClick={openInvite} disabled={sets.length === 0}>
          <PlusIcon />
          Add member
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SerialHead />
                <SortableHead column="username" label="Username" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="displayName" label="Display name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="permissionSet" label="Permission set" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="namespaces" label="Namespaces" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <TableHead className="w-8">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((m, index) => (
                <TableRow key={m.id} className={m.enabled ? undefined : 'opacity-70'}>
                  <SerialCell index={index} />
                  <TableCell className="font-medium">{m.username}</TableCell>
                  <TableCell>{m.displayName}</TableCell>
                  <TableCell>{sets.find((s) => s.id === m.permissionSetId)?.name ?? m.permissionSetId}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {namespaceGrantLabel(sets.find((s) => s.id === m.permissionSetId) ?? {})}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={m.enabled ? (m.mustChangePassword ? 'Pending' : 'Active') : 'Suspended'} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${m.username}`}
                          disabled={accessPending && accessTarget?.id === m.id}
                        >
                          <EllipsisVerticalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-44">
                        <DropdownMenuItem onSelect={() => openEdit(m)}>
                          <UserPenIcon />
                          Edit…
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setResetError('')
                            setResetTarget(m)
                          }}
                        >
                          <KeyRoundIcon />
                          Reset password…
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setAccessTarget(m)}>
                          {m.enabled ? <PauseCircleIcon /> : <PlayCircleIcon />}
                          {m.enabled ? 'Suspend…' : 'Resume…'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setMemberToDelete(m)}>
                          <Trash2Icon />
                          Delete…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          {members.length === 0 ? (
            <EmptyState>
              {sets.length === 0
                ? 'Create a permission set first, then add members.'
                : 'No members yet. Add one to give a teammate access.'}
            </EmptyState>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={(open) => !invitePending && setInviteOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>Set a username, permission set, and password so they can sign in immediately.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onInvite} className="grid gap-4">
            <ErrorAlert message={inviteError} className="mx-0 mt-0" onDismiss={() => setInviteError('')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="invite-username">Username</Label>
                <Input
                  id="invite-username"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  required
                  disabled={invitePending}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invite-display">Display name</Label>
                <Input
                  id="invite-display"
                  value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                  required
                  disabled={invitePending}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="invite-set">Permission set</Label>
                <Select value={inviteSetId} onValueChange={setInviteSetId} required disabled={invitePending}>
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
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="invite-password">Password</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={invitePending}
                    onClick={() => {
                      const next = generatePassword()
                      setInvitePassword(next)
                      setInviteConfirm(next)
                    }}
                  >
                    Generate
                  </Button>
                </div>
                <Input
                  id="invite-password"
                  type="text"
                  autoComplete="new-password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={invitePending}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invite-confirm">Confirm password</Label>
                <Input
                  id="invite-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={inviteConfirm}
                  onChange={(e) => setInviteConfirm(e.target.value)}
                  required
                  disabled={invitePending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={invitePending} onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={invitePending || !inviteSetId}>
                {invitePending ? 'Adding…' : 'Add member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={editTarget != null} onOpenChange={(open) => !open && !editPending && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onEditSave} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Edit {editTarget?.username}</DialogTitle>
              <DialogDescription>Permission changes apply on their next request.</DialogDescription>
            </DialogHeader>
            <ErrorAlert message={editError} className="mx-0 mt-0" onDismiss={() => setEditError('')} />
            <div className="grid gap-2">
              <Label htmlFor="edit-display">Display name</Label>
              <Input
                id="edit-display"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                required
                disabled={editPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-set">Permission set</Label>
              <Select value={editSetId} onValueChange={setEditSetId} disabled={editPending}>
                <SelectTrigger id="edit-set" className="w-full">
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
              {editSetId ? (
                <p className="text-xs text-muted-foreground">
                  Namespaces: {namespaceGrantLabel(sets.find((s) => s.id === editSetId) ?? {})}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={editPending} onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editPending || !editDisplayName.trim() || !editSetId}>
                {editPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SetPasswordDialog
        open={resetTarget != null}
        title={`Set password for ${resetTarget?.username ?? ''}`}
        description="They will be signed out and can sign in with this password immediately."
        confirmLabel="Set password"
        pending={resetPending}
        error={resetError}
        onConfirm={onResetPassword}
        onCancel={() => !resetPending && setResetTarget(null)}
      />
      <ConfirmDialog
        open={accessTarget != null}
        title={accessTarget?.enabled ? `Suspend ${accessTarget.username}?` : `Resume ${accessTarget?.username ?? ''}?`}
        description={
          accessTarget?.enabled
            ? 'They will be signed out immediately and cannot log in until access is resumed.'
            : 'They will be able to sign in again with their existing password.'
        }
        confirmLabel={accessTarget?.enabled ? 'Suspend' : 'Resume'}
        destructive={Boolean(accessTarget?.enabled)}
        pending={accessPending}
        onConfirm={onConfirmAccess}
        onCancel={() => !accessPending && setAccessTarget(null)}
      />
      <ConfirmDialog
        open={memberToDelete != null}
        title={`Delete ${memberToDelete?.username ?? 'member'}?`}
        description={
          memberToDelete
            ? `${memberToDelete.username} is signed out and loses access immediately. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        destructive
        pending={deletePending}
        onConfirm={onDelete}
        onCancel={() => !deletePending && setMemberToDelete(null)}
      />
    </div>
  )
}
