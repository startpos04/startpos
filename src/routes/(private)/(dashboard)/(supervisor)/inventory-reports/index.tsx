import { DateRange, DateRangeInput } from '@/components/custom/form/date-rage-input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import dayjs from '@/lib/dayjs'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { downloadInventoryCsv } from '@/lib/server-fn/download-inventory'
import { downloadCsv } from '@/lib/utils/download-csv'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { Download, PackageCheck } from 'lucide-react'
import { ActiveBatches } from './-components/active-batches'
import { InventoryHealth } from './-components/inventory-health'
import { LowStockAlert } from './-components/low-stock-alert'
import { RecentStockMovements } from './-components/recent-stock-movements'
import { StockLevels } from './-components/stock-levels'
import { TotalStockValue } from './-components/total-stock-value'
import { WasteRate } from './-components/waste-rate'

export const fetchInventoryReports = (from?: string | Date, to?: string | Date) =>
  useQuery({
    queryKey: ['inventory-reports-detailed', from, to],
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

      const result = await crudAPI.product('findMany', {
        where: { type: { not: 'BUNDLE' } },
        include: {
          category: true,
          baseUnit: true,
          variants: {
            include: {
              inventory: {
                where: dateFilter,
                include: { unit: true },
              },
              inventoryMovements: {
                where: dateFilter,
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

export type FetchInventoryReportsReturn = ReturnType<typeof fetchInventoryReports>
export type InventoryData = NonNullable<FetchInventoryReportsReturn['data']>

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/inventory-reports/')({
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
  const { from, to } = useSearch({ from: '/(private)/(dashboard)/(supervisor)/inventory-reports/' })
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: inventoryData = [] } = fetchInventoryReports(from, to)

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
      const response = await downloadInventoryCsv({ data: { from, to } })
      if (!response.data) return

      downloadCsv(response.data, `inventory-report-${Date.now()}.csv`)
    } catch (error) {
      console.error('Failed to download CSV:', error)
    }
  }

  return (
    <div className='flex flex-col gap-6 overflow-auto'>
      {/* HEADER */}
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 '>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Inventory Intelligence</h1>
          <p className='text-muted-foreground text-sm flex items-center gap-2'>
            <PackageCheck className='h-4 w-4 text-emerald-500' />
            Organization-wide stock analysis for{' '}
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
            <Download /> Export Excel
          </Button>
        </div>
      </div>

      <ScrollArea className='flex-1 min-h-0 w-full px-3'>
        <div className='space-y-4 p-1'>
          {/* TOP STATS */}
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <TotalStockValue inventoryData={inventoryData} />
            <LowStockAlert inventoryData={inventoryData} />
            <ActiveBatches inventoryData={inventoryData} />
            <WasteRate inventoryData={inventoryData} />
          </div>

          {/* MAIN INVENTORY TABLE */}

          <StockLevels inventoryData={inventoryData} />

          {/* RECENT MOVEMENTS (AUDIT TRAIL) */}
          <div className='grid gap-6 md:grid-cols-1 lg:grid-cols-2'>
            <RecentStockMovements inventoryData={inventoryData} />
            <InventoryHealth inventoryData={inventoryData} />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
