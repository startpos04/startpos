/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import dayjs from '@platform/lib/dayjs'
import { cn } from '@platform/lib/utils'
import type { ColumnHelper } from '@tanstack/react-table'
import { PriceEngine } from '@/lib/conversion/price-engine'

export const invoiceCols = {
  invoiceNumber: (h: ColumnHelper<any>) =>
    h.accessor('number', {
      header: 'Invoice Number',
      cell: info => <span className='font-medium text-sm'>{info.getValue()}</span>,
    }),

  description: (h: ColumnHelper<any>) =>
    h.accessor('description', {
      header: 'Description',
      cell: info => <span className='text-sm text-muted-foreground'>{info.getValue()}</span>,
    }),

  invoiceDate: (h: ColumnHelper<any>) =>
    h.accessor('date', {
      header: 'Date',
      cell: info => {
        const date = new Date(info.getValue())
        return (
          <div className='font-medium text-sm'>
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        )
      },
    }),

  dueDate: (h: ColumnHelper<any>) =>
    h.accessor('dueDate', {
      header: 'Due Date',
      cell: info => {
        const date = new Date(info.getValue())
        return (
          <span className='text-sm'>
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )
      },
    }),

  invoiceStatus: (h: ColumnHelper<any>) =>
    h.accessor('status', {
      header: 'Status',
      cell: info => {
        const status = info.getValue()
        return (
          <div className='flex items-center gap-2'>
            <div className={cn('w-2 h-2 rounded-full', status === 'paid' ? 'bg-emerald-500' : status === 'pending' ? 'bg-amber-500' : 'bg-red-500')} />
            <Badge variant={status === 'paid' ? 'default' : status === 'pending' ? 'secondary' : 'destructive'} className='text-xs capitalize'>
              {status}
            </Badge>
          </div>
        )
      },
    }),

  invoiceAmount: (h: ColumnHelper<any>) =>
    h.accessor('amount', {
      header: 'Amount',
      cell: info => {
        const amount = info.getValue()
        return (
          <div className='text-right'>
            <span className='font-medium'>{PriceEngine.format(amount)}</span>
          </div>
        )
      },
    }),

  downloadAction: (h: ColumnHelper<any>) =>
    h.display({
      id: 'actions',
      header: 'Actions',
      cell: () => (
        <div className='text-right'>
          <Button variant='ghost' size='sm' className='h-7 px-2 text-xs'>
            Download
          </Button>
        </div>
      ),
    }),

  // Billing/Credit History specific columns
  dateWithTime: (h: ColumnHelper<any>) =>
    h.accessor('createdAt', {
      header: 'Date',
      cell: info => {
        const date = new Date(info.getValue())
        return (
          <div>
            <div className='font-medium text-sm'>
              {date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
            <div className='text-xs text-muted-foreground'>
              {date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        )
      },
    }),

  creditEventType: (h: ColumnHelper<any>) =>
    h.accessor('eventType', {
      header: 'Type',
      cell: info => {
        const eventType = info.getValue()
        return (
          <div className='flex items-center gap-2'>
            <div className={cn('w-2 h-2 rounded-full', eventType === 'PURCHASE' ? 'bg-emerald-500' : 'bg-red-500')} />
            <Badge variant={eventType === 'PURCHASE' ? 'default' : 'secondary'} className='text-xs'>
              {eventType === 'PURCHASE' ? 'Purchase' : 'Usage'}
            </Badge>
          </div>
        )
      },
    }),

  creditDescription: (h: ColumnHelper<any>) =>
    h.display({
      id: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const eventType = row.original.eventType
        return (
          <div>
            <p className='text-sm'>{eventType === 'PURCHASE' ? 'Credit package purchased' : 'Credit used for overflow transaction'}</p>
            {row.original.reference && <p className='text-xs text-muted-foreground'>Ref: {row.original.reference}</p>}
          </div>
        )
      },
    }),

  creditAmount: (h: ColumnHelper<any>) =>
    h.accessor('amount', {
      header: 'Amount',
      cell: info => {
        const amount = info.getValue()
        return (
          <div className='text-right'>
            <span className={cn('font-medium', amount > 0 ? 'text-emerald-600' : 'text-red-600')}>
              {amount > 0 ? '+' : ''}
              {amount}
            </span>
          </div>
        )
      },
    }),

  creditBalanceAfter: (h: ColumnHelper<any>) =>
    h.accessor('balanceAfter', {
      header: 'Balance After',
      cell: info => <div className='text-right font-medium'>{info.getValue()}</div>,
    }),
}
