import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Permissions } from '@startpos-core/lib/authorization/permission-keys'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/business/customers')({
  component: () => <Outlet />,
  beforeLoad: async () => {
    const { authorization } = authStore.state

    // Check if user has permission to view customers
    const canViewCustomers = authorization?.permissions?.includes(Permissions.BUSINESS_VIEW_CUSTOMERS) ?? false

    if (!canViewCustomers) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
