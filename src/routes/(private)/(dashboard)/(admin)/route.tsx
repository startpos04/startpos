import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Permissions } from '@/lib/authorization/permission-keys'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)')({
  component: RouteComponent,
  beforeLoad: async () => {
    const { authorization } = authStore.state

    // Check if user has ANY admin-level permission (grants access to admin section)
    // Admin section includes: employees, products, ingredients, purchases, preparation
    const adminPermissions = [
      Permissions.BRANCH_VIEW_EMPLOYEES,
      Permissions.BRANCH_MANAGE_EMPLOYEES,
      Permissions.BRANCH_VIEW_PRODUCTS,
      Permissions.BRANCH_MANAGE_PRODUCTS,
      Permissions.BRANCH_VIEW_PURCHASES,
      Permissions.BRANCH_MANAGE_PURCHASES,
      Permissions.BRANCH_VIEW_PRODUCTION,
      Permissions.BRANCH_MANAGE_PRODUCTION,
    ]

    const hasAdminPermission = authorization?.permissions.some(p => adminPermissions.includes(p as (typeof Permissions)[keyof typeof Permissions]))

    if (!hasAdminPermission) {
      // Redirect to dashboard instead of login (user is authenticated, just not authorized)
      throw redirect({ to: '/dashboard' })
    }
  },
})

function RouteComponent() {
  return <Outlet />
}
