import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Permissions } from '@/lib/authorization/permission-keys'
import { authStore } from '@/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/settings')({
  component: () => <Outlet />,
  beforeLoad: async ctx => {
    const { authorization } = authStore.state

    // Check if user has permission to view settings
    const canViewSettings = authorization?.permissions?.includes(Permissions.BRANCH_VIEW_SETTINGS) ?? false

    if (!canViewSettings) {
      throw redirect({ to: '/login' })
    }

    // Handle redirects for old settings tabs that have been moved
    // Check if there's a tab query parameter in the URL
    const search = ctx.location.search as { tab?: string }
    if (search.tab) {
      const tabLower = search.tab.toLowerCase()

      // Redirect old user-level tabs to /account section
      if (tabLower === 'account') {
        throw redirect({ to: '/account' })
      }
      if (tabLower === 'security') {
        throw redirect({ to: '/account/security' })
      }

      // Redirect old business-level tabs to /business section
      if (tabLower === 'suppliers') {
        throw redirect({ to: '/business/suppliers' })
      }
      if (tabLower === 'customers') {
        throw redirect({ to: '/business/customers' })
      }
      if (tabLower === 'branches') {
        throw redirect({ to: '/business/branches' })
      }
      if (tabLower === 'capabilities') {
        throw redirect({ to: '/business/capabilities' })
      }
      if (tabLower === 'business profile' || tabLower === 'business%20profile') {
        throw redirect({ to: '/business/profile' })
      }
    }
  },
})
