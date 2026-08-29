/**
 * business/subscription/route.tsx
 *
 * Subscription layout wrapper — wraps all /business/subscription sub-routes.
 * No role-gate is applied here: even EXPIRED admins must be able to access
 * /business/subscription to reactivate (Phase 1 compliance gate: MANAGE_BILLING always accessible).
 *
 * Access control is handled by the parent /business route (admin only).
 */

import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription')({
  component: SubscriptionLayout,
})

function SubscriptionLayout() {
  return <Outlet />
}
