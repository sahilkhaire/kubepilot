import { createContext, useContext } from 'react'
import type { User } from '@/api'

const UserContext = createContext<User | null>(null)

export function UserProvider({ user, children }: { user: User; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

export function useUser(): User {
  const user = useContext(UserContext)
  if (!user) {
    throw new Error('useUser must be used within UserProvider')
  }
  return user
}
