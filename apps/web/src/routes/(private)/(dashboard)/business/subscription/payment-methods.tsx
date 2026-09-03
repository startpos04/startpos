/**
 * payment-methods.tsx
 *
 * Payment method selection and management page using the provider registry.
 * Shows available payment providers, their capabilities, and setup status.
 *
 * Following component standards:
 * - Uses custom Tabs component
 * - Uses Table View for provider listings
 * - Uses Mount Manager for dialogs
 * - Uses Sonner for toast notifications
 */

import Tab from '@platform/components/custom/tab'
import { Button } from '@platform/components/ui/button'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { z } from 'zod'
import MountManager from '@platform/lib/mount-manager'
import { OverviewTab } from './payment-methods/-overview-tab'
import { ProvidersTab } from './payment-methods/-providers-tab'

const searchSchema = z.object({
  tab: z.string().optional(),
})

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/payment-methods')({
  validateSearch: searchSchema,
  component: PaymentMethodsPage,
})

function PaymentMethodsPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate()

  const TABS = [
    { label: 'Overview', Component: OverviewTab },
    { label: 'Available Providers', Component: ProvidersTab },
  ] as const

  const VALID_TABS: Set<string> = new Set(TABS.map(t => t.label))
  const defaultValue = tab && VALID_TABS.has(tab) ? tab : 'Overview'

  return (
    <div className='flex flex-col h-full px-4'>
      {/* Page header */}
      <div className='flex-shrink-0 pb-4'>
        <div className='flex items-center gap-3 mb-2'>
          <Button variant='ghost' size='sm' onClick={() => navigate({ to: '/business/subscription' })} className='-ml-2'>
            <ArrowLeftIcon className='mr-2 h-4 w-4' />
            Back to Subscription
          </Button>
        </div>
        <h1 className='text-2xl font-bold tracking-tight'>Payment Methods</h1>
        <p className='text-muted-foreground text-sm mt-0.5'>Manage how you pay for your subscription and services</p>
      </div>

      {/* Tabs with content */}
      <div className='flex-1 min-h-0'>
        <Tab defaultValue={defaultValue} tabs={[...TABS]} className='h-full' />
      </div>

      {/* Mount Manager for dialogs */}
      <MountManager />
    </div>
  )
}
