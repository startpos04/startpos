import { DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { InventoryData } from '..'

export function TotalStockValue({ inventoryData }: { inventoryData: InventoryData }) {
  const totalValuation = inventoryData.reduce((acc, prod) => {
    return (
      acc +
      prod.variants.reduce((vAcc, variant) => {
        return vAcc + variant.inventory.reduce((iAcc, inv) => iAcc + inv.quantity * inv.costPrice, 0)
      }, 0)
    )
  }, 0)

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>Total Stock Value</CardTitle>
        <DollarSign className='h-4 w-4 text-muted-foreground' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>{PriceEngine.format(totalValuation)}</div>
        <p className='text-xs text-muted-foreground'>Current asset valuation</p>
      </CardContent>
    </Card>
  )
}
