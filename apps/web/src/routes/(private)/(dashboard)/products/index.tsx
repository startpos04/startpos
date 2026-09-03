import { getColumns } from '@platform/components/custom/data-view'
import { MultiView } from '@platform/components/custom/data-view/multi-view'
import { WarningPrompt } from '@platform/components/custom/prompt/warning-prompt'
import { Avatar, AvatarFallback, AvatarImage } from '@platform/components/ui/avatar'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Progress } from '@platform/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@platform/components/ui/tooltip'
import { productCollection } from '@platform/db/collections'
import { useCapability } from '@platform/hooks/use-capability'
import { usePOS } from '@platform/hooks/use-pos'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import { cn } from '@platform/lib/utils'
import { createFileRoute, redirect, useSearch } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertCircle, Coffee, Database, Info, Layers, Sparkles, Trash2 } from 'lucide-react'
import numeral from 'numeral'
import { ResourceType } from 'prisma/generated/prisma/enums'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { productCols } from '@/lib/columns/product-columns'
import { tableCols } from '@/lib/columns/table-columns'
import { PosStockEngine } from '@/lib/conversion/pos-stock-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import MountManager from '@platform/lib/mount-manager'
import type { posProduct } from '@/lib/queries/fetch-pos-products'
import { closeProductSidebar, PRODUCT_ASIDE_ID, showProductSidebar } from './-components/product-sidebar'
import { ProductDetailsSidebar } from './$productId'
import { CreateProductSidebar } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/products/')({
  beforeLoad: () => {
    const { user } = authStore.state
    if (!user?.entitlement?.capabilities?.includes(Capabilities.MANAGE_PRODUCTS)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
  validateSearch: (search: Record<string, unknown>) => {
    return {
      view: search['view'] as 'table' | 'grid' | undefined,
      search: search['search'] as string | undefined,
      page: search['page'] as number | undefined,
      pageSize: search['page-size'] as number | undefined,
      // Coerce string 'true'/'false' from URL to boolean
      provisional: search['provisional'] === true || search['provisional'] === 'true' ? true : undefined,
    }
  },
  component: RouteComponent,
})

// ---------------------------------------------------------------------------
// A product is "provisional" (created via Quick Add at the POS) when it has:
//   - type === SERVICE (Quick Add always uses SERVICE until owner changes it)
//   - no SKU on the primary variant
//   - costPrice === 0 on the primary variant
// This matches exactly what QuickAddDialog inserts.
// ---------------------------------------------------------------------------
function isProvisionalProduct(product: posProduct): boolean {
  if (product.type !== ResourceType.SERVICE) return false
  const primary = product.variants?.[0]
  if (!primary) return false
  return !primary.sku && Number(primary.costPrice) === 0
}

