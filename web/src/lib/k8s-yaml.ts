export const gvkForModule: Record<string, string> = {
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
  namespaces: 'v1/Namespace',
  serviceaccounts: 'v1/ServiceAccount',
  roles: 'rbac.authorization.k8s.io/v1/Role',
  rolebindings: 'rbac.authorization.k8s.io/v1/RoleBinding',
  clusterroles: 'rbac.authorization.k8s.io/v1/ClusterRole',
  clusterrolebindings: 'rbac.authorization.k8s.io/v1/ClusterRoleBinding',
}

export const clusterScopedModules = new Set([
  'priorityclasses',
  'runtimeclasses',
  'ingressclasses',
  'pvs',
  'storageclasses',
  'nodes',
  'namespaces',
  'clusterroles',
  'clusterrolebindings',
])

export type YAMLTarget = {
  module: string
  name: string
  namespace?: string
  clusterScoped?: boolean
}

export function isClusterScopedModule(module: string): boolean {
  return clusterScopedModules.has(module)
}
