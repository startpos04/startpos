/**
 * Transaction Payments Tab
 * 
 * Displays payment methods, amounts, and reference information
 */

import { type PaymentMethod } from 'prisma/generated/prisma/enums'
import { Badge } from '@/components/ui/badge'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { TransactionHistoryItem } from '@/lib/server-fn/fetch-transaction-history'

interface PaymentsTabProps {
  transaction: TransactionHistoryItem
}

export function PaymentsTab({ transaction }: PaymentsTabProps) {
  const METHOD_LABELS: Record<PaymentMethod, string> = {
    CASH: 'Cash',
    E_WALLET: 'E-Wallet',
    CARD: 'Card',
    CREDIT: 'Credit',
  }

  return (
    <div className='space-y-3'>
      {transaction.payments.map(payment => (
        <div key={payment.id} className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <div className='flex items-center justify-between'>
            <Badge variant='outline' className='text-[10px]'>
              {METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
            </Badge>
            {payment.platform && <span className='text-[10px] text-muted-foreground'>{payment.platform}</span>}
          </div>
          <div className='grid grid-cols-2 gap-x-4 gap-y-2'>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Amount</p>
              <p className='font-mono text-sm font-black text-primary'>{PriceEngine.format(payment.amount)}</p>
            </div>
            {payment.tendered !== payment.amount && (
              <>
                <div>
                  <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Tendered</p>
                  <p className='font-mono text-sm font-bold'>{PriceEngine.format(payment.tendered)}</p>
                </div>
                <div>
                  <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Change</p>
                  <p className='font-mono text-sm font-bold'>{PriceEngine.format(payment.change)}</p>
                </div>
              </>
            )}
            {payment.referenceNo && (
              <div className='col-span-2'>
                <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Reference</p>
                <p className='font-mono text-xs'>{payment.referenceNo}</p>
              </div>
            )}
          </div>
        </div>
      ))}
      {transaction.payments.length === 0 && <p className='text-center py-8 text-xs text-muted-foreground'>No payment records.</p>}
    </div>
  )
}
