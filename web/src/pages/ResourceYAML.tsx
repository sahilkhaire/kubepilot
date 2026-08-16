import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import { PageBody, PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import { isClusterScopedModule } from '@/lib/k8s-yaml'

type ResourceYAMLProps = {
  backLink: string
  backLabel: string
}

export default function ResourceYAML({ backLink, backLabel }: ResourceYAMLProps) {
  const { ns, resource, name } = useParams<{ ns?: string; resource: string; name: string }>()
  const navigate = useNavigate()
  const user = useUser()

  const module = resource ?? ''
  const clusterScoped = isClusterScopedModule(module)
  const groupedBack = ['/workloads', '/config', '/network', '/storage', '/access']
  const listHref = groupedBack.includes(backLink) && module ? `${backLink}/${module}` : backLink
  const grantModule = module

  if (module && !can(user, grantModule, 'view')) {
    return <Navigate to="/" replace />
  }

  return (
    <PageBody>
      <PageHeader
        title={`YAML: ${module}/${name}`}
        description={!clusterScoped && ns ? `Namespace ${ns}` : 'Cluster-scoped resource'}
      >
        <Button variant="outline" asChild>
          <Link to={listHref}>Back to {backLabel}</Link>
        </Button>
      </PageHeader>
      {name ? (
        <div className="min-h-0 flex-1 p-3">
          <ResourceYAMLEditor
            module={module}
            name={name}
            namespace={ns}
            clusterScoped={clusterScoped}
            canEdit={can(user, grantModule, 'yaml_edit')}
            canDelete={can(user, grantModule, 'delete')}
            onDeleted={() => navigate(listHref)}
          />
        </div>
      ) : null}
    </PageBody>
  )
}
