import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Progress } from '@platform/components/ui/progress'
import dayjs from '@platform/lib/dayjs'
import { TrendingUp } from 'lucide-react'
import type { InventoryData } from '..'

export function InventoryHealth({ inventoryData }: { inventoryData: InventoryData }) {
  const categoryMap: Record<string, number> = {}
  let totalOrgValue = 0

  inventoryData.forEach(product => {
    const productValue = product.variants.reduce((vAcc, v) => vAcc + v.inventory.reduce((iAcc, inv) => iAcc + inv.quantity * inv.costPrice, 0), 0)

    categoryMap[product.category.name as string] = (categoryMap[product.category.name as string] || 0) + productValue
    totalOrgValue += productValue
  })

  const assetAllocation = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, percentage: totalOrgValue > 0 ? (value / totalOrgValue) * 100 : 0 }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3) // Show top 3 categories

  // 3. Calculate Waste Contributors (Last 30 Days)
  const wasteMap: Record<string, number> = {}

  inventoryData.forEach(product => {
    product.variants.forEach(variant => {
      variant.inventoryMovements
        .filter(m => m.type === 'WASTE')
        .forEach(m => {
          // Approximate cost: quantity * variant.costPrice (or m.inventory.costPrice if joined)
          const wasteCost = m.quantity * variant.costPrice
          wasteMap[product.name] = (wasteMap[product.name] || 0) + wasteCost
        })
    })
  })

  const topWaste = Object.entries(wasteMap)
    .map(([name, cost]) => ({ name, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 2)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5' /> Inventory Health
        </CardTitle>
        <CardDescription>Real-time analytics based on current stock.</CardDescription>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* 1. DYNAMIC: Expiring Soon */}
        <div className='rounded-lg border border-rose-100 bg-rose-50/50 p-4 dark:border-rose-900/50 dark:bg-rose-950/30'>
          <h4 className='mb-2 text-sm font-semibold text-rose-900 dark:text-rose-400 uppercase tracking-wider'>Expiring Soon</h4>
          {/* Logic check for any inventory items with expiryDate < 30 days */}
          <p className='text-xs text-rose-700 dark:text-rose-300/80'>
            {inventoryData.some(p => p.variants.some(v => v.inventory.some(i => i.expiryDate && dayjs(i.expiryDate).diff(dayjs(), 'days') < 30)))
              ? 'Items requiring immediate attention found.'
              : 'No items reaching expiry in the next 30 days.'}
          </p>
        </div>

        {/* 2. DYNAMIC: Asset Allocation (Category Mix) */}
        <div className='rounded-lg border border-slate-200 bg-slate-100/50 p-4 dark:border-slate-800 dark:bg-slate-900/50'>
          <h4 className='mb-3 text-sm font-semibold text-slate-900 dark:text-slate-200 uppercase tracking-wider'>Asset Allocation</h4>
          <div className='space-y-3'>
            {assetAllocation.length > 0 ? (
              assetAllocation.map(cat => (
                <div key={cat.name} className='space-y-1'>
                  <div className='flex justify-between text-xs'>
                    <span className='text-muted-foreground'>{cat.name}</span>
                    <span className='font-mono'>{cat.percentage.toFixed(0)}%</span>
                  </div>
                  <Progress value={cat.percentage} className='h-1.5' />
                </div>
              ))
            ) : (
              <p className='text-xs text-muted-foreground'>No data available</p>
            )}
          </div>
        </div>

        {/* 3. DYNAMIC: Top Waste Contributors */}
        <div className='rounded-lg border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30'>
          <h4 className='mb-2 text-sm font-semibold text-amber-900 dark:text-amber-400 uppercase tracking-wider'>Top Waste Contributors</h4>
          <div className='space-y-2'>
            {topWaste.length > 0 ? (
              topWaste.map(item => (
                <div key={item.name} className='flex justify-between text-xs text-amber-800 dark:text-amber-300/90'>
                  <span>{item.name}</span>
                  <span className='font-bold'>₱{(item.cost / 100).toLocaleString()} lost</span>
                </div>
              ))
            ) : (
              <p className='text-xs text-amber-700/70 dark:text-amber-400/70'>No wastage recorded this period.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
