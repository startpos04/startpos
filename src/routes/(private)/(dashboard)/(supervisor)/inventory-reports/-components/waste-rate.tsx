import { TrendingDown } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { InventoryData } from '..'

export function WasteRate({ inventoryData }: { inventoryData: InventoryData }) {
  let totalWasteValue = 0
  let totalInflowValue = 0

  inventoryData.forEach(p => {
    p.variants.forEach(v => {
      v.inventoryMovements.forEach(m => {
        const movementValue = m.quantity * v.costPrice
        if (m.type === 'WASTE') totalWasteValue += movementValue
        if (m.type === 'IN') totalInflowValue += movementValue
      })
    })
  })

  const wasteRate = totalInflowValue > 0 ? (totalWasteValue / totalInflowValue) * 100 : 0

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>Waste Rate</CardTitle>
        <TrendingDown className={cn('h-4 w-4', wasteRate > 5 ? 'text-rose-500' : 'text-emerald-500')} />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{wasteRate.toFixed(1)}%</div>
        <Progress value={wasteRate} max={100} className='h-2 mt-2 bg-slate-100 dark:bg-slate-800 [&>div]:bg-rose-500' />
      </CardContent>
    </Card>
  )
}
