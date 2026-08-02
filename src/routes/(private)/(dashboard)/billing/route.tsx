/**
 * billing/route.tsx
 *
 * Billing layout wrapper — wraps all /billing sub-routes.
 * No role-gate is applied here: even EXPIRED admins must be able to access
 * /billing to reactivate (Phase 1 compliance gate: MANAGE_BILLING always accessible).
 *
 * Only ADMIN users reach this layout via the sidebar; the route itself
 * does not redirect on role — the sidebar controls visibility.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)/(dashboard)/billing')({
  component: BillingLayout,
})

function BillingLayout() {
  return <Outlet />
}
