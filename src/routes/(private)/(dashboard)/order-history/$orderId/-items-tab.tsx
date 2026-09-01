/**
 * Order Items Tab
 * 
 * Displays line items for the order with product details, quantities, and prices
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@startpos-core/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { OrderHistoryItem } from '@/lib/server-fn/fetch-order-history'

interface ItemsTabProps {
  order: OrderHistoryItem
}

export function ItemsTab({ order }: ItemsTabProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='text-xs font-bold'>Product</TableHead>
          <TableHead className='text-xs font-bold text-right'>Qty</TableHead>
          <TableHead className='text-xs font-bold text-right'>Unit Price</TableHead>
          <TableHead className='text-xs font-bold text-right'>Subtotal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {order.items.length > 0 ? (
          order.items.map(item => (
            <TableRow key={item.id}>
              <TableCell className='py-2'>
                <p className='text-xs font-medium leading-tight'>{item.variant?.product?.name ?? '—'}</p>
                {item.variant?.name && <p className='text-[10px] text-muted-foreground font-mono mt-0.5'>{item.variant.name}</p>}
                {item.variant?.sku && <p className='text-[10px] text-muted-foreground font-mono'>SKU: {item.variant.sku}</p>}
                {item.selectedAddons?.map(addon => (
                  <p key={addon.id} className='text-[10px] text-muted-foreground ml-2 mt-0.5'>
                    + {addon.addon?.product?.name} ({addon.quantity}×)
                  </p>
                ))}
              </TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{item.quantity}</TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{PriceEngine.format(item.unitPrice)}</TableCell>
              <TableCell className='text-right font-mono text-xs font-bold py-2'>{PriceEngine.format(Math.round(item.quantity * item.unitPrice))}</TableCell>
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
