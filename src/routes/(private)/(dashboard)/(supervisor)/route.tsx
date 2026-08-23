import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Permissions } from '@/lib/authorization/permission-keys'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)')({
  component: RouteComponent,
  beforeLoad: async () => {
    const { authorization } = authStore.state

    // Check if user has ANY supervisor-level permission (grants access to supervisor section)
    // Supervisor section includes: sales reports, inventory reports, transactions, order history
    const supervisorPermissions = [
      Permissions.BRANCH_VIEW_SALES_REPORTS,
      Permissions.BRANCH_VIEW_INVENTORY_REPORTS,
      Permissions.BRANCH_VIEW_TRANSACTIONS,
      Permissions.BRANCH_VIEW_ORDERS,
      Permissions.BRANCH_EXPORT_REPORTS,
    ]

    const hasSupervisorPermission = authorization?.permissions.some(p => supervisorPermissions.includes(p as (typeof Permissions)[keyof typeof Permissions]))

    if (!hasSupervisorPermission) {
      // Redirect to dashboard instead of login (user is authenticated, just not authorized)
      throw redirect({ to: '/dashboard' })
    }
  },
})

function RouteComponent() {
  return <Outlet />
}
