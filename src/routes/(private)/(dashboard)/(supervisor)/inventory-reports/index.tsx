import { and, eq, gte, lte, not, toArray, useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { Download, PackageCheck } from 'lucide-react'
import { type DateRange, DateRangeInput } from '@/components/custom/form/date-rage-input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  categoryCollection,
  inventoryCollection,
  inventoryMovementCollection,
  productCollection,
  productVariantCollection,
  unitCollection,
  userCollection,
} from '@/db/collections'
import dayjs from '@/lib/dayjs'
import { downloadInventoryCsv } from '@/lib/server-fn/download-inventory'
import { downloadCsv } from '@/lib/utils/download-csv'
import { ActiveBatches } from './-components/active-batches'
import { InventoryHealth } from './-components/inventory-health'
import { LowStockAlert } from './-components/low-stock-alert'
import { RecentStockMovements } from './-components/recent-stock-movements'
import { StockLevels } from './-components/stock-levels'
import { TotalStockValue } from './-components/total-stock-value'
import { WasteRate } from './-components/waste-rate'

export const fetchInventoryReports = (from?: string | Date, to?: string | Date) => {
  const result = useLiveQuery(
    q =>
      q
        .from({ product: productCollection })
        .where(({ product }) => not(eq(product.type, 'BUNDLE')))
        .leftJoin({ category: categoryCollection }, ({ product, category }) => eq(product.categoryId, category.id))
        .leftJoin({ baseUnit: unitCollection }, ({ product, baseUnit }) => eq(product.baseUnitId, baseUnit.id))
        .select(({ product, category, baseUnit }) => ({
          ...product,
          category,
          baseUnit,

          variants: toArray(
            q
              .from({ variant: productVariantCollection })
              .where(({ variant }) => eq(variant.productId, product.id))
              .select(({ variant }) => ({
                ...variant,

                // Nested Inventory with Date Filter
                inventory: toArray(
                  q
                    .from({ inv: inventoryCollection })
                    .where(({ inv }) =>
                      and(
                        ...[
                          eq(inv.variantId, variant.id),
                          from ? gte(inv.createdAt, dayjs(from).startOf('day').toDate()) : true,
                          to ? lte(inv.createdAt, dayjs(to).endOf('day').toDate()) : true,
                        ],
                      ),
                    )
                    .leftJoin({ u: unitCollection }, ({ inv, u }) => eq(inv.unitId, u.id))
                    .select(({ inv, u }) => ({
                      ...inv,
                      unit: u,
                    })),
                ),

                // Nested Inventory Movements with Date Filter and Sorting
                inventoryMovements: toArray(
                  q
                    .from({ mov: inventoryMovementCollection })
                    .where(({ mov }) =>
                      and(
                        ...[
                          eq(mov.variantId, variant.id),
                          from ? gte(mov.createdAt, dayjs(from).startOf('day').toDate()) : true,
                          to ? lte(mov.createdAt, dayjs(to).endOf('day').toDate()) : true,
                        ],
                      ),
                    )
                    .orderBy(({ mov }) => [mov.createdAt, 'desc'])
                    .leftJoin({ unit: unitCollection }, ({ mov, unit }) => eq(mov.unitId, unit.id))
                    .leftJoin({ user: userCollection }, ({ mov, user }) => eq(mov.userId, user.id))
                    .select(({ mov, user, unit }) => ({
                      ...mov,
                      user,
                      unit,
                    })),
                ),
              })),
          ),
        })),
    [from, to], // Dependencies: Re-run query when date range changes
  )

  return { ...result, data: result.data.filter(prod => prod.category && prod.baseUnit) }
}

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
