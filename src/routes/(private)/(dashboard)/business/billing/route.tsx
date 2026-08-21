/**
 * business/billing/route.tsx
 *
 * Billing layout wrapper — wraps all /business/billing sub-routes.
 * No role-gate is applied here: even EXPIRED admins must be able to access
 * /business/billing to reactivate (Phase 1 compliance gate: MANAGE_BILLING always accessible).
 *
 * Access control is handled by the parent /business route (admin only).
 */

import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)/(dashboard)/business/billing')({
  component: BillingLayout,
})

function BillingLayout() {
  return <Outlet />
}
