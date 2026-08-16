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
import { PageLoading } from '@/components/page-loading'
import { SetPasswordDialog } from '@/components/set-password-dialog'
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

  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteDisplayName, setInviteDisplayName] = useState('')
  const [inviteSetId, setInviteSetId] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteConfirm, setInviteConfirm] = useState('')
  const [resetTarget, setResetTarget] = useState<Member | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [resetError, setResetError] = useState('')

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
          case 'status':
            return m.enabled ? 'active' : 'suspended'
          default:
            return ''
        }
      }),
    [members, sort, sets],
  )

  async function onInvite(e: React.FormEvent) {
    e.preventDefault()
    const pwError = passwordError(invitePassword, inviteConfirm)
    if (pwError) {
      setError(pwError)
      return
    }
    setError('')
    try {
      await createMember({
        username: inviteUsername,
        displayName: inviteDisplayName,
        permissionSetId: inviteSetId,
        password: invitePassword,
      })
      toast.success(`Invited ${inviteUsername}. They can sign in with the password you set.`)
      setInviteUsername('')
      setInviteDisplayName('')
      setInvitePassword('')
      setInviteConfirm('')
      await load()
    } catch {
      setError('Failed to invite member')
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
    } catch {
      setResetError('Failed to reset password')
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
    } catch {
      setError(resume ? 'Failed to resume member' : 'Failed to suspend member')
    } finally {
      setAccessPending(false)
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
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="invite-password">Password</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
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
              />
            </div>
            <div className="sm:col-span-2">
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
                <SerialHead />
                <SortableHead column="username" label="Username" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="displayName" label="Display name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="permissionSet" label="Permission set" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="namespaces" label="Namespaces" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableHead column="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <TableHead className="text-right">Actions</TableHead>
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
                    <Badge variant={m.enabled ? 'outline' : 'destructive'}>{m.enabled ? 'Active' : 'Suspended'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setResetError('')
                          setResetTarget(m)
                        }}
                      >
                        Reset password
                      </Button>
                      <Button
                        type="button"
                        variant={m.enabled ? 'ghost' : 'outline'}
                        size="sm"
                        disabled={accessPending && accessTarget?.id === m.id}
                        onClick={() => setAccessTarget(m)}
                      >
                        {m.enabled ? 'Suspend' : 'Resume'}
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
