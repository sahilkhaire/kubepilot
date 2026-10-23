import { useEffect, useState } from 'react'
import { getJSON } from '@/api'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { K8sObject } from '@/lib/k8s-fields'

const DEFAULT_CONTAINER_ANNOTATION = 'kubectl.kubernetes.io/default-container'

export type PodContainerOption = { name: string; init: boolean }

type ContainerSpec = { name?: string }

/**
 * Loads a pod's containers. Kubernetes needs a container name for logs and exec
 * when a pod has more than one, so callers pass `container` through to the stream.
 * The initial pick follows kubectl: the default-container annotation, else the first app container.
 */
export function usePodContainers(namespace: string | undefined, pod: string | undefined) {
  const [containers, setContainers] = useState<PodContainerOption[]>([])
  const [container, setContainer] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!namespace || !pod) return
    let cancelled = false
    setReady(false)
    setError('')
    getJSON<K8sObject>(
      `/api/k8s/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}`,
      'Failed to load pod',
    )
      .then((obj) => {
        if (cancelled) return
        const spec = obj.spec as { containers?: ContainerSpec[]; initContainers?: ContainerSpec[] } | undefined
        const apps = (spec?.containers ?? []).map((c) => ({ name: c.name ?? '', init: false }))
        const inits = (spec?.initContainers ?? []).map((c) => ({ name: c.name ?? '', init: true }))
        const all = [...apps, ...inits].filter((c) => c.name)
        const preferred = obj.metadata?.annotations?.[DEFAULT_CONTAINER_ANNOTATION]
        setContainers(all)
        setContainer(all.some((c) => c.name === preferred) ? (preferred as string) : (apps[0]?.name ?? all[0]?.name ?? ''))
      })
      .catch((e: unknown) => {
        // Streams still work for single-container pods without an explicit name.
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load pod')
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [namespace, pod])

  return { containers, container, setContainer, ready, error }
}

export function ContainerSelect({
  containers,
  value,
  onChange,
  includeInit = true,
}: {
  containers: PodContainerOption[]
  value: string
  onChange: (value: string) => void
  includeInit?: boolean
}) {
  const apps = containers.filter((c) => !c.init)
  const inits = includeInit ? containers.filter((c) => c.init) : []
  if (apps.length + inits.length <= 1) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-7 min-w-36 text-xs" aria-label="Container">
        <span className="text-muted-foreground">container:</span>
        <SelectValue placeholder="Container" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {inits.length > 0 ? <SelectLabel>Containers</SelectLabel> : null}
          {apps.map((c) => (
            <SelectItem key={c.name} value={c.name}>
              {c.name}
            </SelectItem>
          ))}
        </SelectGroup>
        {inits.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Init containers</SelectLabel>
            {inits.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
      </SelectContent>
    </Select>
  )
}
