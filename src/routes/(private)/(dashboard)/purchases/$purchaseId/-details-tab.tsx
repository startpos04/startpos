/**
 * Purchase Details Tab
 * 
 * Displays supplier information, purchase metadata, and notes
 */

import { Building2, FileText } from 'lucide-react'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { fePurchase } from '@/lib/queries/fetch-purchases'

interface DetailsTabProps {
  purchase: fePurchase
}

export function DetailsTab({ purchase }: DetailsTabProps) {
  const cleanNotes = purchase.notes?.replace(/^\[(VOIDED|DELETED)\]\s*/i, '') || null

  return (
    <div className='space-y-3'>
      {/* Supplier card */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
        <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Supplier</p>
        {purchase.supplier ? (
          <div className='flex items-start gap-2.5'>
            <div className='h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0'>
              <Building2 className='size-4 text-primary' />
            </div>
            <div>
              <p className='text-sm font-semibold leading-tight'>{purchase.supplier.name}</p>
              {(purchase.supplier as any).contactEmail && <p className='text-[11px] text-muted-foreground mt-0.5'>{(purchase.supplier as any).contactEmail}</p>}
            </div>
          </div>
        ) : (
          <p className='text-xs text-muted-foreground'>No supplier linked.</p>
        )}
      </div>

      {/* Meta grid */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2.5'>
        <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Purchase Info</p>
        <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>PO Number</p>
            <p className='font-mono text-xs font-bold text-primary'>{purchase.purchaseId}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Date</p>
            <p className='text-xs font-medium'>{dayjs(purchase.createdAt).format('MMM DD, YYYY')}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Items</p>
            <p className='text-xs font-bold'>
              {purchase.items.length} line{purchase.items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total Cost</p>
            <p className='font-mono text-xs font-black text-primary'>{PriceEngine.format(purchase.totalCost)}</p>
          </div>
        </div>
      </div>

      {cleanNotes && (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5'>
          <div className='flex items-center gap-1.5'>
            <FileText className='size-3 text-muted-foreground' />
            <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Notes / Reference</p>
          </div>
          <p className='text-xs text-foreground/80 leading-relaxed'>{cleanNotes}</p>
        </div>
      )}
    </div>
  )
}
