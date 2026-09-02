import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import type { InventoryData } from '..'

export function LowStockAlert({ inventoryData }: { inventoryData: InventoryData }) {
  const lowStockCount = inventoryData.filter(p => {
    const totalQty = p.variants.reduce((acc, v) => acc + v.inventory.reduce((iq, i) => iq + i.quantity, 0), 0)
    return totalQty < 10
  }).length

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>Low Stock Alerts</CardTitle>
        <AlertTriangle className='h-4 w-4 text-amber-500' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{lowStockCount}</div>
        <p className='text-xs text-muted-foreground uppercase tracking-tighter'>Items needing restock</p>
      </CardContent>
    </Card>
  )
}
