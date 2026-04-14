import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowUpRight, DollarSign, Download, PackageCheck, ShoppingCart, Timer, TrendingUp, Users, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { DateRange, DateRangeInput } from '@/components/custom/form/date-rage-input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/sales-reports')({
  validateSearch: (search: Record<string, unknown>): { from?: string | undefined; to?: string | undefined } => ({
    from: (search['from'] as string) || '',
    to: (search['to'] as string) || undefined,
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const { from, to } = useSearch({ from: '/(private)/(dashboard)/(supervisor)/sales-reports' })
  const navigate = useNavigate({ from: Route.fullPath })

  const { data: transactions = [] } = useQuery({
    queryKey: ['sales-reports-comprehensive', from, to],
    queryFn: async () => {
      const dateFilter =
        from || to
          ? {
              createdAt: {
                ...(from ? { gte: dayjs(from).startOf('day').toISOString() } : {}),
                ...(to ? { lte: dayjs(to).endOf('day').toISOString() } : {}),
              },
            }
          : {}

      const result = await crudAPI.transaction('findMany', {
        where: dateFilter,
        include: {
          order: { include: { items: { include: { variant: { include: { product: true } } } } } },
          cashier: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  const handleDateChange = (range: DateRange) => {
    if (!range) return
    navigate({
      search: prev => ({
        ...prev,
        from: range.from ? dayjs(range.from).format('YYYY-MM-DD') : undefined,
        to: range.to ? dayjs(range.to).format('YYYY-MM-DD') : undefined,
      }),
    })
  }

  // --- COMPREHENSIVE DATA PROCESSING ---
  const stats = useMemo(() => {
    // 1. Basic Financials
    const totalRevenue = transactions.reduce((acc, curr) => acc + curr.totalAmount, 0)
    const totalCost = transactions.reduce((acc, curr) => acc + curr.totalCost, 0)
    const grossProfit = totalRevenue - totalCost
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

    // 2. Maps for specific charts
    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {}
    const cashierMap: Record<string, { name: string; total: number; count: number }> = {}

    // Hourly trend (24-hour slots)
    const hourMap = Array.from({ length: 24 }, (_, i) => ({
      time: `${i === 0 ? 12 : i > 12 ? i - 12 : i}${i >= 12 ? 'PM' : 'AM'}`,
      amount: 0,
      hour: i,
    }))

    // Daily trend for Revenue vs Cost Chart
    const dailyMap: Record<string, { date: string; revenue: number; cost: number }> = {}

    transactions.forEach(tx => {
      const dateKey = dayjs(tx.createdAt).format('MMM DD')
      const hour = dayjs(tx.createdAt).hour()

      // Aggregate Daily
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey, revenue: 0, cost: 0 }
      dailyMap[dateKey].revenue += tx.totalAmount / 100
      dailyMap[dateKey].cost += tx.totalCost / 100

      // Aggregate Hourly
      if (hourMap[hour]) hourMap[hour].amount += tx.totalAmount / 100

      // Aggregate Cashier
      if (!cashierMap[tx.cashierId]) {
        cashierMap[tx.cashierId] = { name: tx.cashier.name, total: 0, count: 0 }
      }

      cashierMap[tx.cashierId].total += tx.totalAmount / 100
      cashierMap[tx.cashierId].count += 1

      // Aggregate Products
      tx.order.items.forEach(item => {
        const key = item.variantId
        if (!productMap[key]) {
          productMap[key] = { name: item.variant.product.name, qty: 0, revenue: 0 }
        }
        productMap[key].qty += item.quantity
        productMap[key].revenue += (item.unitPrice * item.quantity) / 100
      })
    })

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      margin,
      chartData: Object.values(dailyMap).reverse(),
      activeHours: hourMap.filter(h => h.hour >= 6 && h.hour <= 23),
      topCashiers: Object.values(cashierMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 4),
      topProducts: Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    }
  }, [transactions])

  const formatCurrency = (cents: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)

  return (
    <div className='flex flex-col gap-3 overflow-auto '>
      {/* HEADER */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 '>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Sales Reports</h1>
          <p className='text-muted-foreground text-sm flex items-center gap-2'>
            <PackageCheck className='h-4 w-4 text-emerald-500' />
            Performance tracking for {dayjs().format('MMMM YYYY')}
          </p>
        </div>
        <div className='flex gap-2'>
          <DateRangeInput
            value={{ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }}
            onChange={handleDateChange}
            placeholder='All time'
          />
          <Button size='sm'>
            <Download /> Export Report
          </Button>
        </div>
      </div>
      <ScrollArea className='flex-1 min-h-0 w-full px-3'>
        <div className='space-y-4 p-1'>
          {/* STAT CARDS */}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>Total Revenue</CardTitle>
                <DollarSign className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{formatCurrency(stats.totalRevenue)}</div>
                <p className='text-[10px] text-muted-foreground'>Gross sales across all channels</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>Gross Profit</CardTitle>
                <TrendingUp className='h-4 w-4 text-emerald-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{formatCurrency(stats.grossProfit)}</div>
                <p className='text-[10px] text-emerald-500 font-medium'>{stats.margin.toFixed(1)}% Avg Margin</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>Total Transactions</CardTitle>
                <ShoppingCart className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{transactions.length}</div>
                <p className='text-[10px] text-muted-foreground'>Total orders processed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>Avg. Ticket Size</CardTitle>
                <ArrowUpRight className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{formatCurrency(transactions.length ? stats.totalRevenue / transactions.length : 0)}</div>
                <p className='text-[10px] text-muted-foreground'>Average revenue per sale</p>
              </CardContent>
            </Card>
          </div>

          {/* REVENUE VS COST TREND */}
          <div className='grid gap-4 md:grid-cols-3'>
            <Card className='md:col-span-2'>
              <CardHeader>
                <CardTitle>Revenue vs Cost Trend</CardTitle>
                <CardDescription>Daily financial performance overview</CardDescription>
              </CardHeader>
              <CardContent className='h-80'>
                {' '}
                {/* Increased height slightly for better visibility */}
                <ResponsiveContainer width='100%' height='100%'>
                  <AreaChart data={stats.chartData}>
                    <defs>
                      <linearGradient id='colorRev' x1='0' y1='0' x2='0' y2='1'>
                        {/* Using emerald-500 equivalent for the gradient */}
                        <stop offset='5%' stopColor='#10b981' stopOpacity={0.3} />
                        <stop offset='95%' stopColor='#10b981' stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    {/* Fix: Use muted-foreground for grid lines so they adapt to dark mode */}
                    <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/30' />

                    <XAxis
                      dataKey='date'
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      className='fill-muted-foreground'
                      tickFormatter={str => dayjs(str).format('MMM DD')}
                    />
                    <YAxis hide />

                    {/* Fix: Integrated Custom Tooltip */}
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className='rounded-lg border border-border bg-background p-3 shadow-xl'>
                              <p className='text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2'>
                                {dayjs(label).format('MMMM DD, YYYY')}
                              </p>
                              <div className='space-y-1.5'>
                                <div className='flex items-center justify-between gap-8'>
                                  <div className='flex items-center gap-2'>
                                    <div className='h-2 w-2 rounded-full bg-emerald-500' />
                                    <span className='text-xs text-muted-foreground'>Revenue</span>
                                  </div>
                                  <span className='text-xs font-bold text-foreground'>₱{payload[0]?.value?.toLocaleString()}</span>
                                </div>
                                <div className='flex items-center justify-between gap-8'>
                                  <div className='flex items-center gap-2'>
                                    <div className='h-2 w-2 rounded-full bg-rose-500' />
                                    <span className='text-xs text-muted-foreground'>Cost</span>
                                  </div>
                                  <span className='text-xs font-bold text-foreground'>₱{payload[1]?.value?.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />

                    <Area type='monotone' dataKey='revenue' stroke='#10b981' fillOpacity={1} fill='url(#colorRev)' strokeWidth={2} name='Revenue' />
                    <Area type='monotone' dataKey='cost' stroke='#ef4444' fill='transparent' strokeDasharray='5 5' strokeWidth={2} name='Cost' />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {/* STAFF PERFORMANCE */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Users className='h-5 w-5 text-purple-500' /> Staff Performance
                </CardTitle>
                <CardDescription>Revenue processed per cashier</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topCashiers.map((cashier, i) => (
                  <div key={i} className='flex items-center gap-4'>
                    <Avatar className='h-10 w-10 border'>
                      <AvatarFallback className='bg-primary/5 text-primary text-xs'>{cashier.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className='flex-1 space-y-1'>
                      <div className='flex items-center justify-between'>
                        <p className='text-sm font-bold'>{cashier.name}</p>
                        <span className='text-xs font-medium'>₱{cashier.total.toLocaleString()}</span>
                      </div>
                      <Progress value={(cashier.total / stats.topCashiers[0]?.total || 0) * 100} className='h-1' />
                      <p className='text-[10px] text-muted-foreground'>{cashier.count} transactions</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 md:grid-cols-3'>
            {/* HOURLY HEATMAP */}
            <Card className='md:col-span-2'>
              <CardHeader className='flex flex-row items-center justify-between'>
                <div>
                  <CardTitle className='flex items-center gap-2'>
                    <Timer className='h-5 w-5 text-blue-500' /> Sales Heatmap
                  </CardTitle>
                  <CardDescription>Hourly revenue distribution</CardDescription>
                </div>
              </CardHeader>
              <CardContent className='h-62.5'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart data={stats.activeHours}>
                    <CartesianGrid strokeDasharray='3 3' vertical={false} className='stroke-muted/30' />
                    <XAxis dataKey='time' fontSize={10} tickLine={false} axisLine={false} className='fill-muted-foreground' />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className='rounded-lg border border-border bg-background p-3 shadow-md ring-1 ring-black/5'>
                              <p className='text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1'>Time: {label}</p>
                              <div className='flex items-center gap-2'>
                                <div className='h-2 w-2 rounded-full bg-primary' />
                                <span className='text-sm font-bold text-foreground'>₱{payload[0]?.value?.toLocaleString()}</span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Bar dataKey='amount' fill='currentColor' className='fill-primary' radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* TOP PRODUCTS */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Zap className='h-5 w-5 text-yellow-500' /> Top Sellers
                </CardTitle>
                <CardDescription>By units sold</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  {stats.topProducts.map((product, i) => (
                    <div key={i} className='flex items-center justify-between'>
                      <div className='space-y-1'>
                        <p className='text-sm font-medium leading-none'>{product.name}</p>
                        <p className='text-xs text-muted-foreground'>{product.qty} units</p>
                      </div>
                      <div className='text-sm font-bold text-emerald-600'>₱{product.revenue.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
