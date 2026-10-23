import type { LucideIcon } from 'lucide-react'
import {
  BoxIcon,
  CalendarClockIcon,
  CopyIcon,
  DatabaseIcon,
  LayersIcon,
  PlayCircleIcon,
  RocketIcon,
} from 'lucide-react'

export type WorkloadKind = { module: string; label: string; href: string; icon: LucideIcon }

/** Workload kinds in sidebar order, shared by the Overview and Workloads pages. */
export const workloadKinds: WorkloadKind[] = [
  { module: 'pods', label: 'Pods', href: '/workloads/pods', icon: BoxIcon },
  { module: 'deployments', label: 'Deployments', href: '/workloads/deployments', icon: RocketIcon },
  { module: 'daemonsets', label: 'Daemon Sets', href: '/workloads/daemonsets', icon: LayersIcon },
  { module: 'statefulsets', label: 'Stateful Sets', href: '/workloads/statefulsets', icon: DatabaseIcon },
  { module: 'replicasets', label: 'Replica Sets', href: '/workloads/replicasets', icon: CopyIcon },
  { module: 'jobs', label: 'Jobs', href: '/workloads/jobs', icon: PlayCircleIcon },
  { module: 'cronjobs', label: 'Cron Jobs', href: '/workloads/cronjobs', icon: CalendarClockIcon },
]
