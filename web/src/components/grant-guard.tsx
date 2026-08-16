import { Navigate } from 'react-router-dom'
import { useUser } from '@/lib/auth-context'
import { can } from '@/lib/grants'

export function GrantGuard({
  module,
  action = 'view',
  children,
}: {
  module: string
  action?: string
  children: React.ReactNode
}) {
  const user = useUser()
  if (can(user, module, action)) {
    return children
  }
  return <Navigate to="/" replace />
}
