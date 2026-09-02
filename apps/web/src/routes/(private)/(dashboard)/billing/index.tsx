/**
 * Branch Billing Dashboard - /billing
 *
 * Branch-level credit management interface with two tabs:
 * 1. Overview - Current status and credit packages
 * 2. History - Transaction history table
 */

import Tab from '@platform/components/custom/tab'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import MountManager from '@/lib/mount-manager'
import { HistoryTab } from './-history-tab'
import { OverviewTab } from './-overview-tab'

const searchSchema = z.object({
  tab: z.string().optional(),
})

export const Route = createFileRoute('/(private)/(dashboard)/billing/')({
  validateSearch: searchSchema,
  component: BranchBillingPage,
})

function BranchBillingPage() {
  const { tab } = Route.useSearch()

  const TABS = [
    { label: 'Overview', Component: OverviewTab },
    { label: 'History', Component: HistoryTab },
  ] as const

  const VALID_TABS: Set<string> = new Set(TABS.map(t => t.label))
  const defaultValue = tab && VALID_TABS.has(tab) ? tab : 'Overview'

  return (
    <div className='flex flex-col h-full px-4'>
      {/* Page header - fixed */}
      <div className='flex-shrink-0 pb-4'>
        <h1 className='text-2xl font-bold tracking-tight text-foreground'>Branch Billing</h1>
        <p className='text-muted-foreground text-sm mt-0.5'>Manage your branch's transaction credits and quota settings.</p>
      </div>

      {/* Tabs with scrollable content */}
      <div className='flex-1 min-h-0'>
        <Tab defaultValue={defaultValue} tabs={[...TABS]} className='h-full' />
      </div>

      {/* Mount Manager handles dialogs */}
      <MountManager />
    </div>
  )
}
