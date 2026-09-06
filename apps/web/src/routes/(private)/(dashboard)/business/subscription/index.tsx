/**
 * /business/subscription — Subscription & Billing Dashboard
 *
 * Displays subscription status, plan details, invoices, and payment methods
 *
 * Architecture compliance:
 *   - No monetary calculations in the component — uses PlanEngine helpers.
 *   - All subscription data read from authStore.entitlement (already assembled server-side).
 *   - MANAGE_BILLING capability check: this page must remain accessible for all statuses.
 */

import { RequirePermission } from '@platform/components/custom/guards/require-permission'
import Tab from '@platform/components/custom/tab'
import { Permissions } from '@platform/lib/authorization/permission-keys'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { InvoicesTab } from './-invoices-tab'
import { OverviewTab } from './-overview-tab'
import { PaymentMethodsTab } from './-payment-methods-tab'

const searchSchema = z.object({
  tab: z.string().optional(),
})

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/')({
  validateSearch: searchSchema,
  component: () => (
    <RequirePermission permission={Permissions.BUSINESS_VIEW_BILLING}>
      <SubscriptionDashboard />
    </RequirePermission>
  ),
})

function SubscriptionDashboard() {
  const { tab } = Route.useSearch()

  const TABS = [
    { label: 'Overview', Component: OverviewTab },
    { label: 'Invoices', Component: InvoicesTab },
    { label: 'Payment Methods', Component: PaymentMethodsTab },
  ] as const

  const VALID_TABS: Set<string> = new Set(TABS.map(t => t.label))
  const defaultValue = tab && VALID_TABS.has(tab) ? tab : 'Overview'

  return (
    <div className='flex flex-col h-full w-full'>
      {/* Page header */}
      <div className='shrink-0 pb-4 px-4 pt-1'>
        <h1 className='text-2xl font-bold tracking-tight text-foreground'>Subscription Management</h1>
        <p className='text-muted-foreground text-sm mt-0.5'>Manage your subscription plan, usage, and billing details.</p>
      </div>

      {/* Tabs with scrollable content */}
      <div className='flex-1 min-h-0'>
        <Tab defaultValue={defaultValue} tabs={[...TABS]} className='h-full' tabClass='px-4' />
      </div>
    </div>
  )
}
