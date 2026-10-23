import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from 'lucide-react'
import ResourceYAMLEditor from '@/components/resource-yaml-editor'
import { PageBody, PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'
import { gvkForModule, isClusterScopedModule } from '@/lib/k8s-yaml'

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
  const kind = gvkForModule[module]?.split('/').pop() ?? module

  if (module && !can(user, module, 'view')) {
    return <Navigate to="/" replace />
  }

  return (
    <PageBody>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" asChild aria-label={`Back to ${backLabel}`}>
              <Link to={listHref}>
                <ArrowLeftIcon />
              </Link>
            </Button>
            <span className="truncate">{name}</span>
          </span>
        }
        description={`${kind} · ${!clusterScoped && ns ? ns : 'cluster-scoped'}`}
      />
      {name ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <ResourceYAMLEditor
            key={`${module}/${ns ?? ''}/${name}`}
            module={module}
            name={name}
            namespace={ns}
            clusterScoped={clusterScoped}
            canEdit={can(user, module, 'yaml_edit')}
            canDelete={can(user, module, 'delete')}
            canReveal={module === 'secrets' && can(user, 'secrets', 'reveal')}
            onDeleted={() => navigate(listHref)}
          />
        </div>
      ) : null}
    </PageBody>
  )
}
