/**
 * Ingredient Recipes Tab
 *
 * Displays which products use this ingredient and the quantity/cost per recipe
 */

import { Badge } from '@platform/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@platform/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'

interface RecipesTabProps {
  // biome-ignore lint/suspicious/noExplicitAny: flexibility required
  primaryVariant: any
  currentCost: number
  usageCount: number
}

export function RecipesTab({ primaryVariant, currentCost, usageCount }: RecipesTabProps) {
  return (
    <Table>
      <TableHeader className='bg-muted/30'>
        <TableRow>
          <TableHead className='font-bold text-xs'>Host Product</TableHead>
          <TableHead className='font-bold text-right text-xs'>Qty</TableHead>
          <TableHead className='font-bold text-right text-xs'>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        // biome-ignore lint/suspicious/noExplicitAny: flexibility required
        {primaryVariant?.usedIn?.map((usage: any) => (
          <TableRow key={usage.id}>
            <TableCell className='text-sm font-medium py-2'>
              {usage.host.product.name}
              {usage.host.name && (
                <Badge variant='outline' className='ml-1.5 text-[10px] py-0'>
                  {usage.host.name}
                </Badge>
              )}
            </TableCell>
            <TableCell className='text-right font-mono text-xs py-2'>
              {usage.quantityUsed} {usage.unit.abbreviation}
            </TableCell>
            <TableCell className='text-right font-bold font-mono text-xs py-2'>{PriceEngine.format(usage.quantityUsed * currentCost)}</TableCell>
          </TableRow>
        ))}
        {usageCount === 0 && (
          <TableRow>
            <TableCell colSpan={3} className='text-center py-8 text-sm text-muted-foreground'>
              Not used in any recipes yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
