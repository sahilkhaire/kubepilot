import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteK8sResource } from '@/api'
import { ConfirmDialog } from '@/components/confirm-dialog'
import DeleteConfirm from '@/components/DeleteConfirm'
import { ErrorAlert } from '@/components/error-alert'
import { PageBody, PageHeader } from '@/components/page-header'
import { PageLoading } from '@/components/page-loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const gvkForModule: Record<string, string> = {
  pods: 'v1/Pod',
  deployments: 'apps/v1/Deployment',
  statefulsets: 'apps/v1/StatefulSet',
  daemonsets: 'apps/v1/DaemonSet',
  replicasets: 'apps/v1/ReplicaSet',
  jobs: 'batch/v1/Job',
  cronjobs: 'batch/v1/CronJob',
  configmaps: 'v1/ConfigMap',
  secrets: 'v1/Secret',
  resourcequotas: 'v1/ResourceQuota',
  limitranges: 'v1/LimitRange',
  hpas: 'autoscaling/v2/HorizontalPodAutoscaler',
  pdbs: 'policy/v1/PodDisruptionBudget',
  leases: 'coordination.k8s.io/v1/Lease',
  priorityclasses: 'scheduling.k8s.io/v1/PriorityClass',
  runtimeclasses: 'node.k8s.io/v1/RuntimeClass',
  services: 'v1/Service',
  endpoints: 'v1/Endpoints',
  ingresses: 'networking.k8s.io/v1/Ingress',
  ingressclasses: 'networking.k8s.io/v1/IngressClass',
  networkpolicies: 'networking.k8s.io/v1/NetworkPolicy',
  pvcs: 'v1/PersistentVolumeClaim',
  pvs: 'v1/PersistentVolume',
  storageclasses: 'storage.k8s.io/v1/StorageClass',
  nodes: 'v1/Node',
  serviceaccounts: 'v1/ServiceAccount',
  roles: 'rbac.authorization.k8s.io/v1/Role',
  rolebindings: 'rbac.authorization.k8s.io/v1/RoleBinding',
  clusterroles: 'rbac.authorization.k8s.io/v1/ClusterRole',
  clusterrolebindings: 'rbac.authorization.k8s.io/v1/ClusterRoleBinding',
}

const clusterScopedModules = new Set([
  'priorityclasses',
  'runtimeclasses',
  'ingressclasses',
  'pvs',
  'storageclasses',
  'nodes',
  'clusterroles',
  'clusterrolebindings',
])

type ResourceYAMLProps = {
  backLink: string
  backLabel: string
}

export default function ResourceYAML({ backLink, backLabel }: ResourceYAMLProps) {
  const { ns, resource, name } = useParams<{ ns?: string; resource: string; name: string }>()
  const [yaml, setYaml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const navigate = useNavigate()

  const module = resource ?? ''
  const clusterScoped = clusterScopedModules.has(module)

  useEffect(() => {
    if (!module || !name) return
    const gvk = gvkForModule[module]
    if (!gvk) {
      setError('unsupported resource type')
      setLoading(false)
      return
    }
    if (!clusterScoped && !ns) {
      setError('namespace required')
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ gvk, name: name! })
        if (!clusterScoped && ns) {
          params.set('namespace', ns)
        }
        const res = await fetch(`/api/k8s/yaml?${params}`, { credentials: 'same-origin' })
        if (!res.ok) {
          throw new Error(`failed to load yaml (${res.status})`)
        }
        const text = await res.text()
        if (!cancelled) {
          setYaml(text)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [ns, module, name, clusterScoped])

  async function applyYAML() {
    if (!module) return
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
        throw new Error(`apply failed (${res.status})`)
      }
      setConfirmOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'apply failed')
    } finally {
      setApplying(false)
    }
  }

  async function onDelete() {
    if (!module || !name) return
    setDeleting(true)
    setError('')
    try {
      await deleteK8sResource(module, name, {
        namespace: clusterScoped ? undefined : ns,
        clusterScoped,
      })
      setDeleteOpen(false)
      navigate(backLink)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <PageLoading />
  }

  return (
    <PageBody>
      <PageHeader
        title={`YAML: ${module}/${name}`}
        description={!clusterScoped && ns ? `Namespace ${ns}` : 'Cluster-scoped resource'}
      >
        <Button variant="outline" asChild>
          <Link to={backLink}>Back to {backLabel}</Link>
        </Button>
        <Button type="button" onClick={() => setConfirmOpen(true)} disabled={applying || deleting}>
          Apply
        </Button>
        <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)} disabled={applying || deleting}>
          Delete
        </Button>
      </PageHeader>
      <ErrorAlert message={error} />
      <Card className="shadow-sm">
        <CardHeader className="sr-only">YAML editor</CardHeader>
        <CardContent>
          <Textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            rows={24}
            className="min-h-112 font-mono text-sm"
          />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="Apply YAML"
        description="Apply this YAML with server-side apply?"
        confirmLabel={applying ? 'Applying…' : 'Confirm apply'}
        pending={applying}
        onConfirm={applyYAML}
        onCancel={() => setConfirmOpen(false)}
      />
      {name ? (
        <DeleteConfirm
          open={deleteOpen}
          resourceName={name}
          resourceLabel={module}
          pending={deleting}
          onConfirm={onDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : null}
    </PageBody>
  )
}
