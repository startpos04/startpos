/**
 * settings/entitlements — Branch-level feature configuration
 *
 * Shows which capabilities are enabled at the business level with their
 * corresponding entitlement details (usage limits, current usage, etc.)
 */

import { getColumns } from '@platform/components/custom/data-view'
import { MultiView } from '@platform/components/custom/data-view/multi-view'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent } from '@platform/components/ui/card'
import { Progress } from '@platform/components/ui/progress'
import { Skeleton } from '@platform/components/ui/skeleton'
import MountManager from '@platform/lib/mount-manager'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Info, Lock, Settings, TrendingUp } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { capabilityCols } from '@/lib/columns/capability-columns'
import { tableCols } from '@/lib/columns/table-columns'
import type { EntitlementDetail } from '@/lib/server-fn/fetch-entitlement-details'
import { fetchEntitlementDetails } from '@/lib/server-fn/fetch-entitlement-details'
import { CapabilityDetailsSidebar } from './-components/capability-details-sidebar'
import { CAPABILITY_ASIDE_ID, closeCapabilitySidebar, showCapabilitySidebar } from './-components/capability-sidebar'

// @ts-expect-error - Route type generation issue
export const Route = createFileRoute('/(private)/(dashboard)/settings/-entitlements')({
  component: EntitlementsPage,
})

export function EntitlementsPage() {
  const [selectedId, setSelectedId] = useState<string>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['entitlement-details'],
    queryFn: () => fetchEntitlementDetails(),
  })

  const capabilities = useMemo(() => {
    if (!data) return []
    return data.categoryGroups.flatMap(group => group.entitlements)
  }, [data])

  const handleSelectRow = useCallback((capability: EntitlementDetail) => {
    setSelectedId(capability.capabilityKey)
    showCapabilitySidebar(
      <CapabilityDetailsSidebar
        capability={capability}
        onClose={() => {
          setSelectedId('')
          closeCapabilitySidebar()
        }}
      />,
    )
  }, [])

  const columns = useMemo(
    () =>
      getColumns<EntitlementDetail>(
        h =>
          [
            tableCols.number(h),
            capabilityCols.name(h),
            capabilityCols.status(h),
            capabilityCols.usage(h),
            capabilityCols.category(h),
            // biome-ignore lint/suspicious/noExplicitAny: ColumnDef generic type required by library
          ] as ColumnDef<EntitlementDetail, any>[],
      ),
    [],
  )

  if (isLoading) {
    return (
      <div className='flex flex-col gap-6 p-6'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-96 w-full' />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className='flex items-center justify-center h-full p-6'>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-muted-foreground'>Failed to load entitlement information</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { planName, status, billingModel, includedTxPerMonth, txUsedThisPeriod } = data

  return (
    <div className='w-full h-full bg-background flex overflow-hidden relative min-h-0 flex-1 gap-4'>
      <div className='flex-1 min-w-0 h-full flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50'>
        {/* Header */}
        <div className='p-4 border-b bg-background shrink-0'>
          <div className='flex flex-col gap-4'>
            <div>
              <h1 className='text-2xl font-semibold tracking-tight'>Capabilities</h1>
              <p className='text-sm text-muted-foreground mt-1'>
                Manage enabled capabilities for this branch. Click any row to view details and toggle settings.
              </p>
            </div>

            {/* Subscription info */}
            <div className='flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-card'>
              <div className='flex items-center gap-2'>
                <span className='text-xs font-medium text-muted-foreground'>Plan:</span>
                <Badge variant='default'>{planName ?? 'No Plan'}</Badge>
              </div>
              <div className='h-4 w-px bg-border' />
              <div className='flex items-center gap-2'>
                <span className='text-xs font-medium text-muted-foreground'>Status:</span>
                <Badge variant={status === 'ACTIVE' || status === 'TRIAL' ? 'default' : 'destructive'}>{status}</Badge>
              </div>
              <div className='h-4 w-px bg-border' />
              <div className='flex items-center gap-2'>
                <span className='text-xs font-medium text-muted-foreground'>Billing:</span>
                <Badge variant='outline'>{billingModel}</Badge>
              </div>

              {/* Transaction usage */}
              {includedTxPerMonth !== null && includedTxPerMonth !== -1 && (
                <>
                  <div className='h-4 w-px bg-border' />
                  <div className='flex items-center gap-3 flex-1 min-w-50'>
                    <div className='flex items-center gap-2'>
                      <TrendingUp className='h-4 w-4 text-muted-foreground' />
                      <span className='text-xs font-medium text-muted-foreground'>Transactions:</span>
                    </div>
                    <div className='flex-1 flex items-center gap-2'>
                      <Progress value={(txUsedThisPeriod / includedTxPerMonth) * 100} className='h-1.5 flex-1' />
                      <span className='text-xs font-medium tabular-nums whitespace-nowrap'>
                        {txUsedThisPeriod.toLocaleString()} / {includedTxPerMonth.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </>
              )}
              {includedTxPerMonth === -1 && (
                <>
                  <div className='h-4 w-px bg-border' />
                  <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <Info className='h-3.5 w-3.5' />
                    <span>Unlimited transactions</span>
                  </div>
                </>
              )}

              <Button variant='outline' size='sm' asChild className='ml-auto'>
                <a href='/business/subscription'>View Plans</a>
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className='flex-1 min-h-0 overflow-hidden'>
          <MultiView<EntitlementDetail>
            data={capabilities}
            isFetching={isLoading}
            views={{
              selectedView: 'table',
              list: [
                {
                  type: 'table',
                  columns,
                  selectableRow: {
                    onClick: handleSelectRow,
                    isSelected: (capability: EntitlementDetail) => capability.capabilityKey === selectedId,
                  },
                },
              ],
            }}
          />
        </div>

        {/* Footer info cards */}
        <div className='p-4 border-t bg-background shrink-0 space-y-3'>
          <Card className='bg-muted/50 border-0'>
            <CardContent className='pt-3 pb-3'>
              <div className='flex gap-3'>
                <Settings className='h-4 w-4 text-muted-foreground shrink-0 mt-0.5' />
                <div className='text-xs text-muted-foreground'>
                  <p className='font-medium mb-1'>Branch-Level Control</p>
                  <p>Click any capability to view details. Disabled capabilities won't be accessible to users at this branch.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className='border-muted'>
            <CardContent className='pt-3 pb-3'>
              <div className='flex items-center justify-between gap-3'>
                <div className='flex items-center gap-3'>
                  <div className='rounded-full bg-primary/10 p-1.5 shrink-0'>
                    <Lock className='h-4 w-4 text-primary' />
                  </div>
                  <div>
                    <p className='text-xs font-medium'>Need more features or higher limits?</p>
                    <p className='text-xs text-muted-foreground'>Upgrade your plan to unlock additional capabilities</p>
                  </div>
                </div>
                <Button variant='outline' size='sm' asChild>
                  <a href='/business/billing'>View Plans</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <MountManager id={CAPABILITY_ASIDE_ID} />
    </div>
  )
}
