import ResourceGroupPage from './ResourceGroupPage'

const modules = [
  { module: 'serviceaccounts', label: 'ServiceAccounts' },
  { module: 'roles', label: 'Roles' },
  { module: 'rolebindings', label: 'RoleBindings' },
  { module: 'clusterroles', label: 'ClusterRoles', clusterScoped: true },
  { module: 'clusterrolebindings', label: 'ClusterRoleBindings', clusterScoped: true },
]

export default function AccessControl() {
  return <ResourceGroupPage title="Access Control" basePath="/access" modules={modules} />
}
