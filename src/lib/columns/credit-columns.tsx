/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { Badge } from '@startpos-core/components/ui/badge'
import dayjs from '@startpos-core/lib/dayjs'
import { cn } from '@startpos-core/lib/utils'

type EventConfig = { label: string; badgeClass: string }

function getEventConfig(eventType: string): EventConfig {
  switch (eventType) {
    case 'CONSUMED':
      return { label: 'Checkout', badgeClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300' }
    case 'REFUNDED':
      return { label: 'Refund', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300' }
    case 'PURCHASE':
      return { label: 'Purchase', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300' }
    case 'PROMOTIONAL':
      return { label: 'Promotional', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300' }
    case 'ADJUSTMENT':
      return { label: 'Adjustment', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300' }
    case 'EXPIRED':
      return { label: 'Expired', badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400' }
    default:
      return { label: eventType, badgeClass: '' }
  }
}

export const creditCols = {
  eventType: (h: ColumnHelper<any>) =>
    h.accessor('eventType', {
      header: 'Event',
      cell: info => {
        const config = getEventConfig(info.getValue())
        return (
          <Badge variant='outline' className={cn('text-xs', config.badgeClass)}>
            {config.label}
          </Badge>
        )
      },
    }),

  amount: (h: ColumnHelper<any>) =>
    h.accessor('amount', {
      header: 'Amount',
      maxSize: 100,
      cell: info => {
        const v = info.getValue()
        const sign = v >= 0 ? '+' : ''
        return (
          <span className={cn('font-mono font-semibold text-sm tabular-nums', v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
            {sign}
            {v} cr
          </span>
        )
      },
    }),

  balanceAfter: (h: ColumnHelper<any>) =>
    h.accessor('balanceAfter', {
      header: 'Balance after',
      maxSize: 120,
      cell: info => <span className='font-mono text-sm tabular-nums text-muted-foreground'>{info.getValue()} cr</span>,
    }),

  transactionId: (h: ColumnHelper<any>) =>
    h.accessor('transactionId', {
      header: 'Transaction',
      cell: info => {
        const id = info.getValue()
        return id ? (
          <span className='font-mono text-xs text-primary truncate max-w-30 block' title={id}>
            {id.slice(0, 8)}…
          </span>
        ) : (
          <span className='text-muted-foreground text-xs'>—</span>
        )
      },
    }),

  actorName: (h: ColumnHelper<any>) =>
    h.display({
      id: 'cashier',
      header: 'Cashier',
      cell: ({ row }) => <span className='text-sm'>{row.original.actorName ?? '—'}</span>,
    }),

  date: (h: ColumnHelper<any>) =>
    h.accessor('createdAt', {
      header: 'Date',
      cell: info => <span className='text-xs text-muted-foreground'>{dayjs(info.getValue()).format('MMM DD, YYYY HH:mm')}</span>,
    }),
}
