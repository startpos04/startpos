/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { EntitlementDetail } from '@/lib/server-fn/fetch-entitlement-details'

export const capabilityCols = {
  name: (h: ColumnHelper<EntitlementDetail>) =>
    h.accessor('featureLabel', {
      header: 'Capability',
      cell: info => {
        const capability = info.row.original
        return (
          <div className='flex flex-col gap-1'>
            <div className='flex items-center gap-2'>
              <span className='font-semibold text-foreground'>{capability.featureLabel}</span>
              {capability.hasOverride && (
                <Badge variant='outline' className='text-[10px] py-0 h-4'>
                  Override
                </Badge>
              )}
            </div>
            {capability.featureDescription && (
              <span className='text-xs text-muted-foreground line-clamp-2'>{capability.featureDescription}</span>
            )}
          </div>
        )
      },
    }),

  status: (h: ColumnHelper<EntitlementDetail>) =>
    h.accessor('isEnabledAtBranch', {
      header: 'Status',
      cell: info => {
        const isEnabled = info.getValue()
        return (
          <div className='flex items-center gap-2'>
            {isEnabled ? (
              <>
                <div className='w-8 h-8 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center shrink-0'>
                  <CheckCircle className='h-4 w-4 text-green-700 dark:text-green-400' />
                </div>
                <Badge variant='default' className='bg-green-600 hover:bg-green-700'>
                  Enabled
                </Badge>
              </>
            ) : (
              <>
                <div className='w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-950 flex items-center justify-center shrink-0'>
                  <XCircle className='h-4 w-4 text-gray-700 dark:text-gray-400' />
                </div>
                <Badge variant='outline' className='text-gray-700 dark:text-gray-400'>
                  Disabled
                </Badge>
              </>
            )}
          </div>
        )
      },
    }),

  usage: (h: ColumnHelper<EntitlementDetail>) =>
    h.accessor('currentUsage', {
      header: 'Usage',
      cell: info => {
        const capability = info.row.original
        const { currentUsage, usageLimit } = capability

        if (usageLimit === null) {
          return (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Info className='h-4 w-4' />
              <span>Unlimited</span>
            </div>
          )
        }

        const usage = currentUsage ?? 0
        const usagePercentage = (usage / usageLimit) * 100
        const isNearLimit = usagePercentage >= 80
        const isAtLimit = usage >= usageLimit

        return (
          <div className='flex flex-col gap-2 min-w-30'>
            <div className='flex items-center justify-between text-sm'>
              <span className={`font-medium tabular-nums ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-amber-600' : ''}`}>
                {usage} / {usageLimit}
              </span>
            </div>
            <Progress
              value={usagePercentage}
              className={`h-1.5 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-amber-500' : ''}`}
            />
            {isAtLimit && (
              <div className='flex items-center gap-1 text-xs text-destructive'>
                <AlertCircle className='h-3 w-3' />
                <span>Limit reached</span>
              </div>
            )}
            {isNearLimit && !isAtLimit && (
              <div className='flex items-center gap-1 text-xs text-amber-600'>
                <AlertCircle className='h-3 w-3' />
                <span>Near limit</span>
              </div>
            )}
          </div>
        )
      },
    }),

  category: (h: ColumnHelper<EntitlementDetail>) =>
    h.display({
      id: 'category',
      header: 'Type',
      cell: info => {
        const capability = info.row.original
        // Determine if operational based on capability key patterns
        const isOperational = capability.capabilityKey.includes('TRANSACTION') || capability.capabilityKey.includes('INVENTORY')

        return (
          <Badge variant='outline' className='text-[10px] py-0 h-5'>
            {isOperational ? 'Operational' : 'Platform'}
          </Badge>
        )
      },
    }),
}
