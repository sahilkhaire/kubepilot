import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  podContainerCounts,
  podContainerInfos,
  type K8sObject,
  type PodContainerInfo,
} from '@/lib/k8s-fields'
import { cn } from '@/lib/utils'

function squareClass(container: PodContainerInfo): string {
  if (container.state === 'running') return 'bg-success'
  if (container.state === 'waiting' || container.state === 'unknown') return 'bg-warning'
  if (container.state === 'terminated' && container.exitCode === 0) return 'bg-muted-foreground/45'
  return 'bg-destructive'
}

function kindPrefix(kind: PodContainerInfo['kind']): string {
  if (kind === 'init') return 'init: '
  if (kind === 'ephemeral') return 'eph: '
  return ''
}

export function PodContainersCell({ obj }: { obj: K8sObject }) {
  const containers = podContainerInfos(obj)
  const counts = podContainerCounts(obj)
  if (containers.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5">
            {containers.map((container) => (
              <span
                key={`${container.kind}:${container.name}`}
                className={cn('size-2 rounded-[2px]', squareClass(container))}
              />
            ))}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {counts.live}/{counts.total}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs items-start">
        <div className="grid gap-1">
          <p>
            {counts.live} live · {counts.waiting} waiting · {counts.terminated} terminated
          </p>
          <ul className="space-y-0.5">
            {containers.map((container) => (
              <li key={`${container.kind}:${container.name}`} className="flex items-center gap-1.5">
                <span className={cn('size-2 shrink-0 rounded-[2px]', squareClass(container))} />
                <span>
                  {kindPrefix(container.kind)}
                  {container.name}
                </span>
                <span className="opacity-80">
                  {container.reason}
                  {container.restartCount > 0 ? ` · ${container.restartCount} restarts` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
