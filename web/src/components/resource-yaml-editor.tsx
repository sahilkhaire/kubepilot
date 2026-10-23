import { useCallback, useEffect, useState } from 'react'
import { CopyIcon, EyeIcon, EyeOffIcon, RotateCcwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { deleteK8sResource, readAPIError } from '@/api'
import { ConfirmDialog } from '@/components/confirm-dialog'
import DeleteConfirm from '@/components/DeleteConfirm'
import { ErrorAlert } from '@/components/error-alert'
import { IconActionButton } from '@/components/icon-action-button'
import { PageLoading } from '@/components/page-loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SecretDataView } from '@/components/secret-data-view'
import { gvkForModule, isClusterScopedModule } from '@/lib/k8s-yaml'

export default function ResourceYAMLEditor({
  module,
  name,
  namespace,
  clusterScoped,
  canEdit = true,
  canDelete = false,
  canReveal = false,
  hint,
  onDeleted,
}: {
  module: string
  name: string
  namespace?: string
  clusterScoped?: boolean
  canEdit?: boolean
  canDelete?: boolean
  /** Secrets only: the user may load the stored values. */
  canReveal?: boolean
  hint?: string
  onDeleted?: () => void
}) {
  const scoped = clusterScoped ?? isClusterScopedModule(module)
  const isSecret = module === 'secrets'
  const [revealed, setRevealed] = useState(false)
  // Secret YAML without values must never be applied: it could remove the stored data.
  const allowEdit = Boolean(canEdit) && module !== 'pods' && (!isSecret || revealed)
  const readOnlyHint =
    hint ??
    (module === 'pods'
      ? 'Pod YAML is read-only. Use Edit env to change environment variables.'
      : isSecret && !revealed
        ? canReveal
          ? 'Values are hidden. Reveal them to view or edit this secret.'
          : 'Values are hidden. You do not have permission to reveal them.'
        : !allowEdit
          ? 'Read-only. You do not have permission to edit this resource.'
          : undefined)
  const [yaml, setYaml] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const dirty = yaml !== original

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      const gvk = gvkForModule[module]
      if (!gvk || !name) {
        setError('This resource type does not support YAML.')
        setLoading(false)
        return
      }
      if (!scoped && !namespace) {
        setError('A namespace is required to load this resource.')
        setLoading(false)
        return
      }
      setError('')
      try {
        const params = new URLSearchParams({ gvk, name })
        if (!scoped && namespace) params.set('namespace', namespace)
        if (isSecret && revealed) params.set('reveal', '1')
        const res = await fetch(`/api/k8s/yaml?${params}`, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(await readAPIError(res, 'Failed to load YAML'))
        const text = await res.text()
        if (signal?.cancelled) return
        setYaml(text)
        setOriginal(text)
      } catch (e) {
        if (!signal?.cancelled) setError(e instanceof Error ? e.message : 'Failed to load YAML')
      } finally {
        if (!signal?.cancelled) setLoading(false)
      }
    },
    [module, name, namespace, scoped, isSecret, revealed],
  )

  useEffect(() => {
    const signal = { cancelled: false }
    setLoading(true)
    void load(signal)
    return () => {
      signal.cancelled = true
    }
  }, [load])

  async function applyYAML() {
    setApplying(true)
    setError('')
    try {
      const res = await fetch(`/api/k8s/yaml/apply?module=${encodeURIComponent(module)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml }),
      })
      if (!res.ok) {
        throw new Error(await readAPIError(res, 'Apply failed'))
      }
      setConfirmOpen(false)
      toast.success(`Applied ${name}`)
      // Reload so the editor holds the new resourceVersion and server defaults.
      await load()
    } catch (e) {
      setConfirmOpen(false)
      setError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  async function onDelete() {
    setDeleting(true)
    setError('')
    try {
      await deleteK8sResource(module, name, {
        namespace: scoped ? undefined : namespace,
        clusterScoped: scoped,
      })
      setDeleteOpen(false)
      toast.success(`Deleted ${name}`)
      onDeleted?.()
    } catch (e) {
      setDeleteOpen(false)
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  async function copyYAML() {
    try {
      await navigator.clipboard.writeText(yaml)
      toast.success('YAML copied')
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  if (loading) return <PageLoading compact />

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {readOnlyHint ? <p className="mr-auto text-xs text-muted-foreground">{readOnlyHint}</p> : null}
        {allowEdit && dirty ? (
          <Badge variant="outline" className="mr-auto h-5 border-warning/30 bg-warning/10 text-[11px] text-warning">
            Unsaved changes
          </Badge>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {isSecret && canReveal ? (
            <Button
              type="button"
              size="sm"
              variant={revealed ? 'secondary' : 'outline'}
              disabled={applying || deleting || (revealed && dirty)}
              title={revealed && dirty ? 'Apply or revert your changes first' : undefined}
              onClick={() => {
                setLoading(true)
                setRevealed((v) => !v)
              }}
            >
              {revealed ? <EyeOffIcon /> : <EyeIcon />}
              {revealed ? 'Hide values' : 'Reveal values'}
            </Button>
          ) : null}
          <IconActionButton tooltip="Copy YAML" size="icon-sm" onClick={() => void copyYAML()} disabled={!yaml}>
            <CopyIcon />
          </IconActionButton>
          {allowEdit ? (
            <IconActionButton
              tooltip={dirty ? 'Revert changes' : 'Reload from cluster'}
              size="icon-sm"
              onClick={() => (dirty ? setYaml(original) : void load())}
              disabled={applying || deleting}
            >
              <RotateCcwIcon />
            </IconActionButton>
          ) : null}
          {canDelete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={applying || deleting}
            >
              Delete
            </Button>
          ) : null}
          {allowEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={applying || deleting || !dirty}
            >
              {applying ? 'Applying…' : 'Apply'}
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorAlert message={error} className="mx-0 mt-0" />
      {isSecret && revealed ? <SecretDataView yaml={yaml} /> : null}
      <Textarea
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        readOnly={!allowEdit}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={`YAML for ${name}`}
        onKeyDown={(e) => {
          // Keep focus in the editor and insert two spaces instead of moving focus.
          if (e.key === 'Tab' && allowEdit && !e.shiftKey) {
            e.preventDefault()
            const el = e.currentTarget
            const { selectionStart, selectionEnd } = el
            const next = `${yaml.slice(0, selectionStart)}  ${yaml.slice(selectionEnd)}`
            setYaml(next)
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = selectionStart + 2
            })
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 's' && allowEdit) {
            e.preventDefault()
            if (dirty) setConfirmOpen(true)
          }
        }}
        className="min-h-0 flex-1 resize-none overflow-auto bg-muted/30 font-mono text-xs leading-relaxed field-sizing-fixed md:text-xs"
      />
      <ConfirmDialog
        open={confirmOpen}
        title={`Apply changes to ${name}?`}
        description="The YAML is sent with server-side apply. Fields you removed may be reset to defaults."
        confirmLabel="Apply"
        pendingLabel="Applying…"
        pending={applying}
        onConfirm={applyYAML}
        onCancel={() => setConfirmOpen(false)}
      />
      {canDelete ? (
        <DeleteConfirm
          open={deleteOpen}
          resourceName={name}
          resourceLabel={module}
          pending={deleting}
          onConfirm={onDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : null}
    </div>
  )
}