function RouteComponent() {
  const { view = 'table', search = '', page = 1, pageSize = 20, provisional = false } = useSearch({ from: '/(private)/(dashboard)/products/' })
  const user = useStore(authStore, state => state.user)
  const { orderItems, posProducts, totalItemsPosProducts, isLoading } = usePOS({ page, pageSize, searchQuery: search, all: true })
  const navigate = Route.useNavigate()
  const [selectedId, setSelectedId] = useState<string>('')
  const hasInventory = useCapability(Capabilities.MANAGE_INVENTORY)

  // Provisional products â€” always computed from the full list, not the paginated slice
  const provisionalProducts = useMemo(() => posProducts.filter(isProvisionalProduct), [posProducts])
  const provisionalCount = provisionalProducts.length

  // When the provisional filter is active, show only provisional products
  const displayedProducts = useMemo(() => (provisional ? posProducts.filter(isProvisionalProduct) : posProducts), [posProducts, provisional])

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showProductSidebar(<CreateProductSidebar />)
  }

  const handleSelectRow = useCallback((product: posProduct) => {
    setSelectedId(product.id)
    showProductSidebar(
      <ProductDetailsSidebar
        open
        productId={product.id}
        onClose={() => {
          setSelectedId('')
          closeProductSidebar()
        }}
      />,
    )
  }, [])

  const handleDelete = async (product: posProduct) => {
    MountManager.show(WarningPrompt, {
      title: 'Delete Product',
      description: 'Are you sure you want to delete this product? This will affect products using this recipe.',
      onConfirm: async () => {
        try {
          productCollection.update(product.id, draft => {
            draft.deletedAt = new Date()
          })

          toast.success('Product archived successfully')
          return true
        } catch (error) {
          console.error('Transaction failed:', error)
          toast.error('Failed to archive product. Please try again.')
        }
        return false
      },
    })
  }

  const handleRestock = useCallback((product: posProduct) => {
    const primaryVariant = product.variants?.[0]
    if (!primaryVariant) return
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO: add explanation
  const columns = useMemo(
    () =>
      getColumns<posProduct>(
        h =>
          [
            tableCols.number(h),
            productCols.image(h),
            // Name column with provisional badge injected
            h.accessor('name', {
              header: 'Product Name',
              cell: info => {
                const product = info.row.original
                const provisional = isProvisionalProduct(product)
                return (
                  <div className='flex items-center gap-2'>
                    <span className='font-semibold text-foreground'>{info.getValue()}</span>
                    {provisional && (
                      <Badge
                        variant='outline'
                        className='text-[9px] uppercase font-bold py-0 h-4 border-amber-400/60 text-amber-600 bg-amber-50/50 dark:bg-amber-950/30 shrink-0'
                      >
                        Needs review
                      </Badge>
                    )}
                  </div>
                )
              },
            }),
            productCols.sku(h),
            productCols.category(h),
            productCols.unit(h),
            ...(hasInventory ? [productCols.ingredients(h)] : []),
            productCols.addons(h),
            productCols.variants(h),
            productCols.cost(h), // Always show cost
            productCols.price(h),
            productCols.netMargin(h), // Always show net margin
            ...(hasInventory ? [productCols.totalValue(h), productCols.stockStatus(h), productCols.stockTotal(h)] : []),
            productCols.showInPOS(h),
            tableCols.action(h, {
              cell: ({ row }) => (
                <div className='flex justify-end gap-1'>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='rounded-full hover:bg-primary/10 hover:text-primary'
                    onClick={e => {
                      e.stopPropagation()
                      handleRestock(row.original)
                    }}
                  >
                    <Database />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='rounded-full text-destructive hover:text-destructive hover:bg-destructive/10'
                    onClick={e => {
                      e.stopPropagation()
                      handleDelete(row.original)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ),
            }),
            // biome-ignore lint/suspicious/noExplicitAny: TODO: fix any
          ] as ColumnDef<posProduct, any>[],
      ),
    [orderItems],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        {/* â”€â”€ Provisional products review banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {provisionalCount > 0 && !provisional && (
          <div className='flex items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-2.5 shrink-0'>
            <div className='flex items-center gap-2.5 min-w-0'>
              <AlertCircle className='w-4 h-4 text-amber-600 shrink-0' />
              <p className='text-sm font-medium text-amber-800 dark:text-amber-300 leading-snug'>
                <span className='font-bold'>
                  {provisionalCount} {provisionalCount === 1 ? 'product needs' : 'products need'} review
                </span>{' '}
                â€” added at the POS without full details. Add a cost price, category, or SKU to complete them.
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              className='shrink-0 border-amber-400/60 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/40 h-7 text-xs font-bold'
              onClick={() => navigate({ search: prev => ({ ...prev, provisional: true }), replace: true })}
            >
              Review now
            </Button>
          </div>
        )}

        {/* â”€â”€ Active provisional filter indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {provisional && (
          <div className='flex items-center gap-2 shrink-0'>
            <Badge variant='outline' className='border-amber-400/60 text-amber-600 bg-amber-50/50 gap-1.5 px-2.5 py-1'>
              <AlertCircle className='w-3 h-3' />
              Showing {provisionalCount} products needing review
            </Badge>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 text-xs text-muted-foreground'
              onClick={() => navigate({ search: prev => ({ ...prev, provisional: undefined }), replace: true })}
            >
              Show all
            </Button>
          </div>
        )}

        <MultiView<posProduct>
          label='Products'
          description='Manage variants, recipes, and profitability.'
          data={displayedProducts}
          isFetching={isLoading}
          creatable={{ label: 'Add Product', href: '/products/create', onAdd: handleAdd }}
          paginable={{
            pageSize,
            pageIndex: page - 1,
            totalItems: provisional ? provisionalCount : totalItemsPosProducts,
            onPaginationChange: next => {
              navigate({ search: prev => ({ ...prev, page: next.pageIndex + 1, 'page-size': next.pageSize }), replace: true })
            },
          }}
          searchable={{
            searchValue: search,
            onSearchChange: search => {
              navigate({ search: prev => ({ ...prev, search }), replace: true })
            },
          }}
          views={{
            onViewChange: view => {
              navigate({ search: prev => ({ ...prev, view }), replace: true })
            },
            selectedView: view,
            list: [
              { type: 'table', columns, selectableRow: { onClick: handleSelectRow, isSelected: (p: posProduct) => p.id === selectedId } },
              {
                type: 'grid',
                renderCard: row => {
                  const product = row.original
                  const primaryVariant = product.variants?.[0]
                  if (!primaryVariant) return null

                  const isProvisional = isProvisionalProduct(product)
                  const maxServings = PosStockEngine.calculateRemainingYield(product, primaryVariant, [], [], orderItems)
                  const recipeComponents = primaryVariant.components?.filter(c => !c.isAddon) || []
                  const addonComponents = primaryVariant.components?.filter(c => c.isAddon) || []

                  const ingredientBreakdown = recipeComponents.map(comp => ({
                    name: comp.material.product.name,
                    qty: comp.quantityUsed,
                    unit: comp.unit.abbreviation,
                    cost: PriceEngine.calculateLineTotal(Number(comp.quantityUsed), comp.unit, Number(comp.material.costPrice)),
                  }))

                  const recipeCostCents = ingredientBreakdown.reduce((sum, item) => sum + item.cost, 0)
                  const finalCostCents = recipeCostCents > 0 ? recipeCostCents : Number(primaryVariant.costPrice)
                  const priceCents = Number(primaryVariant.price)
                  const profitCents = priceCents - finalCostCents
                  const marginPercentage = priceCents > 0 ? profitCents / priceCents : 0

                  // 1. Convert the 1-100 whole number from DB into a decimal fraction
                  const targetMargin = (user.configs.BUFFER_RATE || 30) / 100
                  const isLowMargin = marginPercentage < targetMargin

                  // 2. Determine explicit visual color tiers
                  const isCritical = marginPercentage < 0.1 // Less than 10% profit margin

                  const marginColorClass = isCritical
                    ? 'text-red-500 dark:text-red-400'
                    : isLowMargin
                      ? 'text-amber-500 dark:text-amber-400' // Warning state
                      : 'text-emerald-500 dark:text-emerald-400' // Healthy state

                  const marginBgClass = isCritical ? 'bg-red-500' : isLowMargin ? 'bg-amber-500' : 'bg-emerald-500'

                  const suggestedPriceCents = targetMargin < 1 ? finalCostCents / (1 - targetMargin) : finalCostCents

                  const stockPercentage = Math.min(Math.max((maxServings / 100) * 100, 0), 100)
                  const isLowStock = maxServings < primaryVariant.lowStockThreshold! || user.configs.LOW_STOCK_THRESHOLD

                  return (
                    <Card
                      className={cn(
                        'border-border shadow-sm rounded-4xl overflow-hidden bg-card/50 backdrop-blur-md h-full flex flex-col transition-all hover:shadow-md group pt-0',
                        isProvisional && 'border-amber-400/40',
                      )}
                    >
                      <div className='relative aspect-video w-full overflow-hidden border-b border-border bg-muted'>
                        <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
                          <AvatarImage
                            src={product.image ?? ''}
                            alt={product.name}
                            className='object-cover transition-transform duration-500 group-hover:scale-105'
                          />
                          <AvatarFallback className='rounded-none bg-muted flex items-center justify-center'>
                            <Coffee className='w-10 h-10 text-muted-foreground/20' />
                          </AvatarFallback>
                        </Avatar>

                        <div className='absolute top-4 left-4 flex flex-col gap-2'>
                          {isProvisional ? (
                            <Badge className='rounded-full px-3 shadow-sm backdrop-blur-md bg-amber-500/90 text-white border-none'>Needs review</Badge>
                          ) : hasInventory ? (
                            <Badge
                              variant={maxServings === 0 ? 'destructive' : isLowStock ? 'warning' : 'secondary'}
                              className='rounded-full px-3 shadow-sm backdrop-blur-md bg-background/80 dark:bg-card/80'
                            >
                              {maxServings === 0 ? 'Out of Stock' : `${numeral(maxServings).format('0,0')} in stock`}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <CardHeader className='pb-2'>
                        <div className='flex justify-between items-start'>
                          <CardTitle className='text-lg font-bold line-clamp-1 text-foreground'>{product.name}</CardTitle>
                          <div className='text-right'>
                            <div className='font-bold text-primary'>{PriceEngine.format(priceCents)}</div>
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          <Badge variant='outline' className='text-[9px] uppercase font-bold py-0 h-4 border-border text-muted-foreground'>
                            {product.category?.name || 'General'}
                          </Badge>
                          {primaryVariant?.sku && <span className='text-[10px] text-muted-foreground font-mono uppercase'>{primaryVariant.sku}</span>}
                        </div>
                      </CardHeader>

                      <CardContent className='space-y-4 flex-1 flex flex-col'>
                        {/* Provisional product nudge */}
                        {isProvisional && (
                          <div className='rounded-xl border border-amber-400/30 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2.5 space-y-1.5'>
                            <p className='text-xs font-semibold text-amber-700 dark:text-amber-400'>Complete this product</p>
                            <ul className='text-[11px] text-amber-600/80 dark:text-amber-500/80 space-y-0.5'>
                              {!primaryVariant.sku && <li>â€¢ Add a SKU</li>}
                              {Number(primaryVariant.costPrice) === 0 && <li>â€¢ Set a cost price</li>}
                              {product.type === ResourceType.SERVICE && <li>â€¢ Update product type if needed</li>}
                              {!product.image && <li>â€¢ Add a product image</li>}
                            </ul>
                          </div>
                        )}

                        {/* Availability Bar â€” only when inventory tracking is enabled */}
                        {!isProvisional && hasInventory && (
                          <div className='space-y-1.5'>
                            <div className='flex justify-between text-[10px] font-bold uppercase tracking-tight'>
                              <span className='text-muted-foreground'>Stock Availability</span>
                              <span className={cn(isLowStock ? 'text-destructive' : 'text-primary')}>{maxServings} units</span>
                            </div>
                            <Progress
                              value={stockPercentage}
                              className={cn(
                                'h-1.5 bg-secondary',
                                maxServings === 0 ? '[&>div]:bg-destructive' : isLowStock ? '[&>div]:bg-orange-500' : '[&>div]:bg-primary',
                              )}
                            />
                          </div>
                        )}

                        {/* Profitability Panel */}
                        <div className='p-3.5 rounded-2xl border border-border bg-muted/30 space-y-3'>
                          {/* Header: Margin Status */}
                          <div className='flex justify-between items-start'>
                            <div className='space-y-0.5'>
                              <span className='text-[10px] font-bold uppercase text-muted-foreground tracking-wider block'>Net Profit Margin</span>
                              <div className='flex items-baseline gap-1.5'>
                                {/* USING cn: Dynamic margin color state */}
                                <span className={cn('text-xl font-black tracking-tight', marginColorClass)}>{numeral(marginPercentage).format('0.0%')}</span>
                                <span className='text-[10px] font-medium text-muted-foreground'>
                                  ({isCritical ? 'Critical' : isLowMargin ? 'Low Margin' : 'Healthy'})
                                </span>
                              </div>
                            </div>

                            {/* Suggested Price Tooltip */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className='text-right cursor-help p-1 rounded-md hover:bg-muted transition-colors'>
                                    <span className='text-[9px] font-bold uppercase text-muted-foreground block tracking-wider'>Suggested</span>
                                    <span className='text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5'>
                                      {PriceEngine.format(suggestedPriceCents)} <Info className='w-2.5 h-2.5 text-muted-foreground' />
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className='bg-popover border-border p-3 rounded-xl shadow-xl'>
                                  <p className='text-[11px] font-medium text-popover-foreground'>
                                    To maintain your target <span className='font-bold text-primary'>{numeral(targetMargin).format('0%')}</span> margin
                                    threshold, charge this amount.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          {/* Visual Target Anchor Bar */}
                          <div className='space-y-1'>
                            <div className='relative h-1.5 w-full bg-secondary rounded-full overflow-hidden'>
                              {/* Target Marker Line */}
                              <div className='absolute top-0 bottom-0 w-0.5 bg-foreground/40 z-10' style={{ left: `${targetMargin * 100}%` }} />

                              {/* USING cn: Current Margin Fill Track */}
                              <div
                                className={cn('h-full transition-all duration-500', marginBgClass)}
                                style={{ width: `${Math.min(Math.max(marginPercentage * 100, 0), 100)}%` }}
                              />
                            </div>
                            <div className='relative flex justify-between text-[8px] font-mono text-muted-foreground uppercase font-bold h-3'>
                              <span>0%</span>
                              <span className='absolute -translate-x-1/2 whitespace-nowrap text-foreground/70' style={{ left: `${targetMargin * 100}%` }}>
                                {numeral(targetMargin).format('0%')} Target
                              </span>
                              <span>100%</span>
                            </div>
                          </div>
                        </div>

                        {/* Variants List (Now crucial in the split model) */}
                        {product.variants && product.variants.length > 1 && (
                          <div className='space-y-2 p-2.5 rounded-2xl bg-amber-500/5 border border-amber-500/10'>
                            <h4 className='text-[10px] font-bold uppercase tracking-widest text-amber-600 flex items-center gap-2'>
                              <Layers className='w-3 h-3' /> {product.variants.length} Variants Available
                            </h4>
                            <div className='space-y-1 max-h-24 overflow-y-auto'>
                              {product.variants.map(variant => (
                                <div key={variant.id} className='flex justify-between items-center text-[10px] border-b border-amber-500/5 pb-1'>
                                  <span className='text-foreground/80'>{variant.name}</span>
                                  <span className='font-mono font-bold'>{PriceEngine.format(variant.price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Add-ons Section */}
                        {addonComponents.length > 0 && (
                          <div className='rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 dark:bg-blue-500/10'>
                            <h4 className='mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400'>
                              <Sparkles className='h-3.5 w-3.5' /> Upsell Add-ons
                            </h4>
                            <div className='flex flex-wrap gap-1.5'>
                              {addonComponents.map(comp => (
                                <Badge
                                  key={comp.id}
                                  variant='secondary'
                                  className='rounded-lg border-blue-200/50 bg-background/50 px-2 py-0 text-[10px] font-semibold dark:border-blue-800/30'
                                >
                                  {comp.material.product.name} <span className='ml-1 text-blue-600'>+{PriceEngine.format(comp.priceOverride || 0)}</span>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className='pt-4 mt-auto border-t border-border flex gap-2'>
                          <Button
                            variant={isProvisional ? 'default' : 'outline'}
                            size='sm'
                            className='flex-1 rounded-xl font-bold bg-transparent hover:bg-accent'
                            onClick={() => handleSelectRow(product)}
                          >
                            {isProvisional ? 'Complete setup' : 'View Details'}
                          </Button>
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            onClick={() => handleDelete(product)}
                            className='rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                          >
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                },
              },
            ],
          }}
        />
      </div>

      <MountManager id={PRODUCT_ASIDE_ID} />
    </div>
  )
}
