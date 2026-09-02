import { authStore } from '@platform/lib/better-auth/auth-store'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)/(dashboard)/account')({
  component: () => <Outlet />,
  beforeLoad: async () => {
    const { user } = authStore.state
    // All authenticated users can access their account
    if (!user) {
      throw redirect({ to: '/login' })
    }
  },
})
