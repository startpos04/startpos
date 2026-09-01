/**
 * Branch Billing Route Layout
 * 
 * Handles routing and permissions for branch-level billing functionality.
 * Requires appropriate branch billing permissions to access.
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Permissions } from '@startpos-core/lib/authorization/permission-keys'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/billing')({
  beforeLoad: ({ context }) => {
    const { authorization } = authStore.state
    
    // Check if user has branch billing view permission
    const canViewBilling = authorization?.permissions?.includes(Permissions.BRANCH_VIEW_BILLING) ?? false
    
    if (!canViewBilling) {
      throw redirect({ to: '/login' })
    }
  },
  component: BranchBillingLayout,
})

function BranchBillingLayout() {
  return <Outlet />
}