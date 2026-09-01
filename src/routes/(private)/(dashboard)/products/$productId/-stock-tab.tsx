/**
 * Product Stock Tab
 * 
 * Displays inventory levels per variant, batch, and location with expiry tracking
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import dayjs from '@/lib/dayjs'

interface StockTabProps {
  product: any
}

export function StockTab({ product }: StockTabProps) {
  return (
    <div className='space-y-3'>
      {product.variants.map((v: any) => (
        <div key={v.id}>
          {product.variants.length > 1 && <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5'>{v.name || 'Main'}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='text-xs'>Batch</TableHead>
                <TableHead className='text-xs'>Location</TableHead>
                <TableHead className='text-xs text-right'>Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {v.inventory.length > 0 ? (
                v.inventory.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className='font-mono text-[10px] py-2'>{inv.batchNumber || 'N/A'}</TableCell>
                    <TableCell className='text-xs py-2'>{inv.location?.name ?? '—'}</TableCell>
                    <TableCell className='text-right text-xs font-bold py-2'>
                      {inv.quantity} {inv.unit?.abbreviation}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className='text-center py-6 text-xs text-muted-foreground'>
                    No stock
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {v.inventory.length > 0 && (
            <p className='text-[10px] text-muted-foreground mt-1'>
              Expiry tracked:{' '}
              {v.inventory
                .filter((i: any) => i.expiryDate)
                .map((i: any) => dayjs(i.expiryDate).format('MMM DD, YYYY'))
                .join(' · ') || 'None'}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
