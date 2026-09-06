/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */

import { Badge } from '@platform/components/ui/badge'
import { Progress } from '@platform/components/ui/progress'
import type { ColumnHelper } from '@tanstack/react-table'
import type { EntitlementDetail } from '@/lib/server-fn/fetch-entitlement-details'

export const capabilityCols = {
  name: (h: ColumnHelper<EntitlementDetail>) =>
    h.accessor('featureLabel', {
      header: 'Capability',
      cell: info => {
        const row = info.row.original
        return (
          <div className='flex flex-col gap-0.5'>
            <span className='font-medium text-foreground'>{row.featureLabel}</span>
            {row.featureDescription && <span className='text-xs text-muted-foreground line-clamp-1'>{row.featureDescription}</span>}
          </div>
        )
      },
    }),

  status: (h: ColumnHelper<EntitlementDetail>) =>
    h.accessor('isEnabledAtBranch', {
      header: 'Status',
      cell: info => {
        const row = info.row.original
        if (!row.isEnabled) {
          return (
            <Badge variant='destructive' className='text-xs'>
              Disabled
            </Badge>
          )
        }
        return (
          <Badge
            variant={row.isEnabledAtBranch ? 'default' : 'outline'}
            className={row.isEnabledAtBranch ? 'bg-green-600 hover:bg-green-600 text-white text-xs' : 'text-muted-foreground text-xs'}
          >
            {row.isEnabledAtBranch ? 'Active' : 'Paused'}
          </Badge>
        )
      },
    }),

  usage: (h: ColumnHelper<EntitlementDetail>) =>
    h.accessor('usageLimit', {
      header: 'Usage',
      cell: info => {
        const row = info.row.original
        if (row.usageLimit === null) {
          return <span className='text-xs text-muted-foreground'>Unlimited</span>
        }
        if (row.currentUsage === null) {
          return (
            <Badge variant='outline' className='text-xs'>
              {row.usageLimit.toLocaleString()} limit
            </Badge>
          )
        }
        const pct = Math.min((row.currentUsage / row.usageLimit) * 100, 100)
        return (
          <div className='flex items-center gap-2 min-w-24'>
            <Progress value={pct} className='h-1.5 flex-1' />
            <span className='text-xs font-medium tabular-nums whitespace-nowrap'>
              {row.currentUsage} / {row.usageLimit}
            </span>
          </div>
        )
      },
    }),

  category: (h: ColumnHelper<EntitlementDetail>) =>
    h.accessor('category', {
      header: 'Category',
      cell: info => {
        const labels: Record<string, string> = {
          SALES: 'Sales',
          INVENTORY: 'Inventory',
          PROCUREMENT: 'Procurement',
          FINANCE: 'Finance',
          OPERATIONS: 'Operations',
          CRM: 'Customers',
          COMPLIANCE: 'Compliance',
          MULTI_BRANCH: 'Multi-branch',
          REPORTING: 'Reports',
          PLATFORM: 'Platform',
        }
        return (
          <Badge variant='outline' className='text-[10px] py-0 h-5'>
            {labels[info.getValue()] ?? info.getValue()}
          </Badge>
        )
      },
    }),
}
