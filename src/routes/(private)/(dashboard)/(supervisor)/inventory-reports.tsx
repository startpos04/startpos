import { getColumns } from '@/components/custom/data-view'
import TableView from '@/components/custom/data-view/table-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Archive, Box, ChevronRight, Download, History, PackageCheck, ShieldAlert, TrendingDown } from 'lucide-react'
import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/inventory-reports')({
  component: InventoryReportComponent,
})

function InventoryReportComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['inventory-report-data-v2'],
    queryFn: async () => {
      const resp = await crudAPI({
        data: {
          action: 'findMany',
          table: 'product',
          args: {
            where: { type: { not: 'SERVICE' } },
            include: {
              category: true,
              inventory: true,
              inventoryMovements: { take: 5, orderBy: { createdAt: 'desc' } },
            },
          },
        },
      })
      return resp
    },
  })

  // --- ANALYTICS CALCULATIONS ---
  const audit = useMemo(() => {
    if (!data) return { totalValue: 0, lowStockCount: 0, expiringSoon: 0, categoryData: [] }

    let value = 0
    let lowStock = 0
    let expiring = 0
    const cats: Record<string, number> = {}

    data.forEach(p => {
      const stock = p.inventory?.reduce((acc: number, curr) => acc + Number(curr.quantity), 0) || 0
      value += stock * Number(p.price)

      if (stock < 15) lowStock++

      if (p.hasExpiry) {
        const hasExpiring = p.inventory?.some(i => i.expiryDate && dayjs(i.expiryDate).isBefore(dayjs().add(30, 'days')))
        if (hasExpiring) expiring++
      }

      const catName = p.category?.name || 'Other'
      cats[catName] = (cats[catName] || 0) + 1
    })

    return {
      totalValue: value,
      lowStockCount: lowStock,
      expiringSoon: expiring,
      categoryData: Object.entries(cats).map(([name, value]) => ({ name, value })),
    }
  }, [data])

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        // ... (Your existing Number, Avatar, and Product columns)
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
            const percentage = Math.min((stock / 100) * 100, 100)
            return (
              <div className='w-32 space-y-1'>
                <div className='flex justify-between text-[10px] font-bold'>
                  <span>{stock} units</span>
                  <span className={stock < 15 ? 'text-destructive' : 'text-emerald-500'}>{stock < 15 ? 'LOW' : 'OK'}</span>
                </div>
                <Progress value={percentage} className={`h-1 ${stock < 15 ? '[&>div]:bg-destructive' : '[&>div]:bg-emerald-500'}`} />
              </div>
            )
          },
        }),
        h.display({
          id: 'valuation',
          header: 'Total Value',
          cell: ({ row }) => {
            const stock = row.original.inventory?.reduce((a, c) => a + Number(c.quantity), 0) || 0
            const val = stock * Number(row.original.price)
            return <span className='font-mono font-semibold'>₱{val.toLocaleString()}</span>
          },
        }),
        h.display({
          id: 'expiry',
          header: 'Health',
          cell: ({ row }) => {
            if (!row.original.hasExpiry)
              return (
                <Badge variant='outline' className='text-[10px] opacity-50'>
                  Steady
                </Badge>
              )
            return (
              <Badge variant='secondary' className='bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]'>
                Perishable
              </Badge>
            )
          },
        }),
        // ... (Your existing Actions column)
      ]),
    [data],
  )

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Inventory Reports</h1>
          <p className='text-muted-foreground text-sm flex items-center gap-2'>
            <PackageCheck className='h-4 w-4 text-emerald-500' />
            Live stock audit for {dayjs().format('MMMM DD, YYYY')}
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm'>
            <History className='mr-2 h-4 w-4' /> Movement Logs
          </Button>
          <Button size='sm'>
            <Download className='mr-2 h-4 w-4' /> Export Audit
          </Button>
        </div>
      </div>

      {/* 2. STATS OVERVIEW GRID */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <InventoryStatCard
          title='Warehouse Value'
          value={`₱${audit.totalValue.toLocaleString()}`}
          sub='Total capital in stock'
          icon={<Archive className='text-blue-500' />}
        />
        <InventoryStatCard
          title='Low Stock Alerts'
          value={audit.lowStockCount}
          sub='Items below threshold'
          icon={<TrendingDown className='text-destructive' />}
          isCritical={audit.lowStockCount > 0}
        />
        <InventoryStatCard title='Expiring Soon' value={audit.expiringSoon} sub='Within 30 days' icon={<ShieldAlert className='text-amber-500' />} />
        <InventoryStatCard title='Active SKUs' value={data?.length || 0} sub='Across all categories' icon={<Box className='text-purple-500' />} />
      </div>

      {/* 3. MAIN CONTENT TABS */}
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

        <TabsContent value='all' className='space-y-4'>
          <div className='grid grid-cols-1 lg:grid-cols-4 gap-4'>
            {/* Table Area */}
            <Card className='lg:col-span-3'>
              <CardContent className='p-0'>
                <TableView data={data} columns={columns} isFetching={isFetching} />
              </CardContent>
            </Card>

            {/* Sidebar Insights */}
            <div className='space-y-4'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm'>Category Mix</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='h-[180px]'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <PieChart>
                        <Pie data={audit.categoryData} innerRadius={40} outerRadius={60} dataKey='value'>
                          {audit.categoryData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className='space-y-1 mt-2'>
                    {audit.categoryData.map((c, i) => (
                      <div key={c.name} className='flex justify-between text-[10px] uppercase font-bold text-muted-foreground'>
                        <span className='flex items-center gap-1'>
                          <div className='w-2 h-2 rounded-full' style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {c.name}
                        </span>
                        <span>{c.value} Items</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className='bg-primary/5 border-primary/10'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-xs font-bold uppercase text-primary'>Quick Audit Tip</CardTitle>
                </CardHeader>
                <CardContent className='text-[11px] text-primary/80'>
                  High value items like "Medical Supplies" should be double-checked against physical batch numbers today.
                  <Button variant='link' size='sm' className='h-auto p-0 text-[11px] mt-2'>
                    Open Audit Wizard <ChevronRight className='h-3 w-3' />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        {/* You can filter data for 'low' and 'expiring' tabs similarly */}
      </Tabs>
    </>
  )
}

function InventoryStatCard({ title, value, sub, icon, isCritical }: any) {
  return (
    <Card className={isCritical ? 'border-destructive/50 bg-destructive/5 shadow-sm' : ''}>
      <CardContent className='pt-6'>
        <div className='flex items-center justify-between'>
          <div className='space-y-1'>
            <p className='text-xs font-medium text-muted-foreground uppercase'>{title}</p>
            <p className='text-2xl font-bold tracking-tight'>{value}</p>
            <p className='text-[10px] text-muted-foreground italic'>{sub}</p>
          </div>
          <div className='h-10 w-10 bg-muted/50 rounded-full flex items-center justify-center'>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
