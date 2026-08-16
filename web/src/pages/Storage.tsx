import ResourceGroupPage from './ResourceGroupPage'

const modules = [
  { module: 'pvcs', label: 'PersistentVolumeClaims' },
  { module: 'pvs', label: 'PersistentVolumes', clusterScoped: true },
  { module: 'storageclasses', label: 'StorageClasses', clusterScoped: true },
]

export default function Storage() {
  return <ResourceGroupPage title="Storage" basePath="/storage" modules={modules} />
}
