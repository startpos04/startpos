import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Permissions } from '@/lib/authorization/permission-keys'
import { authStore } from '@/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/business/suppliers')({
  component: () => <Outlet />,
  beforeLoad: async () => {
    const { authorization } = authStore.state

    // Check if user has permission to view suppliers
    const canViewSuppliers = authorization?.permissions?.includes(Permissions.BUSINESS_VIEW_SUPPLIERS) ?? false

    if (!canViewSuppliers) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
