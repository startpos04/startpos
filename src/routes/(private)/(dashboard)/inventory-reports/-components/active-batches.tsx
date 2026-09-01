import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InventoryData } from '..'

export function ActiveBatches({ inventoryData }: { inventoryData: InventoryData }) {
  const activeBatchesCount = inventoryData.reduce((acc, p) => acc + p.variants.reduce((va, v) => va + v.inventory.length, 0), 0)

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>Active Batches</CardTitle>
        <History className='h-4 w-4 text-muted-foreground' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{activeBatchesCount}</div>
        <p className='text-xs text-muted-foreground'>Tracked expiry/lot groups</p>
      </CardContent>
    </Card>
  )
}
