/**
 * business/capabilities â€” Capability lifecycle management page (Phase 3a UI)
 *
 * Shows all capabilities in a table view with a drawer for detailed information.
 * For each capability:
 *   ENABLED/CONFIGURED  â€” click row for details and pause action
 *   RECOMMENDED         â€” click row for enable/dismiss actions
 *   PAUSED              â€” click row for restore action
 *   HIDDEN              â€” visible in the list
 *
 * Data: fetched via fetchCapabilityStates server function on mount.
 * Mutations: acceptCapability / enableCapability / pauseCapability /
 *            restoreCapability / dismissCapability â€” all server functions.
 */

import { getColumns } from '@platform/components/custom/data-view'
import { MultiView } from '@platform/components/custom/data-view/multi-view'
import { RequirePermission } from '@platform/components/custom/guards/require-permission'
import { Card, CardContent } from '@platform/components/ui/card'
import { Skeleton } from '@platform/components/ui/skeleton'
import { Permissions } from '@platform/lib/authorization/permission-keys'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { businessCapabilityCols } from '@/lib/columns/business-capability-columns'
import { tableCols } from '@/lib/columns/table-columns'
import MountManager from '@platform/lib/mount-manager'
import type { CapabilityStateRow } from '@/lib/server-fn/fetch-capability-states'
import { fetchCapabilityStates } from '@/lib/server-fn/fetch-capability-states'
import { BusinessCapabilityDetailsSidebar } from './-components/business-capability-details-sidebar'
import { BUSINESS_CAPABILITY_ASIDE_ID, closeBusinessCapabilitySidebar, showBusinessCapabilitySidebar } from './-components/business-capability-sidebar'

export const Route = createFileRoute('/(private)/(dashboard)/business/capabilities/')({
  component: () => (
    <RequirePermission permission={Permissions.BUSINESS_VIEW_CAPABILITIES}>
      <CapabilitiesPage />
    </RequirePermission>
  ),
})

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CapabilitiesPage() {
  const [selectedId, setSelectedId] = useState<string>('')

  const { data: capabilities, isLoading } = useQuery({
    queryKey: ['capability-states'],
    queryFn: () => fetchCapabilityStates(),
  })

  const caps = capabilities ?? []

  const handleSelectRow = useCallback((capability: CapabilityStateRow) => {
    setSelectedId(capability.capabilityId)
    showBusinessCapabilitySidebar(
      <BusinessCapabilityDetailsSidebar
        capability={capability}
        onClose={() => {
          setSelectedId('')
          closeBusinessCapabilitySidebar()
        }}
      />,
    )
  }, [])

  const columns = useMemo(
    () =>
      getColumns<CapabilityStateRow>(
        h =>
          [
            tableCols.number(h),
            businessCapabilityCols.name(h),
            businessCapabilityCols.description(h),
            businessCapabilityCols.state(h),
            businessCapabilityCols.category(h),
            // biome-ignore lint/suspicious/noExplicitAny: ColumnDef generic type required by library
          ] as ColumnDef<CapabilityStateRow, any>[],
      ),
    [],
  )

  if (isLoading) {
    return (
      <div className='flex flex-col gap-6 p-6'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-96 w-full' />
      </div>
    )
  }

  return (
    <div className='w-full h-full bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full flex flex-col overflow-hidden transition-all duration-300 ease-in-out px-4 space-y-4'>
        {caps.length === 0 ? (
          <div className='flex items-center justify-center h-full'>
            <Card className='max-w-md'>
              <CardContent className='pt-6 text-center'>
                <p className='text-sm font-medium mb-1'>No capabilities found</p>
                <p className='text-xs text-muted-foreground'>There are no capabilities configured for your business at this time.</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <MultiView<CapabilityStateRow>
            label='Capabilities'
            description='Manage which features are active for your business. Click any row to view details and manage its state. Changes take effect immediately across all branches.'
            data={caps}
            isFetching={isLoading}
            views={{
              selectedView: 'table',
              list: [
                {
                  type: 'table',
                  columns,
                  selectableRow: {
                    onClick: handleSelectRow,
                    isSelected: (capability: CapabilityStateRow) => capability.capabilityId === selectedId,
                  },
                },
              ],
            }}
          />
        )}
      </div>

      <MountManager id={BUSINESS_CAPABILITY_ASIDE_ID} />
    </div>
  )
}
