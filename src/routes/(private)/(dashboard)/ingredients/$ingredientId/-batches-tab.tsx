/**
 * Ingredient Batches Tab
 * 
 * Displays inventory batches with batch number, stock level, location, and expiry date
 */

import { MapPin } from 'lucide-react'
import { Card, CardContent } from '@startpos-core/components/ui/card'
import dayjs from '@startpos-core/lib/dayjs'
import { cn } from '@startpos-core/lib/utils'

interface BatchesTabProps {
  primaryVariant: any
}

export function BatchesTab({ primaryVariant }: BatchesTabProps) {
  return (
    <div className='space-y-2'>
      {primaryVariant?.inventory?.map((batch: any) => (
        <Card key={batch.id} className='border-border/50 hover:border-primary/30 transition-colors'>
          <CardContent className='p-3'>
            <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Batch #</p>
                <p className='font-mono text-xs font-bold'>{batch.batchNumber || '---'}</p>
              </div>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Stock</p>
                <p className='text-xs font-black text-emerald-600'>
                  {batch.quantity} {batch.unit.abbreviation}
                </p>
              </div>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Location</p>
                <div className='flex items-center gap-1 text-xs'>
                  <MapPin className='w-2.5 h-2.5 text-muted-foreground' />
                  {batch.location?.name}
                </div>
              </div>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Expiry</p>
                <p className={cn('text-xs font-bold', dayjs(batch.expiryDate).isBefore(dayjs()) ? 'text-destructive' : '')}>
                  {batch.expiryDate ? dayjs(batch.expiryDate).format('MMM DD, YYYY') : 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {!primaryVariant?.inventory?.length && <p className='text-center py-8 text-sm text-muted-foreground'>No inventory batches recorded.</p>}
    </div>
  )
}
