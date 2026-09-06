import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { inventoryCollection, inventoryMovementCollection, productVariantCollection } from '@platform/db/collections'
import { useCapability } from '@platform/hooks/use-capability'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import MountManager from '@platform/lib/mount-manager'
import { cn } from '@platform/lib/utils'
import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertTriangle, Clock, Lock, Package, ShoppingCart, TrendingUp } from 'lucide-react'
import numeral from 'numeral'
import { useMemo } from 'react'
import { authStore } from '@/lib/better-auth/auth-store'
import { FinishedGoodsEngine } from '@/lib/production'
import { fetchBatchPreparedProducts } from '@/lib/queries/fetch-batch-prepared-products'
import { PREPARATION_ASIDE_ID, showPreparationSidebar } from './-components/preparation-sidebar'
import { PrepareProductSidebar } from './-components/prepare-product-sidebar'
import { RecordWasteSidebar } from './-components/record-waste-sidebar'

export const Route = createFileRoute('/(private)/(dashboard)/preparation/')({
  component: RouteComponent,
  beforeLoad: () => {
    const { user } = authStore.state
    if (!user?.entitlement?.capabilities?.includes(Capabilities.MANAGE_INVENTORY)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
})

interface BatchPreparationSummary {
  variantId: string
  productName: string
  variantName: string
  image: string | null
  preparedToday: number
  soldToday: number
  remaining: number
  unit: string
  shelfLifeHours: number | null
  oldestBatchAge: number | null
  isLowStock: boolean
}

function RouteComponent() {
  const user = useStore(authStore, state => state.user)
  const navigate = Route.useNavigate()
  const hasBatchPreparation = useCapability(Capabilities.BATCH_PREPARATION)

  // Fetch batch-prepared products
  const { data: batchPreparedProducts = [] } = fetchBatchPreparedProducts()

  // Fetch inventory
  const { data: _inventory = [] } = useLiveQuery(q => q.from({ inv: inventoryCollection }), [])

  // Fetch inventory movements
  const { data: inventoryMovements = [] } = useLiveQuery(q => q.from({ im: inventoryMovementCollection }), [])

  // Get today's date range
  const startOfToday = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  }, [])

  // Calculate statistics for each batch-prepared product
  const productSummaries: BatchPreparationSummary[] = useMemo(() => {
    return batchPreparedProducts.map(variant => {
      const finishedBatches = FinishedGoodsEngine.getFinishedGoodsBatches(variant.id, user.branch.id, inventoryCollection, productVariantCollection)

      const totalRemaining = finishedBatches.reduce((sum, batch) => sum + batch.quantity, 0)

      // Get movements for today
      const todaysMovements = inventoryMovements.filter(m => m.variantId === variant.id && new Date(m.createdAt) >= startOfToday)

      // Calculate prepared today (PRODUCTION_IN movements)
      const preparedToday = todaysMovements.filter(m => m.type === 'PRODUCTION_IN').reduce((sum, m) => sum + m.quantity, 0)

      // Calculate sold today (OUT movements linked to transactions)
      const soldToday = todaysMovements.filter(m => m.type === 'OUT' && m.transactionId !== null).reduce((sum, m) => sum + m.quantity, 0)

      // Find oldest batch age
      const oldestBatch =
        finishedBatches.length > 0
          ? finishedBatches[finishedBatches.length - 1] // Already sorted oldest first
          : null

      const oldestBatchAge = oldestBatch ? Math.floor((Date.now() - oldestBatch.producedAt.getTime()) / (1000 * 60 * 60)) : null

      // Check low stock
      const lowStockThreshold = variant.lowStockThreshold ?? user.configs.LOW_STOCK_THRESHOLD ?? 10
      const isLowStock = totalRemaining <= lowStockThreshold

      return {
        variantId: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        image: variant.image || variant.product.image,
        preparedToday,
        soldToday,
        remaining: totalRemaining,
        unit: variant.product.baseUnit.abbreviation,
        shelfLifeHours: variant.shelfLifeHours,
        oldestBatchAge,
        isLowStock,
      }
    })
  }, [batchPreparedProducts, inventoryMovements, startOfToday, user.branch.id, user.configs.LOW_STOCK_THRESHOLD])

  // Overall statistics
  const overallStats = useMemo(() => {
    return {
      totalPreparedToday: productSummaries.reduce((sum, p) => sum + p.preparedToday, 0),
      totalSoldToday: productSummaries.reduce((sum, p) => sum + p.soldToday, 0),
      totalRemaining: productSummaries.reduce((sum, p) => sum + p.remaining, 0),
      productsNeedingPreparation: productSummaries.filter(p => p.isLowStock).length,
    }
  }, [productSummaries])

  const handlePrepare = (preSelectedVariantId?: string) => {
    showPreparationSidebar(
      <PrepareProductSidebar key={preSelectedVariantId || 'all'} products={batchPreparedProducts} preSelectedVariantId={preSelectedVariantId} />,
    )
  }

  const handleRecordWaste = (variantId: string) => {
    const summary = productSummaries.find(p => p.variantId === variantId)
    if (!summary) return

    showPreparationSidebar(
      <RecordWasteSidebar
        variantId={variantId}
        productName={`${summary.productName} - ${summary.variantName}`}
        availableQuantity={summary.remaining}
        unit={summary.unit}
      />,
    )
  }

  if (!hasBatchPreparation) {
    return (
      <div className='flex items-center justify-center min-h-[calc(100vh-4rem)] p-4'>
        <Card className='max-w-2xl w-full'>
          <CardHeader>
            <div className='flex items-center gap-3'>
              <div className='p-3 rounded-lg bg-amber-100 dark:bg-amber-950'>
                <Lock className='w-6 h-6 text-amber-600' />
              </div>
              <div>
                <CardTitle>Batch Preparation Feature</CardTitle>
                <CardDescription>This feature is available on Premium and Enterprise plans</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              Batch Preparation helps you prepare items like sandwiches, pastries, or meal prep in batches ahead of time. Track shelf life, manage finished
              goods inventory, and reduce waste with proper FIFO rotation.
            </p>
            <div className='space-y-2'>
              <h4 className='font-semibold text-sm'>Key benefits:</h4>
              <ul className='text-sm text-muted-foreground space-y-1 list-disc list-inside'>
                <li>Prepare products in batches using recipes</li>
                <li>Track shelf life and expiration warnings</li>
                <li>Automatic FIFO inventory rotation</li>
                <li>Record waste with detailed tracking</li>
                <li>Production order history and reporting</li>
              </ul>
            </div>
            <div className='flex gap-2'>
              <Button onClick={() => navigate({ to: '/settings/billing' })} className='flex-1'>
                Upgrade to Premium
              </Button>
              <Button variant='outline' onClick={() => navigate({ to: '/products' })} className='flex-1'>
                Go to Products
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (batchPreparedProducts.length === 0) {
    return (
      <div className='flex items-center justify-center min-h-[calc(100vh-4rem)] p-4'>
        <Card className='max-w-2xl w-full'>
          <CardHeader>
            <CardTitle>No Batch-Prepared Products</CardTitle>
            <CardDescription>
              You don't have any products configured for batch preparation yet. Configure products as "batch-prepared" in the Products page to use this module.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: '/products' })} className='w-full'>
              Go to Products
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50'>
        <div className='flex flex-col gap-6 p-6 w-full overflow-y-auto'>
          {/* Header */}
          <div className='flex items-center justify-between gap-4'>
            <div>
              <h1 className='text-3xl font-bold tracking-tight'>Production & Preparation</h1>
              <p className='text-muted-foreground mt-1 text-sm'>Manage batch preparation and finished goods inventory</p>
            </div>
            <div className='flex gap-2 shrink-0'>
              <Button variant='outline' onClick={() => navigate({ to: '/preparation/history' })}>
                View History
              </Button>
              <Button onClick={handlePrepare} className='gap-2'>
                <Package className='w-4 h-4' />
                Prepare
              </Button>
            </div>
          </div>

          {/* Today's Statistics */}
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Prepared Today</CardTitle>
                <TrendingUp className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{numeral(overallStats.totalPreparedToday).format('0,0')}</div>
                <p className='text-xs text-muted-foreground'>units produced</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Sold Today</CardTitle>
                <ShoppingCart className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{numeral(overallStats.totalSoldToday).format('0,0')}</div>
                <p className='text-xs text-muted-foreground'>units sold</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Remaining</CardTitle>
                <Package className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{numeral(overallStats.totalRemaining).format('0,0')}</div>
                <p className='text-xs text-muted-foreground'>units in stock</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>Low Stock</CardTitle>
                <AlertTriangle className='h-4 w-4 text-orange-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-orange-500'>{overallStats.productsNeedingPreparation}</div>
                <p className='text-xs text-muted-foreground'>products need prep</p>
              </CardContent>
            </Card>
          </div>

          {/* Prepared Products List */}
          <Card>
            <CardHeader>
              <CardTitle>Prepared Products</CardTitle>
              <CardDescription>Current status of batch-prepared inventory</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {productSummaries.map(summary => {
                const isApproachingExpiry = summary.shelfLifeHours && summary.oldestBatchAge ? summary.oldestBatchAge >= summary.shelfLifeHours - 2 : false

                return (
                  <div
                    key={summary.variantId}
                    className={cn(
                      'p-4 rounded-lg border transition-colors',
                      isApproachingExpiry ? 'border-orange-400/40 bg-orange-50/40 dark:bg-orange-950/20' : 'border-border bg-card',
                    )}
                  >
                    <div className='flex items-center gap-4'>
                      {/* Product Image */}
                      <div className='w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0'>
                        {summary.image ? (
                          <img src={summary.image} alt={summary.productName} className='w-full h-full object-cover' />
                        ) : (
                          <div className='w-full h-full flex items-center justify-center'>
                            <Package className='w-8 h-8 text-muted-foreground/40' />
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className='flex-1 min-w-0'>
                        <h3 className='font-semibold text-lg'>
                          {summary.productName}
                          {summary.variantName !== summary.productName && <span className='text-muted-foreground font-normal'> - {summary.variantName}</span>}
                        </h3>

                        <div className='flex items-center gap-6 mt-1 text-sm'>
                          <span>
                            <span className='text-muted-foreground'>Prepared:</span>{' '}
                            <span className='font-medium'>
                              {summary.preparedToday} {summary.unit}
                            </span>
                          </span>
                          <span className='text-muted-foreground'>•</span>
                          <span>
                            <span className='text-muted-foreground'>Sold:</span>{' '}
                            <span className='font-medium'>
                              {summary.soldToday} {summary.unit}
                            </span>
                          </span>
                          <span className='text-muted-foreground'>•</span>
                          <span>
                            <span className='text-muted-foreground'>Remaining:</span>{' '}
                            <span className={cn('font-medium', summary.isLowStock ? 'text-orange-600' : 'text-foreground')}>
                              {summary.remaining} {summary.unit}
                            </span>
                          </span>
                        </div>

                        {/* Warnings */}
                        {(isApproachingExpiry || summary.oldestBatchAge) && (
                          <div className='flex items-center gap-4 mt-2'>
                            {isApproachingExpiry && (
                              <div className='flex items-center gap-1.5 text-orange-600 text-xs'>
                                <AlertTriangle className='w-3.5 h-3.5' />
                                <span>Approaching shelf life ({summary.shelfLifeHours! - summary.oldestBatchAge!}h remaining)</span>
                              </div>
                            )}
                            {summary.oldestBatchAge && !isApproachingExpiry && (
                              <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
                                <Clock className='w-3.5 h-3.5' />
                                <span>Oldest batch: {summary.oldestBatchAge}h ago</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className='flex gap-2 shrink-0'>
                        <Button variant='outline' size='sm' onClick={() => handleRecordWaste(summary.variantId)} disabled={summary.remaining === 0}>
                          Record Waste
                        </Button>
                        {summary.isLowStock && (
                          <Button variant='default' size='sm' onClick={() => handlePrepare(summary.variantId)} className='gap-1.5'>
                            <Package className='w-3.5 h-3.5' />
                            Prepare More
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <MountManager id={PREPARATION_ASIDE_ID} />
    </div>
  )
}
