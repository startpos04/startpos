/**
 * Order Details Tab
 * 
 * Displays order metadata and linked transaction information
 */

import { Receipt } from 'lucide-react'
import type { OrderStatus, OrderType, PaymentMethod } from 'prisma/generated/prisma/enums'
import { Badge } from '@/components/ui/badge'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { OrderHistoryItem } from '@/lib/server-fn/fetch-order-history'

interface DetailsTabProps {
  order: OrderHistoryItem
}

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

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  E_WALLET: 'E-Wallet',
  CARD: 'Card',
  CREDIT: 'Credit',
}

export function DetailsTab({ order }: DetailsTabProps) {
  const tx = order.transaction

  return (
    <div className='space-y-3'>
      {/* Order meta */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
        <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Order Info</p>
        <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Order Number</p>
            <p className='font-mono text-xs font-bold text-primary'>{order.orderNumber}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Type</p>
            <p className='text-xs font-medium'>{ORDER_TYPE_LABELS[order.orderType]}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Status</p>
            <Badge variant={STATUS_VARIANTS[order.status]} className='text-[10px] capitalize mt-0.5'>
              {order.status.toLowerCase()}
            </Badge>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Date</p>
            <p className='text-xs font-medium'>{dayjs(order.createdAt).format('MMM DD, YYYY HH:mm')}</p>
          </div>
          {order.customerReference && (
            <div className='col-span-2'>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Customer Reference</p>
              <p className='text-xs font-medium'>{order.customerReference}</p>
            </div>
          )}
        </div>
      </div>

      {/* Linked transaction */}
      {tx ? (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <div className='flex items-center gap-1.5'>
            <Receipt className='size-3 text-muted-foreground' />
            <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Transaction</p>
          </div>
          <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Invoice No.</p>
              <p className='font-mono text-xs font-bold text-primary'>{tx.invoiceNo}</p>
            </div>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Cashier</p>
              <p className='text-xs font-medium'>{tx.cashier?.name ?? '—'}</p>
            </div>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total</p>
              <p className='font-mono text-sm font-black text-primary'>{PriceEngine.format(tx.totalAmount)}</p>
            </div>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Payment</p>
              {tx.payments[0]?.method ? (
                <Badge variant='outline' className='text-[10px] mt-0.5'>
                  {METHOD_LABELS[tx.payments[0].method as PaymentMethod] ?? tx.payments[0].method}
                </Badge>
              ) : (
                <span className='text-xs text-muted-foreground'>—</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className='rounded-xl border border-dashed border-border/50 p-4 text-center'>
          <p className='text-xs text-muted-foreground'>No transaction linked to this order.</p>
        </div>
      )}
    </div>
  )
}
