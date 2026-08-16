import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { deleteK8sResource } from '@/api'
import { ConfirmDialog } from '@/components/confirm-dialog'
import DeleteConfirm from '@/components/DeleteConfirm'
import { ErrorAlert } from '@/components/error-alert'
import { PageLoading } from '@/components/page-loading'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { gvkForModule, isClusterScopedModule } from '@/lib/k8s-yaml'

export default function ResourceYAMLEditor({
  module,
  name,
  namespace,
  clusterScoped,
  canEdit = true,
  canDelete = false,
  onDeleted,
}: {
  module: string
  name: string
  namespace?: string
  clusterScoped?: boolean
  canEdit?: boolean
  canDelete?: boolean
  onDeleted?: () => void
}) {
  const scoped = clusterScoped ?? isClusterScopedModule(module)
  const [yaml, setYaml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const gvk = gvkForModule[module]
    if (!gvk || !name) {
      setError('unsupported resource type')
      setLoading(false)
      return
    }
    if (!scoped && !namespace) {
      setError('namespace required')
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ gvk, name })
        if (!scoped && namespace) params.set('namespace', namespace)
        const res = await fetch(`/api/k8s/yaml?${params}`, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`failed to load yaml (${res.status})`)
        const text = await res.text()
        if (!cancelled) setYaml(text)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [module, name, namespace, scoped])

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
      if (!res.ok) throw new Error(`apply failed (${res.status})`)
      setConfirmOpen(false)
      toast.success(`Applied ${module}/${name}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'apply failed')
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
      setError(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <PageLoading compact />

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={applying || deleting}>
            Apply
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={applying || deleting}
          >
            Delete
          </Button>
        ) : null}
      </div>
      <ErrorAlert message={error} />
      <Textarea
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        readOnly={!canEdit}
        className="min-h-0 flex-1 overflow-auto font-mono text-xs"
      />
      <ConfirmDialog
        open={confirmOpen}
        title="Apply YAML"
        description="Apply this YAML with server-side apply?"
        confirmLabel="Confirm apply"
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
