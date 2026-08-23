import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Permissions } from '@/lib/authorization/permission-keys'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/business')({
  component: () => <Outlet />,
  beforeLoad: async () => {
    const { authorization } = authStore.state

    // Check if user has ANY business-level permission (grants access to business section)
    const businessPermissions = [
      Permissions.BUSINESS_VIEW_BILLING,
      Permissions.BUSINESS_MANAGE_BILLING,
      Permissions.BUSINESS_VIEW_BRANCHES,
      Permissions.BUSINESS_MANAGE_BRANCHES,
      Permissions.BUSINESS_VIEW_CAPABILITIES,
      Permissions.BUSINESS_MANAGE_CAPABILITIES,
      Permissions.BUSINESS_VIEW_PROFILE,
      Permissions.BUSINESS_MANAGE_PROFILE,
      Permissions.BUSINESS_VIEW_SUPPLIERS,
      Permissions.BUSINESS_MANAGE_SUPPLIERS,
      Permissions.BUSINESS_VIEW_CUSTOMERS,
      Permissions.BUSINESS_MANAGE_CUSTOMERS,
    ]

    const hasBusinessPermission = authorization?.permissions.some(p => businessPermissions.includes(p as (typeof Permissions)[keyof typeof Permissions]))

    if (!hasBusinessPermission) {
      // Redirect to dashboard instead of login (user is authenticated, just not authorized)
      throw redirect({ to: '/dashboard' })
    }
  },
})
