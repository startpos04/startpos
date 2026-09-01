import { ArrowRightLeft } from 'lucide-react'
import { MovementType } from 'prisma/generated/prisma/enums'
import { Badge } from '@startpos-core/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import dayjs from '@startpos-core/lib/dayjs'
import { cn } from '@startpos-core/lib/utils'
import type { InventoryData } from '..'

export function RecentStockMovements({ inventoryData }: { inventoryData: InventoryData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <ArrowRightLeft className='h-5 w-5' />
          Recent Stock Movements
        </CardTitle>
        <CardDescription>Latest IN/OUT/WASTE transactions across the org.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {inventoryData
            .flatMap(p =>
              p.variants.flatMap(v =>
                // Enrich the movement object with product details for the UI
                v.inventoryMovements.map(m => ({ ...m, variant: v, product: p })),
              ),
            )
            .sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt)))
            .slice(0, 8) // Increased slightly for better visibility
            .map(m => (
              <div key={m.id} className='flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0'>
                <div className='flex flex-col gap-0.5'>
                  {/* PRODUCT & VARIANT NAME */}
                  <span className='text-sm font-semibold text-foreground leading-none'>
                    {m.product.name}
                    {m.variant.name && <span className='ml-1 font-normal text-muted-foreground'>({m.variant.name})</span>}
                  </span>

                  {/* MOVEMENT DETAILS */}
                  <div className='flex items-center gap-2 mt-1'>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        m.type === 'IN' && 'text-emerald-600 dark:text-emerald-400',
                        m.type === 'OUT' && 'text-blue-600 dark:text-blue-400',
                        m.type === 'WASTE' && 'text-rose-600 dark:text-rose-400',
                        m.type === 'ADJUST' && 'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {m.type === 'IN' ? '+' : '-'}
                      {m.quantity} {m.unit.abbreviation}
                    </span>
                    <span className='text-[10px] text-muted-foreground'>•</span>
                    <span className='text-[10px] text-muted-foreground italic'>{m.reason || 'No reason provided'}</span>
                  </div>

                  {/* METADATA */}
                  <span className='text-[10px] text-muted-foreground/70'>
                    {dayjs(m.createdAt).fromNow()} by {m.user.name}
                  </span>
                </div>

                <Badge
                  variant='outline'
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-tight border-transparent',
                    m.type === MovementType.IN && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
                    m.type === MovementType.OUT && 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
                    m.type === MovementType.WASTE && 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
                    m.type === MovementType.ADJUST && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
                    m.type === MovementType.EXTERNAL_TRANSFER && 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
                    m.type === MovementType.INTERNAL_TRANSFER && 'bg-purple-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
                  )}
                >
                  {m.type}
                </Badge>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}
