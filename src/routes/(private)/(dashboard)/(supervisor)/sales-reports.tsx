import { getColumns } from '@/components/custom/data-view'
import TableView from '@/components/custom/data-view/table-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowDownRight, ArrowUpRight, BarChart3, Calendar, Download, Package, PackageCheck, TrendingUp, UserCheck, Users } from 'lucide-react'
import { useMemo } from 'react'
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/sales-reports')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isFetching } = useQuery({
    queryKey: ['sales-reports-comprehensive'],
    queryFn: async () => {
      const response = await crudAPI({
        data: {
          action: 'findMany',
          table: 'transaction',
          args: {
            include: {
              cashier: true,
              customer: true,
              items: { include: { product: { include: { category: true } } } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
      return response
    },
  })

  // --- ADVANCED DATA AGGREGATION ---
  const reportData = useMemo(() => {
    if (!data) return null

    // 1. Time-based Trend (Last 7 Days)
    const dailySales: Record<string, number> = {}
    // 2. Category Performance
    const categorySales: Record<string, number> = {}
    // 3. Staff Leaderboard
    const staffSales: Record<string, { name: string; total: number; count: number }> = {}

    data.forEach(t => {
      const date = dayjs(t.createdAt).format('MMM DD')
      dailySales[date] = (dailySales[date] || 0) + Number(t.totalAmount)

      const staffName = t.cashier?.name || 'Unknown'
      if (!staffSales[staffName]) staffSales[staffName] = { name: staffName, total: 0, count: 0 }
      staffSales[staffName].total += Number(t.totalAmount)
      staffSales[staffName].count += 1

      t.items?.forEach(item => {
        const catName = item.product?.category?.name || 'Uncategorized'
        categorySales[catName] = (categorySales[catName] || 0) + Number(item.unitPrice) * Number(item.quantity)
      })
    })

    return {
      trend: Object.entries(dailySales)
        .map(([name, total]) => ({ name, total }))
        .reverse(),
      categories: Object.entries(categorySales).map(([name, value]) => ({ name, value })),
      staff: Object.values(staffSales).sort((a, b) => b.total - a.total),
      totals: {
        gross: data.reduce((acc, curr) => acc + Number(curr.totalAmount), 0),
        tax: data.reduce((acc, curr) => acc + Number(curr.taxAmount), 0),
        discount: data.reduce((acc, curr) => acc + Number(curr.discount), 0),
        count: data.length,
      },
    }
  }, [data])

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']

  return (
    <div className='flex flex-col gap-4 px-4  overflow-auto'>
      {/* HEADER */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Sales Reports</h1>
          <p className='text-muted-foreground text-sm flex items-center gap-2'>
            <PackageCheck className='h-4 w-4 text-emerald-500' />
            Performance tracking for {dayjs().format('MMMM YYYY')}
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline'>
            <Calendar className='mr-2 h-4 w-4' /> Filter Date
          </Button>
          <Button>
            <Download className='mr-2 h-4 w-4' /> Export Report
          </Button>
        </div>
      </div>

      {/* 4-COLUMN KPI GRID */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <StatsCard title='Total Revenue' value={reportData?.totals.gross} icon={<TrendingUp className='text-emerald-500' />} trend='+14% vs last month' />
        <StatsCard title='Total Transactions' value={reportData?.totals.count} icon={<Package className='text-blue-500' />} trend='+5.2%' isCurrency={false} />
        <StatsCard title='Tax Collected' value={reportData?.totals.tax} icon={<BarChart3 className='text-purple-500' />} trend='On track' />
        <StatsCard
          title='Avg. Order Value'
          value={reportData?.totals.gross! / (reportData?.totals.count || 1)}
          icon={<Users className='text-orange-500' />}
          trend='-2% vs yesterday'
        />
      </div>

      {/* CHARTS SECTION */}
      <div className='grid gap-4 md:grid-cols-7'>
        {/* Revenue Trend Line Chart */}
        <Card className='md:col-span-4'>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Daily gross sales over the last active period.</CardDescription>
          </CardHeader>
          <CardContent className='h-75'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={reportData?.trend}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='#e5e7eb' />
                <XAxis dataKey='name' fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `₱${v}`} />
                <Tooltip />
                <Line type='monotone' dataKey='total' stroke='#10b981' strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Breakdown Pie Chart */}
        <Card className='md:col-span-3'>
          <CardHeader>
            <CardTitle>Sales by Category</CardTitle>
            <CardDescription>Top revenue contributing categories.</CardDescription>
          </CardHeader>
          <CardContent className='h-75'>
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Pie data={reportData?.categories} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey='value'>
                  {reportData?.categories.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className='grid grid-cols-2 gap-2 mt-4'>
              {reportData?.categories.slice(0, 4).map((c, i) => (
                <div key={c.name} className='flex items-center text-xs'>
                  <div className='w-3 h-3 rounded-full mr-2' style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className='truncate'>{c.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BOTTOM SECTION: TABLE & LEADERBOARD */}
      <div className='grid gap-4 md:grid-cols-3'>
        {/* Transaction Table */}
        <div className='md:col-span-2'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between'>
              <div>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>Recent logs and invoice statuses.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TableView
                data={data}
                columns={getColumns<NonNullable<typeof data>[number]>(h => [
                  h.accessor('invoiceNo', { header: 'Invoice', cell: i => <span className='font-mono text-xs font-bold'>{i.getValue().slice(-6)}</span> }),
                  h.accessor('cashier.name', { header: 'Staff' }),
                  h.accessor('totalAmount', { header: 'Total', cell: i => PriceEngine.format(i.getValue()) }),
                  h.accessor('status', { header: 'Status', cell: i => <Badge variant='secondary'>{i.getValue()}</Badge> }),
                ])}
                isFetching={isFetching}
              />
            </CardContent>
          </Card>
        </div>

        {/* Staff Performance */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UserCheck className='h-5 w-5 text-primary' />
              Staff Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-6'>
            {reportData?.staff.map((s, i) => (
              <div key={s.name} className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <div className='flex h-9 w-9 items-center justify-center rounded-full bg-muted font-bold text-xs'>{i + 1}</div>
                  <div>
                    <p className='text-sm font-medium leading-none'>{s.name}</p>
                    <p className='text-xs text-muted-foreground'>{s.count} sales</p>
                  </div>
                </div>
                <div className='text-sm font-bold'>₱{s.total.toLocaleString()}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Helper Mini-Component
function StatsCard({ title, value, icon, trend, isCurrency = true }: any) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{isCurrency ? `₱${(value || 0).toLocaleString()}` : value}</div>
        <p className='flex items-center text-xs text-muted-foreground mt-1'>
          {trend.includes('+') ? <ArrowUpRight className='mr-1 h-3 w-3 text-emerald-500' /> : <ArrowDownRight className='mr-1 h-3 w-3 text-red-500' />}
          {trend}
        </p>
      </CardContent>
    </Card>
  )
}
