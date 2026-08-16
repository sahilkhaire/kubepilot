import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

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

  if (loading) {
    return <p>Loading…</p>
  }

  return (
    <div style={{ maxWidth: '56rem', margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to={backLink}>← {backLabel}</Link>
      </p>
      <h1>YAML: {module}/{name}</h1>
      {!clusterScoped && ns && <p style={{ color: '#666' }}>Namespace: {ns}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <textarea
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        rows={24}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.875rem' }}
      />
      <div style={{ marginTop: '1rem' }}>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={applying}>
          Apply
        </button>
      </div>
      {confirmOpen && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid #ccc',
            background: '#fafafa',
          }}
        >
          <p>Apply this YAML with server-side apply?</p>
          <button type="button" onClick={applyYAML} disabled={applying}>
            {applying ? 'Applying…' : 'Confirm apply'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={applying}
            style={{ marginLeft: '0.5rem' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
