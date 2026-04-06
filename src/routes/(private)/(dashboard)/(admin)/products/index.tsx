import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PriceEngine } from '@/lib/conversion/price-engine' // ✅ NEW
import { UnitEngine } from '@/lib/conversion/unit-engine'
import { showModal } from '@/lib/overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { authStore } from '@/store/auth-store'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Coffee, Info, Layers, Leaf, Plus, Sparkles, TrendingUp } from 'lucide-react'
import numeral from 'numeral'
import { useMemo } from 'react'
import { ProductDetailsDialog } from './$productId'
import { EditProductDialog } from './$productId/-edit-product'
import { CreateProductDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/')({
  component: RouteComponent,
})

function RouteComponent() {
  const user = useStore(authStore, state => state.user)

  const { data, isFetching } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const result = await crudAPI.product('findMany', {
        where: {
          type: 'BUNDLE',
          variantOfId: null,
        },
        include: {
          category: true,
          baseUnit: true,
          ingredients: {
            include: {
              unit: true,
              material: {
                include: {
                  inventory: { include: { unit: true } },
                  baseUnit: true,
                },
              },
            },
          },
          allowedAddons: { include: { addon: { include: { baseUnit: true } } } },
          variants: { include: { ingredients: true } },
        },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(CreateProductDialog)
  }

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.accessor('name', { header: 'Product' }),
        h.accessor('category.name', { header: 'Category' }),
        h.accessor('price', {
          header: 'Base Price',
          // ✅ Use PriceEngine to handle the Integer-to-String conversion
          cell: info => <span className='font-mono'>{PriceEngine.format(info.getValue())}</span>,
        }),
      ]),
    [data],
  )

  const handleDetail = (e: React.MouseEvent<HTMLAnchorElement>, productId: string) => {
    e.preventDefault()
    showModal(ProductDetailsDialog, {
      productId,
    })
  }

  const handleEdit = (e: React.MouseEvent<HTMLAnchorElement>, product: NonNullable<typeof data>[number]) => {
    e.preventDefault()
    showModal(EditProductDialog, {
      productId: product.id,
      defaultValues: {
        name: product.name,
        sku: product.sku || '',
        price: product.price,
        type: product.type as any,
        categoryId: product.categoryId,
        baseUnitId: product.baseUnitId,
        image: product.image as '',
        isAvailable: product.isAvailable,
        hasExpiry: product.hasExpiry,
        ingredients: product.ingredients,
        variants: product.variants,
        allowedAddons: product.allowedAddons,
      },
    })
  }

  return (
    <>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 px-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Products</h1>
          <p className='text-muted-foreground text-sm'>Manage recipes, profitability, and real-time stock availability.</p>
        </div>
        <a href='/products/create' onClick={handleAdd} className='contents'>
          <Button className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]'>
            <Plus className='h-4 w-4 mr-2' /> Add Product
          </Button>
        </a>
      </div>

      <GridView<NonNullable<typeof data>[number]>
        data={data}
        isFetching={isFetching}
        columns={columns}
        className='px-4'
        renderCard={row => {
          const product = row.original

          // --- LOGIC: Ingredient Costs ---
          const ingredientBreakdown =
            product.ingredients?.map(ing => {
              // ✅ Use PriceEngine to calculate line costs correctly
              const lineCostCents = PriceEngine.calculateLineTotal(Number(ing.quantityUsed || 0), ing.unit, Number(ing.material.costPrice || 0))

              return {
                name: ing.material.name,
                qty: ing.quantityUsed,
                unit: ing.unit.abbreviation,
                cost: lineCostCents,
              }
            }) || []

          const recipeCostCents = ingredientBreakdown.reduce((sum, item) => sum + item.cost, 0)
          const finalCostCents = recipeCostCents > 0 ? recipeCostCents : Number(product.costPrice || 0)

          const priceCents = Number(product.price)
          const profitCents = priceCents - finalCostCents

          // Margin is a ratio, so cents / cents works fine without conversion
          const marginPercentage = priceCents > 0 ? profitCents / priceCents : 0

          // Target Pricing Logic
          const suggestedPriceCents = finalCostCents + PriceEngine.applyRate(finalCostCents, user.branch.bufferRate)

          // --- LOGIC: Availability ---
          const availability = product.ingredients?.map(ing => {
            const qtyNeededInBase = UnitEngine.toBase(Number(ing.quantityUsed || 0), ing.unit)

            const totalStockInBase = ing.material.inventory?.reduce((acc, inv) => acc + UnitEngine.toBase(Number(inv.quantity), inv.unit), 0) ?? 0

            return qtyNeededInBase > 0 ? Math.floor(totalStockInBase / qtyNeededInBase) : 0
          })

          const maxServings = availability?.length ? Math.min(...availability) : 0
          const stockPercentage = Math.min(Math.max((maxServings / 100) * 100, 0), 100)
          const isLowStock = maxServings < 10
          const isLowMargin = marginPercentage < 0.3

          return (
            <Card className='border-border shadow-sm rounded-[2rem] overflow-hidden bg-card/50 backdrop-blur-md h-full flex flex-col transition-all hover:shadow-md group pt-0'>
              <div className='relative aspect-video w-full overflow-hidden border-b border-border bg-muted'>
                <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
                  <AvatarImage src={product.image ?? ''} alt={product.name} className='object-cover transition-transform duration-500 group-hover:scale-105' />
                  <AvatarFallback className='rounded-none bg-muted flex items-center justify-center'>
                    <Coffee className='w-10 h-10 text-muted-foreground/20' />
                  </AvatarFallback>
                </Avatar>

                <div className='absolute top-4 left-4 flex flex-col gap-2'>
                  <Badge
                    variant={maxServings === 0 ? 'destructive' : isLowStock ? 'warning' : 'secondary'}
                    className='rounded-full px-3 shadow-sm backdrop-blur-md bg-background/80 dark:bg-card/80'
                  >
                    {maxServings === 0 ? 'Out of Stock' : `${maxServings} Servings Left`}
                  </Badge>
                </div>
              </div>

              <CardHeader className='pb-2'>
                <div className='flex justify-between items-start'>
                  <CardTitle className='text-xl font-bold line-clamp-1 text-foreground'>{product.name}</CardTitle>
                  <div className='text-right'>
                    <div className='font-bold text-primary text-lg'>{PriceEngine.format(product.price)}</div>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <Badge variant='outline' className='text-[9px] uppercase font-bold py-0 h-4 border-border text-muted-foreground'>
                    {product.category?.name || 'General'}
                  </Badge>
                  <span className='text-[10px] text-muted-foreground font-mono uppercase'>{product.sku}</span>
                </div>
              </CardHeader>

              <CardContent className='space-y-4 flex-1 flex flex-col'>
                {/* Availability Bar */}
                <div className='space-y-1.5'>
                  <div className='flex justify-between text-[10px] font-bold uppercase tracking-tight'>
                    <span className='text-muted-foreground'>Stock Availability</span>
                    <span className={isLowStock ? 'text-destructive' : 'text-primary'}>{maxServings} units</span>
                  </div>
                  <Progress
                    value={stockPercentage}
                    className={`h-1.5 bg-secondary ${maxServings === 0 ? '[&>div]:bg-destructive' : isLowStock ? '[&>div]:bg-orange-500' : '[&>div]:bg-primary'}`}
                  />
                </div>

                {/* Profitability Panel */}
                <div
                  className={`p-3 rounded-2xl border transition-colors ${
                    isLowMargin ? 'bg-orange-500/10 border-orange-500/20' : 'bg-primary/10 border-primary/20'
                  }`}
                >
                  <div className='flex justify-between items-end'>
                    <div className='space-y-0.5'>
                      <span className='text-[9px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1'>
                        <TrendingUp className={`w-2.5 h-2.5 ${isLowMargin ? 'text-orange-500' : 'text-primary'}`} />
                        Margin {recipeCostCents > 0 ? '(Calculated)' : '(Fixed)'}
                      </span>
                      <span className={`text-sm font-black ${isLowMargin ? 'text-orange-500 dark:text-orange-400' : 'text-primary'}`}>
                        {numeral(marginPercentage).format('0.0%')}
                      </span>
                    </div>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className='text-right cursor-help'>
                            <span className='text-[9px] font-bold uppercase text-muted-foreground block tracking-wider'>Suggested Price</span>
                            <span className='text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1'>
                              {PriceEngine.format(suggestedPriceCents)} <Info className='w-2.5 h-2.5' />
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className='bg-popover border-border p-3 rounded-xl shadow-xl'>
                          <p className='text-[11px] font-medium text-popover-foreground'>
                            To maintain a <span className='font-bold text-primary'>{numeral(user.branch.bufferRate).format('0.0')}%</span>, charge at least this
                            amount.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Ingredient Cost Breakdown */}
                {ingredientBreakdown.length > 0 && (
                  <div className='space-y-2'>
                    <h4 className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-between'>
                      <span className='flex items-center gap-2'>
                        <Leaf className='w-3 h-3 text-emerald-500 dark:text-emerald-400' /> Cost Breakdown
                      </span>
                      <span className='font-mono text-foreground'>Total: {PriceEngine.format(finalCostCents)}</span>
                    </h4>
                    <div className='grid grid-cols-1 gap-1.5'>
                      {ingredientBreakdown.map((item, idx) => (
                        <div key={idx} className='flex justify-between items-center bg-muted/40 p-2 rounded-lg border border-border/50'>
                          <div className='flex flex-col'>
                            <span className='text-[11px] font-bold text-foreground'>{item.name}</span>
                            <span className='text-[9px] text-muted-foreground'>
                              {item.qty} {item.unit} used
                            </span>
                          </div>
                          <span className='text-[10px] font-mono font-bold text-primary'>+{PriceEngine.format(item.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Variants Section */}
                {product.variants && product.variants.length > 0 && (
                  <div className='space-y-2 p-2.5 rounded-2xl bg-amber-500/5 border border-amber-500/10'>
                    <h4 className='text-[10px] font-bold uppercase tracking-widest text-amber-600 flex items-center gap-2'>
                      <Layers className='w-3 h-3' /> Available Variants
                    </h4>
                    <div className='space-y-1'>
                      {product.variants.map(variant => (
                        <div key={variant.id} className='flex justify-between items-center text-[11px]'>
                          <span className='text-foreground/80'>{variant.name}</span>
                          <span className='font-mono font-medium'>{PriceEngine.format(variant.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Add-ons (The Upsells) */}
                {product.allowedAddons && product.allowedAddons.length > 0 && (
                  <div className='rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 dark:bg-blue-500/10'>
                    <h4 className='mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400'>
                      <Sparkles className='h-3.5 w-3.5' /> Optional Add-ons
                    </h4>
                    <div className='flex flex-wrap gap-1.5'>
                      {product.allowedAddons.map(item => (
                        <Badge
                          key={item.id}
                          variant='secondary'
                          className='rounded-lg border-blue-200/50 bg-background/50 px-2 py-0 text-[10px] font-semibold dark:border-blue-800/30'
                        >
                          {item.addon.name} <span className='ml-1 text-blue-600'>+{PriceEngine.format(item.priceOverride)}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className='pt-4 mt-auto border-t border-border flex gap-2'>
                  <Link to='/products/$productId' params={{ productId: row.original.id }} onClick={e => handleDetail(e, row.original.id)} className='contents'>
                    <Button variant='outline' size='sm' className='flex-1 rounded-xl text-[10px] font-bold h-9 bg-transparent hover:bg-accent'>
                      PRODUCT DETAILS
                    </Button>
                  </Link>

                  <Link to='/products/$productId' params={{ productId: row.original.id }} onClick={e => handleEdit(e, row.original)} className='contents'>
                    <Button size='sm' className='flex-1 rounded-xl text-[10px] font-bold h-9 shadow-sm'>
                      EDIT
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        }}
      />
    </>
  )
}
