import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, ArrowRightLeft, Calendar, DollarSign, Download, History, PackageCheck, TrendingDown, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/inventory-reports')({
  component: RouteComponent,
})

function RouteComponent() {
  // Fetch products with variants, inventory (batches), and units
  const { data: inventoryData = [] } = useQuery({
    queryKey: ['inventory-reports-detailed'],
    queryFn: async () => {
      const result = await crudAPI.product('findMany', {
        where: { type: { not: 'BUNDLE' } },
        include: {
          category: true,
          baseUnit: true,
          variants: {
            include: {
              inventory: { include: { unit: true } },
              inventoryMovements: {
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: { user: true, unit: true },
              },
            },
          },
        },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  // Calculations for Summary Cards
  const totalValuation = inventoryData.reduce((acc, prod) => {
    return (
      acc +
      prod.variants.reduce((vAcc, variant) => {
        return vAcc + variant.inventory.reduce((iAcc, inv) => iAcc + inv.quantity * inv.costPrice, 0)
      }, 0)
    )
  }, 0)

  const categoryMap: Record<string, number> = {}
  let totalOrgValue = 0

  inventoryData.forEach(product => {
    const productValue = product.variants.reduce((vAcc, v) => vAcc + v.inventory.reduce((iAcc, inv) => iAcc + inv.quantity * inv.costPrice, 0), 0)

    categoryMap[product.category.name] = (categoryMap[product.category.name] || 0) + productValue
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

  // 2. Low Stock Alerts (threshold of 10 units)
  const lowStockCount = inventoryData.filter(p => {
    const totalQty = p.variants.reduce((acc, v) => acc + v.inventory.reduce((iq, i) => iq + i.quantity, 0), 0)
    return totalQty < 10
  }).length

  // 3. Active Batches Count
  const activeBatchesCount = inventoryData.reduce((acc, p) => acc + p.variants.reduce((va, v) => va + v.inventory.length, 0), 0)

  // 4. Waste Rate Calculation (Value of Waste / Value of Total Inflow)
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

  // Calculate percentage (fallback to 0 if no inflow)
  const wasteRate = totalInflowValue > 0 ? (totalWasteValue / totalInflowValue) * 100 : 0

  return (
    <div className='flex flex-col gap-6 overflow-auto py-6'>
      {/* HEADER */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 '>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Inventory Intelligence</h1>
          <p className='text-muted-foreground text-sm flex items-center gap-2'>
            <PackageCheck className='h-4 w-4 text-emerald-500' />
            Organization-wide stock analysis for {dayjs().format('MMMM D, YYYY')}
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm'>
            <Calendar className='mr-2 h-4 w-4' /> Filter Date
          </Button>
          <Button size='sm'>
            <Download className='mr-2 h-4 w-4' /> Export Excel
          </Button>
        </div>
      </div>

      <ScrollArea className='flex-1 min-h-0 w-full px-3'>
        <div className='space-y-4 p-1'>
          {/* TOP STATS */}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Total Stock Value</CardTitle>
                <DollarSign className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400'>
                  ₱{(totalValuation / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <p className='text-xs text-muted-foreground'>Current asset valuation</p>
              </CardContent>
            </Card>

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
          </div>

          {/* MAIN INVENTORY TABLE */}
          <Card>
            <CardHeader>
              <CardTitle>Stock Levels & Valuation</CardTitle>
              <CardDescription>Detailed breakdown of physical goods and raw materials.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Batch Info</TableHead>
                    <TableHead className='text-right'>Asset Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.map(product => {
                    const totalQty = product.variants.reduce((acc, v) => acc + v.inventory.reduce((iq, i) => iq + i.quantity, 0), 0)
                    const assetValue = product.variants.reduce((acc, v) => acc + v.inventory.reduce((iq, i) => iq + i.quantity * i.costPrice, 0), 0)

                    return (
                      <TableRow key={product.id}>
                        <TableCell className='font-medium'>
                          <div className='flex flex-col'>
                            <span>{product.name}</span>
                            <span className='text-xs text-muted-foreground'>{product.category.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant='outline'>{product.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={cn(totalQty < 10 ? 'text-rose-600 font-bold' : '')}>{totalQty.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>{product.baseUnit.abbreviation}</TableCell>
                        <TableCell>
                          <div className='flex gap-1'>
                            {product.hasExpiry && (
                              <Badge variant='secondary' className='text-[10px]'>
                                Exp. Tracking
                              </Badge>
                            )}
                            {product.requiresDeposit && (
                              <Badge variant='secondary' className='text-[10px] bg-blue-50'>
                                Deposit
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className='text-right'>₱{(assetValue / 100).toLocaleString()}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* RECENT MOVEMENTS (AUDIT TRAIL) */}
          <div className='grid gap-6 md:grid-cols-1 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <ArrowRightLeft className='h-5 w-5' />
                  Recent Stock Movements
                </CardTitle>
                <CardDescription>Latest IN/OUT/WASTE transactions across the org.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  {inventoryData
                    .flatMap(p =>
                      p.variants.flatMap(v =>
                        // Enrich the movement object with product details for the UI
                        v.inventoryMovements.map(m => ({ ...m, variant: v, product: p })),
                      ),
                    )
                    .sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt)))
                    .slice(0, 8) // Increased slightly for better visibility
                    .map(m => (
                      <div key={m.id} className='flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0'>
                        <div className='flex flex-col gap-0.5'>
                          {/* PRODUCT & VARIANT NAME */}
                          <span className='text-sm font-semibold text-foreground leading-none'>
                            {m.product.name}
                            {m.variant.name && <span className='ml-1 font-normal text-muted-foreground'>({m.variant.name})</span>}
                          </span>

                          {/* MOVEMENT DETAILS */}
                          <div className='flex items-center gap-2 mt-1'>
                            <span
                              className={cn(
                                'text-xs font-medium',
                                m.type === 'IN' && 'text-emerald-600 dark:text-emerald-400',
                                m.type === 'OUT' && 'text-blue-600 dark:text-blue-400',
                                m.type === 'WASTE' && 'text-rose-600 dark:text-rose-400',
                                m.type === 'ADJUST' && 'text-amber-600 dark:text-amber-400',
                              )}
                            >
                              {m.type === 'IN' ? '+' : '-'}
                              {m.quantity} {m.unit.abbreviation}
                            </span>
                            <span className='text-[10px] text-muted-foreground'>•</span>
                            <span className='text-[10px] text-muted-foreground italic'>{m.reason || 'No reason provided'}</span>
                          </div>

                          {/* METADATA */}
                          <span className='text-[10px] text-muted-foreground/70'>
                            {dayjs(m.createdAt).fromNow()} by {m.user.name}
                          </span>
                        </div>

                        <Badge
                          variant='outline'
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-tight border-transparent',
                            m.type === 'IN' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
                            m.type === 'OUT' && 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
                            m.type === 'WASTE' && 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
                            m.type === 'ADJUST' && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
                            m.type === 'TRANSFER' && 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
                          )}
                        >
                          {m.type}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

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
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
