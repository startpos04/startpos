/**
 * Product Variants Tab
 *
 * Displays all variants with their SKUs and prices
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@platform/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'

interface VariantsTabProps {
  product: any
}

export function VariantsTab({ product }: VariantsTabProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='text-xs font-bold'>Variant</TableHead>
          <TableHead className='text-xs font-bold'>SKU</TableHead>
          <TableHead className='text-xs font-bold text-right'>Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {product.variants.map((v: any) => (
          <TableRow key={v.id}>
            <TableCell className='text-xs font-medium py-2'>{v.name || 'Default'}</TableCell>
            <TableCell className='font-mono text-[10px] py-2'>{v.sku || 'â€”'}</TableCell>
            <TableCell className='text-right font-bold text-xs py-2'>{PriceEngine.format(v.price)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
