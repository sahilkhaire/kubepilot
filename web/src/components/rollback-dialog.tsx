import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getJSON, rollbackDeployment } from '@/api'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatAge, type K8sObject } from '@/lib/k8s-fields'
import { cn } from '@/lib/utils'

const REVISION_ANNOTATION = 'deployment.kubernetes.io/revision'

type Revision = {
  revision: number
  images: string[]
  created?: string
}

function revisionOf(obj: K8sObject): number {
  const raw = obj.metadata?.annotations?.[REVISION_ANNOTATION]
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(n) ? n : 0
}

function ownedBy(rs: K8sObject, deploymentName: string): boolean {
  const refs = rs.metadata?.ownerReferences
  return Boolean(refs?.some((ref) => ref.controller && ref.kind === 'Deployment' && ref.name === deploymentName))
}

function templateImages(obj: K8sObject): string[] {
  const containers = (obj.spec?.template as { spec?: { containers?: { image?: string }[] } } | undefined)?.spec
    ?.containers
  return (containers ?? []).map((c) => c.image ?? '').filter(Boolean)
}

export function RollbackDialog({
  deployment,
  onClose,
  onDone,
}: {
  deployment: { name: string; namespace: string; revision: number } | null
  onClose: () => void
  onDone?: () => void
}) {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!deployment) return
    let cancelled = false
    setLoading(true)
    setError('')
    setSelected(null)
    setRevisions([])
    getJSON<K8sObject[]>(
      `/api/k8s/namespaces/${encodeURIComponent(deployment.namespace)}/replicasets`,
      'Failed to load revisions',
    )
      .then((data) => {
        if (cancelled) return
        const list = (Array.isArray(data) ? data : [])
          .filter((rs) => ownedBy(rs, deployment.name))
          .map((rs) => ({ revision: revisionOf(rs), images: templateImages(rs), created: rs.metadata?.creationTimestamp }))
          .filter((r) => r.revision > 0 && r.revision !== deployment.revision)
          .sort((a, b) => b.revision - a.revision)
        setRevisions(list)
        setSelected(list[0]?.revision ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load revisions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [deployment])

  async function onConfirm() {
    if (!deployment || selected == null) return
    setPending(true)
    setError('')
    try {
      await rollbackDeployment(deployment.namespace, deployment.name, selected)
      toast.success(`Rolling back ${deployment.name} to revision ${selected}`)
      onDone?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rollback failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={deployment != null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-all">Roll back {deployment?.name}</DialogTitle>
          <DialogDescription>
            Pick a previous revision. Its pod template replaces the current one
            {deployment?.revision ? ` (revision ${deployment.revision})` : ''} and new pods roll out.
          </DialogDescription>
        </DialogHeader>
        <ErrorAlert message={error} className="mx-0 mt-0" />
        <div className="max-h-72 overflow-y-auto rounded-md border" role="radiogroup" aria-label="Revisions">
          {loading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading revisions…</p>
          ) : revisions.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No earlier revisions are available. Kubernetes keeps a limited history per deployment.
            </p>
          ) : (
            revisions.map((rev) => (
              <button
                key={rev.revision}
                type="button"
                role="radio"
                aria-checked={selected === rev.revision}
                onClick={() => setSelected(rev.revision)}
                className={cn(
                  'flex w-full items-start gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50',
                  selected === rev.revision && 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'mt-1 size-3 shrink-0 rounded-full border',
                    selected === rev.revision && 'border-4 border-primary',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">Revision {rev.revision}</span>
                    <span className="text-xs text-muted-foreground">{formatAge(rev.created)} ago</span>
                  </span>
                  {rev.images.map((image) => (
                    <span key={image} className="block truncate font-mono text-[11px] text-muted-foreground" title={image}>
                      {image}
                    </span>
                  ))}
                </span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || selected == null} onClick={() => void onConfirm()}>
            {pending ? 'Rolling back…' : selected != null ? `Roll back to ${selected}` : 'Roll back'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function deploymentRevision(obj: K8sObject): number {
  return revisionOf(obj)
}
