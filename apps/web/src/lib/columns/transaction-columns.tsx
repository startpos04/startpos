/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */

import { Badge } from '@platform/components/ui/badge'
import dayjs from '@platform/lib/dayjs'
import type { ColumnHelper } from '@tanstack/react-table'
import type { PaymentMethod, TransactionType } from 'prisma/generated/prisma/enums'
import { PriceEngine } from '@/lib/conversion/price-engine'

const TYPE_LABELS: Record<TransactionType, string> = {
  SALE: 'Sale',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  E_WALLET: 'E-Wallet',
  CARD: 'Card',
  CREDIT: 'Credit',
}

const TYPE_VARIANTS: Record<TransactionType, 'default' | 'destructive' | 'secondary'> = {
  SALE: 'default',
  REFUND: 'destructive',
  ADJUSTMENT: 'secondary',
}

export const transactionCols = {
  invoiceNo: (h: ColumnHelper<any>) =>
    h.accessor('invoiceNo', {
      header: 'Invoice No.',
      cell: info => <span className='font-mono text-xs font-bold text-primary'>{info.getValue()}</span>,
    }),

  type: (h: ColumnHelper<any>) =>
    h.accessor('type', {
      header: 'Type',
      maxSize: 100,
      cell: info => (
        <Badge variant={TYPE_VARIANTS[info.getValue() as TransactionType]} className='text-[10px]'>
          {TYPE_LABELS[info.getValue() as TransactionType]}
        </Badge>
      ),
    }),

  cashier: (h: ColumnHelper<any>) =>
    h.display({
      id: 'cashier',
      header: 'Cashier',
      cell: ({ row }) => <span className='text-sm'>{row.original.cashier?.name ?? '—'}</span>,
    }),

  orderNumber: (h: ColumnHelper<any>) =>
    h.display({
      id: 'order',
      header: 'Order No.',
      cell: ({ row }) => <span className='font-mono text-xs text-muted-foreground'>{row.original.order?.orderNumber ?? '—'}</span>,
    }),

  paymentMethod: (h: ColumnHelper<any>) =>
    h.display({
      id: 'method',
      header: 'Payment',
      cell: ({ row }) => {
        const method = row.original.payments?.[0]?.method
        return method ? (
          <Badge variant='outline' className='text-[10px]'>
            {METHOD_LABELS[method as PaymentMethod] ?? method}
          </Badge>
        ) : (
          <span className='text-muted-foreground text-xs'>—</span>
        )
      },
    }),

  totalAmount: (h: ColumnHelper<any>) =>
    h.accessor('totalAmount', {
      header: 'Total',
      cell: info => (
        <span className={`font-mono font-bold text-sm ${info.row.original.type === 'REFUND' ? 'text-destructive' : ''}`}>
          {PriceEngine.format(info.getValue())}
        </span>
      ),
    }),

  date: (h: ColumnHelper<any>) =>
    h.accessor('createdAt', {
      header: 'Date',
      cell: info => <span className='text-xs text-muted-foreground'>{dayjs(info.getValue()).format('MMM DD, YYYY HH:mm')}</span>,
    }),

  paginatedNumber: (h: ColumnHelper<any>, options: { page: number; pageSize: number }) =>
    h.display({
      id: 'number',
      maxSize: 50,
      header: 'No.',
      cell: info => (
        <span className='text-xs font-mono text-muted-foreground/50'>
          {((options.page - 1) * options.pageSize + info.row.index + 1).toString().padStart(2, '0')}
        </span>
      ),
    }),
}
