/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { Clock } from 'lucide-react'
import { Badge } from '@startpos-core/components/ui/badge'
import { cn } from '@startpos-core/lib/utils'
import type { CapabilityStateRow } from '@/lib/server-fn/fetch-capability-states'

export const businessCapabilityCols = {
  name: (h: ColumnHelper<CapabilityStateRow>) =>
    h.accessor('label', {
      header: 'Capability',
      cell: info => {
        const capability = info.row.original
        return <span className='font-medium text-foreground'>{capability.label}</span>
      },
    }),

  description: (h: ColumnHelper<CapabilityStateRow>) =>
    h.accessor('businessValue', {
      header: 'Description',
      cell: info => {
        const value = info.getValue()
        return <span className='text-sm text-muted-foreground'>{value || '—'}</span>
      },
    }),

  state: (h: ColumnHelper<CapabilityStateRow>) =>
    h.accessor('state', {
      header: 'Status',
      cell: info => {
        const state = info.getValue()
        const config: Record<
          string,
          { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }
        > = {
          ENABLED: {
            label: 'Enabled',
            variant: 'default',
            className: 'bg-green-600 hover:bg-green-600 text-white',
          },
          CONFIGURED: {
            label: 'Active',
            variant: 'default',
            className: 'bg-green-700 hover:bg-green-700 text-white',
          },
          RECOMMENDED: {
            label: 'Recommended',
            variant: 'secondary',
            className: 'bg-primary/10 text-primary border-primary/20',
          },
          PAUSED: {
            label: 'Paused',
            variant: 'outline',
            className: '',
          },
          HIDDEN: {
            label: 'Hidden',
            variant: 'outline',
            className: 'text-muted-foreground',
          },
          DEPRECATED: {
            label: 'Deprecated',
            variant: 'destructive',
            className: '',
          },
        }
        const c = config[state] ?? { label: state, variant: 'outline' as const, className: '' }

        return (
          <Badge variant={c.variant} className={cn('text-xs', c.className)}>
            {c.label}
          </Badge>
        )
      },
    }),

  setupTime: (h: ColumnHelper<CapabilityStateRow>) =>
    h.accessor('estimatedSetupMinutes', {
      header: 'Read Time',
      cell: info => {
        const minutes = info.getValue()
        const capability = info.row.original
        const isActive = capability.state === 'ENABLED' || capability.state === 'CONFIGURED'

        if (isActive || minutes === 0) {
          return <span className='text-xs text-muted-foreground'>—</span>
        }

        return (
          <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
            <Clock className='h-3.5 w-3.5' />
            <span>{minutes} min</span>
          </div>
        )
      },
    }),

  category: (h: ColumnHelper<CapabilityStateRow>) =>
    h.accessor('category', {
      header: 'Category',
      cell: info => {
        const category = info.getValue()
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
            {labels[category] || category}
          </Badge>
        )
      },
    }),
}
