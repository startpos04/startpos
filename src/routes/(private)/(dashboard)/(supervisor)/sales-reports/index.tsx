import { DateRange, DateRangeInput } from '@/components/custom/form/date-rage-input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import dayjs from '@/lib/dayjs'
import { downloadTransactionsCSV } from '@/lib/server-fn/download-tranasctions'
import { downloadCsv } from '@/lib/utils/download-csv'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { Download, PackageCheck } from 'lucide-react'
import { useMemo } from 'react'
import { AverageOrderSize } from './-components/average-order-size'
import { GrossProfit } from './-components/gross-profit'
import { RevenueVsCostTrend } from './-components/revenue-vs-cost-trend'
import { SalesHeatmap } from './-components/sales-heatmap'
import { StaffPerformance } from './-components/staff-performance'
import { TopSellers } from './-components/top-sellers'
import { TotalRevenue } from './-components/total-revenue'
import { TotalTransactions } from './-components/total-transactions'
import { calculateStats } from './-utils/calculate-stats'
import { fetchTransactionReport } from './-utils/fetch-transaction-reports'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/sales-reports/')({
  validateSearch: (search: Record<string, unknown>): { from?: string; to?: string } => {
    const defaultFrom = dayjs().startOf('month').format('YYYY-MM-DD')
    const defaultTo = dayjs().endOf('month').format('YYYY-MM-DD')

    return {
      from: (search['from'] as string) || defaultFrom,
      to: (search['to'] as string) || defaultTo,
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { from, to } = useSearch({ from: '/(private)/(dashboard)/(supervisor)/sales-reports/' })
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: transactions = [] } = fetchTransactionReport(from, to)
  const stats = useMemo(() => calculateStats(transactions), [transactions])

  const handleDateChange = (range: DateRange) => {
    if (!range) return

    navigate({
      search: prev => ({
        ...prev,
        from: range.from ? dayjs(range.from).format('YYYY-MM-DD') : dayjs().startOf('month').format('YYYY-MM-DD'),
        to: range.to ? dayjs(range.to).format('YYYY-MM-DD') : dayjs().endOf('month').format('YYYY-MM-DD'),
      }),
    })
  }

  const handleDownload = async () => {
    try {
      const response = await downloadTransactionsCSV({ data: { from, to } })
      if (!response.data) return

      downloadCsv(response.data, `inventory-report-${Date.now()}.csv`)
    } catch (error) {
      console.error('Failed to download CSV:', error)
    }
  }

  return (
    <div className='flex flex-col gap-3 overflow-auto '>
      {/* HEADER */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 '>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Sales Reports</h1>
          <p className='text-muted-foreground text-sm flex items-center gap-2'>
            <PackageCheck className='h-4 w-4 text-emerald-500' />
            Performance tracking for{' '}
            <span className='font-medium text-foreground'>
              {from && to ? `${dayjs(from).format('MMM D, YYYY')} - ${dayjs(to).format('MMM D, YYYY')}` : dayjs().format('MMMM D, YYYY')}
            </span>
          </p>
        </div>
        <div className='flex gap-2'>
          <DateRangeInput
            value={{ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }}
            onChange={handleDateChange}
            placeholder='All time'
          />
          <Button size='sm' onClick={handleDownload}>
            <Download /> Export Report
          </Button>
        </div>
      </div>
      <ScrollArea className='flex-1 min-h-0 w-full px-3'>
        <div className='space-y-4 p-1'>
          {/* STAT CARDS */}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <TotalRevenue stats={stats} />
            <GrossProfit stats={stats} />
            <TotalTransactions transactions={transactions} />
            <AverageOrderSize transactions={transactions} stats={stats} />
          </div>

          {/* REVENUE VS COST TREND */}
          <div className='grid gap-4 md:grid-cols-3'>
            <RevenueVsCostTrend stats={stats} />
            <StaffPerformance stats={stats} />
          </div>

          <div className='grid gap-4 md:grid-cols-3'>
            <SalesHeatmap stats={stats} />
            <TopSellers stats={stats} />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
