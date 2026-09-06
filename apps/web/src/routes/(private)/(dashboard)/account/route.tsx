import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAuthenticatedUser } from '@/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/account')({
  component: () => <Outlet />,
  beforeLoad: async () => {
    const user = getAuthenticatedUser()
    // All authenticated users can access their account
    if (!user) {
      throw redirect({ to: '/login' })
    }
  },
})
