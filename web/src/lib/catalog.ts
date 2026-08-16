import type { LucideIcon } from 'lucide-react'
import {
  BoxesIcon,
  ClipboardListIcon,
  FileCogIcon,
  HardDriveIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LayersIcon,
  NetworkIcon,
  PuzzleIcon,
  ScrollTextIcon,
  ServerIcon,
  ShieldIcon,
  ShipIcon,
  SlidersHorizontalIcon,
  SquareStackIcon,
  UsersIcon,
} from 'lucide-react'

export type CatalogKind = {
  module: string
  label: string
  clusterScoped?: boolean
}

export type CatalogSection = {
  id: string
  title: string
  icon: LucideIcon
  url?: string
  basePath?: string
  kinds?: CatalogKind[]
}

export const catalog: CatalogSection[] = [
  { id: 'overview', title: 'Overview', icon: LayoutDashboardIcon, url: '/' },
  { id: 'nodes', title: 'Nodes', icon: ServerIcon, url: '/nodes' },
  {
    id: 'workloads',
    title: 'Workloads',
    icon: BoxesIcon,
    basePath: '/workloads',
    kinds: [
      { module: 'overview', label: 'Overview' },
      { module: 'pods', label: 'Pods' },
      { module: 'deployments', label: 'Deployments' },
      { module: 'daemonsets', label: 'Daemon Sets' },
      { module: 'statefulsets', label: 'Stateful Sets' },
      { module: 'replicasets', label: 'Replica Sets' },
      { module: 'jobs', label: 'Jobs' },
      { module: 'cronjobs', label: 'Cron Jobs' },
    ],
  },
  {
    id: 'config',
    title: 'Config',
    icon: FileCogIcon,
    basePath: '/config',
    kinds: [
      { module: 'configmaps', label: 'Config Maps' },
      { module: 'secrets', label: 'Secrets' },
      { module: 'resourcequotas', label: 'Resource Quotas' },
      { module: 'limitranges', label: 'Limit Ranges' },
      { module: 'hpas', label: 'Horizontal Pod Autoscalers' },
      { module: 'pdbs', label: 'Pod Disruption Budgets' },
      { module: 'priorityclasses', label: 'Priority Classes', clusterScoped: true },
      { module: 'runtimeclasses', label: 'Runtime Classes', clusterScoped: true },
      { module: 'leases', label: 'Leases' },
    ],
  },
  {
    id: 'network',
    title: 'Network',
    icon: NetworkIcon,
    basePath: '/network',
    kinds: [
      { module: 'services', label: 'Services' },
      { module: 'endpoints', label: 'Endpoints' },
      { module: 'ingresses', label: 'Ingresses' },
      { module: 'ingressclasses', label: 'Ingress Classes', clusterScoped: true },
      { module: 'networkpolicies', label: 'Network Policies' },
    ],
  },
  {
    id: 'storage',
    title: 'Storage',
    icon: HardDriveIcon,
    basePath: '/storage',
    kinds: [
      { module: 'pvcs', label: 'Persistent Volume Claims' },
      { module: 'pvs', label: 'Persistent Volumes', clusterScoped: true },
      { module: 'storageclasses', label: 'Storage Classes', clusterScoped: true },
    ],
  },
  { id: 'namespaces', title: 'Namespaces', icon: LayersIcon, url: '/namespaces' },
  { id: 'events', title: 'Events', icon: ScrollTextIcon, url: '/events' },
  {
    id: 'helm',
    title: 'Helm',
    icon: ShipIcon,
    basePath: '/helm',
    kinds: [{ module: 'releases', label: 'Releases' }],
  },
  {
    id: 'access',
    title: 'Access Control',
    icon: ShieldIcon,
    basePath: '/access',
    kinds: [
      { module: 'serviceaccounts', label: 'Service Accounts' },
      { module: 'roles', label: 'Roles' },
      { module: 'rolebindings', label: 'Role Bindings' },
      { module: 'clusterroles', label: 'Cluster Roles', clusterScoped: true },
      { module: 'clusterrolebindings', label: 'Cluster Role Bindings', clusterScoped: true },
    ],
  },
  {
    id: 'custom-resources',
    title: 'Custom Resources',
    icon: PuzzleIcon,
    basePath: '/custom-resources',
    kinds: [{ module: 'definitions', label: 'Definitions' }],
  },
]

export const settingsSection: CatalogSection = {
  id: 'settings',
  title: 'Settings',
  icon: SquareStackIcon,
  basePath: '/settings',
  kinds: [
    { module: 'members', label: 'Members' },
    { module: 'sets', label: 'Permission sets' },
    { module: 'audit', label: 'Audit' },
    { module: 'app', label: 'App' },
  ],
}

export const settingsIcons = {
  members: UsersIcon,
  sets: KeyRoundIcon,
  audit: ClipboardListIcon,
  app: SlidersHorizontalIcon,
}

export function kindUrl(section: CatalogSection, kind: CatalogKind): string {
  if (section.basePath) {
    return `${section.basePath}/${kind.module}`
  }
  return kind.module
}

export function findKind(sectionId: string, module: string): CatalogKind | undefined {
  const section = catalog.find((s) => s.id === sectionId)
  return section?.kinds?.find((k) => k.module === module)
}
