/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { OrderStatus, type OrderType } from 'prisma/generated/prisma/enums'
import { Badge } from '@/components/ui/badge'
import dayjs from '@/lib/dayjs'
import { PriceEngine } from '@/lib/conversion/price-engine'

const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  PREPARING: 'default',
  SERVED: 'secondary',
  CANCELLED: 'destructive',
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Dine In',
  TAKEOUT: 'Takeout',
  DELIVERY: 'Delivery',
}

export const orderCols = {
  orderNumber: (h: ColumnHelper<any>) =>
    h.accessor('orderNumber', {
      header: 'Order No.',
      cell: info => <span className='font-mono text-xs font-bold text-primary'>{info.getValue()}</span>,
    }),

  status: (h: ColumnHelper<any>) =>
    h.accessor('status', {
      header: 'Status',
      maxSize: 110,
      cell: info => (
        <Badge variant={STATUS_VARIANTS[info.getValue() as OrderStatus]} className='text-[10px] capitalize'>
          {info.getValue().toLowerCase()}
        </Badge>
      ),
    }),

  orderType: (h: ColumnHelper<any>) =>
    h.accessor('orderType', {
      header: 'Type',
      maxSize: 100,
      cell: info => (
        <Badge variant='outline' className='text-[10px]'>
          {ORDER_TYPE_LABELS[info.getValue() as OrderType]}
        </Badge>
      ),
    }),

  customerReference: (h: ColumnHelper<any>) =>
    h.accessor('customerReference', {
      header: 'Reference',
      cell: info => <span className='text-sm text-muted-foreground'>{info.getValue() ?? '—'}</span>,
    }),

  itemsCount: (h: ColumnHelper<any>) =>
    h.display({
      id: 'items',
      header: 'Items',
      maxSize: 70,
      cell: ({ row }) => (
        <Badge variant='secondary' className='text-[10px]'>
          {row.original.items?.length ?? 0} line{row.original.items?.length !== 1 ? 's' : ''}
        </Badge>
      ),
    }),

  invoiceNumber: (h: ColumnHelper<any>) =>
    h.display({
      id: 'invoice',
      header: 'Invoice',
      cell: ({ row }) => <span className='font-mono text-xs text-muted-foreground'>{row.original.transaction?.invoiceNo ?? '—'}</span>,
    }),

  transactionTotal: (h: ColumnHelper<any>) =>
    h.display({
      id: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const total = row.original.transaction?.totalAmount
        return total != null ? (
          <span className='font-mono font-bold text-sm'>{PriceEngine.format(total)}</span>
        ) : (
          <span className='text-muted-foreground text-xs'>—</span>
        )
      },
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
