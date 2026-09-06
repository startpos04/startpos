/**
 * Purchase Items Tab
 *
 * Displays the line items for a purchase order
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@platform/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { fePurchase } from '@/lib/queries/fetch-purchases'

interface ItemsTabProps {
  purchase: fePurchase
}

export function ItemsTab({ purchase }: ItemsTabProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='text-xs font-bold'>Product</TableHead>
          <TableHead className='text-xs font-bold text-right'>Qty</TableHead>
          <TableHead className='text-xs font-bold text-right'>Unit Cost</TableHead>
          <TableHead className='text-xs font-bold text-right'>Subtotal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {purchase.items.length > 0 ? (
          // biome-ignore lint/suspicious/noExplicitAny: flexibility required
          purchase.items.map((item: any) => (
            <TableRow key={item.id}>
              <TableCell className='py-2'>
                <p className='text-xs font-medium leading-tight'>{item.product?.name ?? '—'}</p>
                {item.variant?.name && <p className='text-[10px] text-muted-foreground font-mono mt-0.5'>{item.variant.name}</p>}
              </TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>
                {item.quantity}
                {item.unit?.abbreviation && <span className='text-muted-foreground ml-0.5'>{item.unit.abbreviation}</span>}
              </TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{PriceEngine.format(item.unitCost)}</TableCell>
              <TableCell className='text-right font-mono text-xs font-bold py-2'>{PriceEngine.format(Math.round(item.unitCost * item.quantity))}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
              No line items recorded.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
