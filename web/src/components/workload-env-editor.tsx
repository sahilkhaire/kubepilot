import { useEffect, useState } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { updateResourceEnv } from '@/api'
import { ErrorAlert } from '@/components/error-alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ENV_NAME_RE,
  envValueFromLabel,
  podControlledBy,
  workloadEnvContainers,
  type K8sObject,
  type PodEnvContainer,
} from '@/lib/k8s-fields'

export default function WorkloadEnvEditor({
  resource,
  module,
}: {
  resource: K8sObject
  module: 'pods' | 'deployments'
}) {
  const name = resource.metadata?.name ?? ''
  const ns = resource.metadata?.namespace ?? ''
  const owner = module === 'pods' ? podControlledBy(resource) : `Deployment/${name}`
  const [containers, setContainers] = useState<PodEnvContainer[]>(() => workloadEnvContainers(resource))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setContainers(workloadEnvContainers(resource))
    setError('')
  }, [name, ns])

  function setEnv(ci: number, ei: number, patch: Partial<PodEnvContainer['env'][number]>) {
    setContainers((prev) =>
      prev.map((c, i) =>
        i !== ci
          ? c
          : { ...c, env: c.env.map((ev, j) => (j !== ei ? ev : { ...ev, ...patch })) },
      ),
    )
  }

  function addVar(ci: number) {
    setContainers((prev) =>
      prev.map((c, i) => (i !== ci ? c : { ...c, env: [...c.env, { name: '', value: '' }] })),
    )
  }

  function removeVar(ci: number, ei: number) {
    setContainers((prev) =>
      prev.map((c, i) => (i !== ci ? c : { ...c, env: c.env.filter((_, j) => j !== ei) })),
    )
  }

  const validation = validateEnv(containers)

  async function onSave() {
    if (validation || saving) return
    setSaving(true)
    setError('')
    try {
      const ownerInfo = await updateResourceEnv(
        module,
        ns,
        name,
        containers.map((c) => ({
          name: c.name,
          kind: c.kind,
          env: c.env
            .filter((ev) => ev.name.trim() || ev.value.trim() || ev.valueFrom)
            .map((ev) =>
              ev.valueFrom
                ? { name: ev.name.trim(), valueFrom: ev.valueFrom }
                : { name: ev.name.trim(), value: ev.value },
            ),
        })),
      )
      toast.success(`Updated ${ownerInfo.kind} ${ownerInfo.name}. New pods will roll out.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to update environment')
    } finally {
      setSaving(false)
    }
  }

  if (containers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No containers found on this {module === 'pods' ? 'pod' : 'deployment'}.
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {module === 'pods'
          ? `Edit environment variables only. Saving updates the owning workload${owner ? ` (${owner})` : ''} and rolls out new pods. The live pod spec cannot be patched.`
          : 'Edit environment variables only. Saving updates this Deployment and rolls out new pods.'}
      </p>
      {validation ? <p className="text-xs text-destructive">{validation}</p> : null}
      <ErrorAlert message={error} className="mx-0 mt-0" />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        {containers.map((container, ci) => (
          <section key={`${container.kind}:${container.name}`} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-medium">{container.name}</h3>
              {container.kind === 'init' ? (
                <Badge variant="outline" className="h-5 text-[10px]">
                  init
                </Badge>
              ) : null}
            </div>
            {container.env.length === 0 ? (
              <p className="text-xs text-muted-foreground">No environment variables.</p>
            ) : (
              <ul className="space-y-1.5">
                {container.env.map((ev, ei) => (
                  <li key={`${container.name}-${ei}`} className="flex items-center gap-1.5">
                    <Input
                      value={ev.name}
                      placeholder="NAME"
                      readOnly={Boolean(ev.valueFrom)}
                      className="h-7 font-mono text-xs"
                      onChange={(e) => setEnv(ci, ei, { name: e.target.value })}
                    />
                    {ev.valueFrom ? (
                      <Input
                        value={envValueFromLabel(ev.valueFrom)}
                        readOnly
                        className="h-7 font-mono text-xs text-muted-foreground"
                      />
                    ) : (
                      <Input
                        value={ev.value}
                        placeholder="value"
                        className="h-7 font-mono text-xs"
                        onChange={(e) => setEnv(ci, ei, { value: e.target.value })}
                      />
                    )}
                    {ev.valueFrom ? (
                      <span className="w-7" />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${ev.name || 'variable'}`}
                        onClick={() => removeVar(ci, ei)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => addVar(ci)}>
              <PlusIcon />
              Add variable
            </Button>
          </section>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={Boolean(validation) || saving} onClick={() => void onSave()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function validateEnv(containers: PodEnvContainer[]): string {
  for (const container of containers) {
    const seen = new Set<string>()
    for (const ev of container.env) {
      const name = ev.name.trim()
      if (!name) {
        if (ev.value.trim()) return 'Environment variable name is required'
        continue
      }
      if (!ENV_NAME_RE.test(name)) {
        return `Invalid name ${name}`
      }
      if (seen.has(name)) return `Duplicate name ${name} on ${container.name}`
      seen.add(name)
    }
  }
  return ''
}
