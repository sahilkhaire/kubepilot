import ResourceGroupPage from './ResourceGroupPage'

const modules = [
  { module: 'services', label: 'Services' },
  { module: 'endpoints', label: 'Endpoints' },
  { module: 'ingresses', label: 'Ingresses' },
  { module: 'ingressclasses', label: 'IngressClasses', clusterScoped: true },
  { module: 'networkpolicies', label: 'NetworkPolicies' },
]

export default function Network() {
  return <ResourceGroupPage title="Network" basePath="/network" modules={modules} />
}
