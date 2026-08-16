import ResourceGroupPage from './ResourceGroupPage'

const modules = [
  { module: 'configmaps', label: 'ConfigMaps' },
  { module: 'secrets', label: 'Secrets' },
  { module: 'resourcequotas', label: 'ResourceQuotas' },
  { module: 'limitranges', label: 'LimitRanges' },
  { module: 'hpas', label: 'HPAs' },
  { module: 'pdbs', label: 'PodDisruptionBudgets' },
  { module: 'leases', label: 'Leases' },
  { module: 'priorityclasses', label: 'PriorityClasses', clusterScoped: true },
  { module: 'runtimeclasses', label: 'RuntimeClasses', clusterScoped: true },
]

export default function Config() {
  return <ResourceGroupPage title="Config" basePath="/config" modules={modules} />
}
