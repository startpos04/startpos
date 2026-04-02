import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'

// UI Components
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle } from 'lucide-react'

// Custom Components
import { getColumns } from '@/components/custom/data-view'
import TableView from '@/components/custom/data-view/table-view'
import { CategoryMixChart } from './-components/category-mix-chart'
import { InventoryHeader } from './-components/inventory-header'
import { InventoryStats } from './-components/inventory-stats'
import { InventoryVelocityChart } from './-components/inventory-velocity-chart'
import { RecentMovements } from './-components/recent-movements'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/inventory-reports/')({
  component: InventoryReportComponent,
})

function InventoryReportComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['inventory-report-data-v3'],
    queryFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'findMany',
          table: 'product',
          args: {
            where: { type: { not: 'SERVICE' } },
            include: {
              category: true,
              inventory: true,
              inventoryMovements: { take: 20, orderBy: { createdAt: 'desc' } },
            },
          },
        },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  // --- DATA PROCESSING ---
  const audit = useMemo(() => {
    if (!data) return { totalValue: 0, lowStockCount: 0, expiringSoon: 0, categoryData: [] }
    let value = 0,
      lowStock = 0,
      expiring = 0
    const cats: Record<string, number> = {}

    data.forEach(p => {
      const stock = p.inventory?.reduce((acc, curr) => acc + Number(curr.quantity), 0) || 0
      value += stock * Number(p.price)
      if (stock < 15) lowStock++
      if (p.hasExpiry && p.inventory?.some(i => i.expiryDate && dayjs(i.expiryDate).isBefore(dayjs().add(30, 'days')))) expiring++
      const catName = p.category?.name || 'Other'
      cats[catName] = (cats[catName] || 0) + 1
    })

    return { totalValue: value, lowStockCount: lowStock, expiringSoon: expiring, categoryData: Object.entries(cats).map(([name, value]) => ({ name, value })) }
  }, [data])

  const velocityData = useMemo(() => {
    const groups: Record<string, any> = {}
    data?.forEach(p =>
      p.inventoryMovements?.forEach(m => {
        const d = dayjs(m.createdAt).format('MMM DD')
        if (!groups[d]) groups[d] = { date: d, incoming: 0, outgoing: 0 }
        const q = Number(m.quantity)
        if (q > 0) groups[d].incoming += q
        else groups[d].outgoing += Math.abs(q)
      }),
    )
    return Object.values(groups).sort((a, b) => dayjs(a.date).unix() - dayjs(b.date).unix())
  }, [data])

  const recentMovements = useMemo(
    () =>
      data
        ?.flatMap(p => p.inventoryMovements)
        .sort((a, b) => dayjs(b.createdAt).unix() - dayjs(a.createdAt).unix())
        .slice(0, 5) || [],
    [data],
  )

  // --- TABLE COLUMNS ---
  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.accessor('name', {
          header: 'Product Item',
          cell: info => (
            <div className='flex items-center gap-3'>
              <Avatar className='h-8 w-8 rounded-lg'>
                <AvatarImage src={info.row.original.image!} />
                <AvatarFallback className='text-[10px]'>{info.row.original.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='font-bold text-sm leading-none'>{info.row.original.name}</span>
                <span className='text-[10px] text-muted-foreground uppercase mt-1'>SKU: {info.row.original.sku || 'N/A'}</span>
              </div>
            </div>
          ),
        }),
        h.display({
          id: 'stock_level',
          header: 'Stock Level',
          cell: ({ row }) => {
            const stock = row.original.inventory?.reduce((a, c) => a + Number(c.quantity), 0) || 0
            return (
              <div className='w-32 space-y-1'>
                <div className='flex justify-between text-[10px] font-bold'>
                  <span>{stock} units</span>
                  <span className={stock < 15 ? 'text-destructive' : 'text-emerald-500'}>{stock < 15 ? 'LOW' : 'OK'}</span>
                </div>
                <Progress value={Math.min((stock / 100) * 100, 100)} className={`h-1 ${stock < 15 ? '[&>div]:bg-destructive' : '[&>div]:bg-emerald-500'}`} />
              </div>
            )
          },
        }),
        h.display({
          id: 'valuation',
          header: 'Total Value',
          cell: ({ row }) => {
            const stock = row.original.inventory?.reduce((a, c) => a + Number(c.quantity), 0) || 0
            return <span className='font-mono font-semibold'>₱{(stock * Number(row.original.price)).toLocaleString()}</span>
          },
        }),
      ]),
    [data],
  )

  return (
    <div className='flex flex-col gap-4 px-4 overflow-auto'>
      <InventoryHeader />
      <InventoryStats audit={audit} productCount={data?.length || 0} />

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <div className='lg:col-span-2'>
          <InventoryVelocityChart data={velocityData} />
        </div>
        <div className='flex flex-col gap-6'>
          <RecentMovements movements={recentMovements} />
          <CategoryMixChart data={audit.categoryData} />
        </div>
      </div>

      <Tabs defaultValue='all' className='w-full'>
        <div className='flex items-center justify-between mb-4'>
          <TabsList className='bg-muted/50 border'>
            <TabsTrigger value='all'>All Inventory</TabsTrigger>
            <TabsTrigger value='low'>Low Stock</TabsTrigger>
            <TabsTrigger value='expiring'>Expiring</TabsTrigger>
          </TabsList>
          <div className='hidden md:flex items-center gap-2 text-xs text-muted-foreground'>
            <AlertTriangle className='h-3 w-3 text-amber-500' />
            Physical counts should be performed weekly.
          </div>
        </div>
        <TabsContent value='all'>
          <div className='flex flex-col h-100 p-0'>
            <TableView data={data} columns={columns} isFetching={isFetching} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
