import { count, eq, toArray, useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { Box, DollarSign, Edit, Package, ShoppingCart, TrendingDown, X } from 'lucide-react'
import { type Product, type ProductVariant, type Unit, VariantAttributeType } from 'prisma/generated/prisma/browser'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  categoryCollection,
  inventoryCollection,
  locationCollection,
  orderItemCollection,
  productCollection,
  productComponentCollection,
  productVariantCollection,
  unitCollection,
} from '@/db/collections'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { MountProps } from '@/lib/mount-manager'
import { cn } from '@/lib/utils'
import { closeProductSidebar, showProductSidebar } from '../-components/product-sidebar'
import { EditProductSidebar } from './-edit-product'

interface ProductDetailsSidebarProps extends MountProps {
  productId: string
}

interface RouteComponentProps {
  productId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/$productId/')({
  loader: ({ params }) => ({ productId: params.productId }),
  component: () => <RouteComponent />,
})

export function ProductDetailsSidebar({ open: _open, onClose, productId }: ProductDetailsSidebarProps) {
  return <RouteComponent productId={productId} onClose={onClose} />
}

function RouteComponent({ productId: propId, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const productId = propId || Route.useLoaderData().productId

  const {
    data: [product],
    isLoading,
  } = useLiveQuery(
    q =>
      q
        .from({ product: productCollection })
        .where(({ product }) => eq(product.id, productId))
        .leftJoin({ category: categoryCollection }, ({ product, category }) => eq(product.categoryId, category.id))
        .leftJoin({ baseUnit: unitCollection }, ({ product, baseUnit }) => eq(product.baseUnitId, baseUnit.id))
        .select(({ product, category, baseUnit }) => ({
          ...product,
          category,
          baseUnit,
          variantCount: toArray(
            q
              .from({ vCount: productVariantCollection })
              .where(({ vCount }) => eq(vCount.productId, product.id))
              .groupBy(({ vCount }) => vCount.productId)
              .select(({ vCount }) => ({ count: count(vCount.id) })),
          ),
          variants: toArray(
            q
              .from({ variant: productVariantCollection })
              .where(({ variant }) => eq(variant.productId, product.id))
              .select(({ variant }) => ({
                ...variant,
                inventory: toArray(
                  q
                    .from({ inv: inventoryCollection })
                    .where(({ inv }) => eq(inv.variantId, variant.id))
                    .leftJoin({ unit: unitCollection }, ({ inv, unit }) => eq(inv.unitId, unit.id))
                    .leftJoin({ location: locationCollection }, ({ inv, location }) => eq(inv.locationId, location.id))
                    .select(({ inv, unit, location }) => ({ ...inv, unit, location })),
                ),
                components: toArray(
                  q
                    .from({ comp: productComponentCollection })
                    .where(({ comp }) => eq(comp.hostId, variant.id))
                    .leftJoin({ vpu: unitCollection }, ({ vpu, comp }) => eq(vpu.id, comp.unitId))
                    .leftJoin({ material: productVariantCollection }, ({ material, comp }) => eq(material.id, comp.materialId))
                    .leftJoin({ p: productCollection }, ({ p, material }) => eq(p.id, material.productId))
                    .select(({ comp, vpu, material, p }) => ({
                      ...comp,
                      unit: vpu,
                      material: { ...material, product: p },
                    })),
                ),
                orderItemsCount: toArray(
                  q
                    .from({ oi: orderItemCollection })
                    .where(({ oi }) => eq(oi.variantId, variant.id))
                    .groupBy(({ oi }) => oi.variantId)
                    .select(({ oi }) => ({ count: count(oi.id) })),
                ),
              })),
          ),
        })),
    [productId],
  )

  const handleClose = () => {
    if (onClose) onClose()
    else closeProductSidebar()
  }

  if (isLoading) return <div className='p-6 animate-pulse bg-muted rounded-xl h-40 m-4' />
  if (!product) return <div className='p-6 text-center text-sm text-muted-foreground'>Product not found.</div>

  const totalStock = product.variants.reduce((acc, v) => acc + v.inventory.reduce((iAcc, inv) => iAcc + inv.quantity, 0), 0)
  const totalSales = product.variants.reduce((acc, v) => acc + (v.orderItemsCount[0]?.count || 0), 0)
  const prices = product.variants.map(v => v.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const isLowStock = totalStock < 10

  const getRecipeIngredients = (variant: (typeof product)['variants'][number]) => variant.components?.filter(c => !c.isAddon) || []
  const getAddons = (variant: (typeof product)['variants'][number]) => variant.components?.filter(c => c.isAddon) || []

  const handleEdit = () => {
    const primaryVariant = product.variants.find(v => v.attributeType === VariantAttributeType.UNSPECIFIED) || product.variants[0]
    showProductSidebar(
      <EditProductSidebar
        open
        productId={product.id}
        variantId={primaryVariant?.id}
        defaultValues={{
          name: product.name,
          type: product.type,
          categoryId: product.categoryId,
          baseUnitId: product.baseUnitId,
          image: product.image ?? '',
          isAvailable: product.isAvailable,
          hasExpiry: product.hasExpiry,
          price: primaryVariant?.price || 0,
          sku: primaryVariant?.sku ?? '',
          ingredients: (primaryVariant?.components ?? [])
            .filter(c => !c.isAddon)
            .map(c => ({
              id: c.id,
              material: { id: c.material.productId, name: c.material.product.name } as Product,
              variant: { id: c.materialId, name: c.material.name } as ProductVariant,
              quantityUsed: Number(c.quantityUsed),
              unit: c.unit as Unit,
            })),
          allowedAddons: (primaryVariant?.components ?? [])
            .filter(c => c.isAddon)
            .map(c => ({
              id: c.id,
              addon: { id: c.material.productId, name: c.material.product.name } as Product,
              variant: { id: c.materialId, name: c.material.name } as ProductVariant,
              unit: c.unit as Unit,
              defaultQuantity: Number(c.quantityUsed),
              priceOverride: c.priceOverride ? Number(c.priceOverride) / 100 : 0,
            })),
          variants: product.variants.map(v => ({
            id: v.id,
            attributeType: v.attributeType,
            name: v.name,
            sku: v.sku,
            price: Number(v.price) / 100,
          })),
        }}
        onBack={() => showProductSidebar(<ProductDetailsSidebar open productId={productId} onClose={handleClose} />)}
        onClose={handleClose}
      />,
    )
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3'>
          <div className='h-10 w-10 rounded-xl bg-secondary flex items-center justify-center border shadow-sm shrink-0 overflow-hidden'>
            {product.image ? (
              <img src={product.image} alt={product.name} className='h-full w-full object-cover' />
            ) : (
              <Box className='h-5 w-5 text-muted-foreground/40' />
            )}
          </div>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight'>{product.name}</h2>
              {!product.isAvailable && (
                <Badge variant='destructive' className='text-[10px] py-0 h-4'>
                  Unavailable
                </Badge>
              )}
            </div>
            <div className='flex gap-1.5 mt-1 flex-wrap'>
              <Badge className='bg-slate-800 text-[10px] py-0 h-4'>{product.category?.name}</Badge>
              <Badge variant='secondary' className='capitalize text-[10px] py-0 h-4'>
                {product.type.toLowerCase().replace('_', ' ')}
              </Badge>
              <Badge variant='outline' className='text-[10px] py-0 h-4'>
                {product.variants.length} Variant(s)
              </Badge>
            </div>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='h-4 w-4' />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {/* Stat cards — 2x2 grid */}
        <div className='grid grid-cols-2 gap-2'>
          <Card>
            <CardContent className='p-3'>
              <div className='flex items-center justify-between mb-1'>
                <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Price</p>
                <DollarSign className='h-3 w-3 text-emerald-500' />
              </div>
              <p className='text-sm font-black font-mono'>{minPrice === maxPrice ? PriceEngine.format(minPrice) : `${PriceEngine.format(minPrice)}+`}</p>
            </CardContent>
          </Card>

          <Card className={cn(isLowStock ? 'border-orange-200 bg-orange-50/30' : '')}>
            <CardContent className='p-3'>
              <div className='flex items-center justify-between mb-1'>
                <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Stock</p>
                <Package className={cn('h-3 w-3', isLowStock ? 'text-orange-500' : 'text-primary')} />
              </div>
              <p className='text-sm font-black'>{totalStock.toLocaleString()}</p>
              <p className='text-[9px] text-muted-foreground'>{product.baseUnit?.abbreviation}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='p-3'>
              <div className='flex items-center justify-between mb-1'>
                <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Sales</p>
                <ShoppingCart className='h-3 w-3 text-purple-500' />
              </div>
              <p className='text-sm font-black'>{totalSales}</p>
              <p className='text-[9px] text-muted-foreground'>Units sold</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='p-3'>
              <div className='flex items-center justify-between mb-1'>
                <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Profit</p>
                <TrendingDown className='h-3 w-3 text-blue-500 rotate-180' />
              </div>
              <p className='text-xs font-bold text-muted-foreground'>See recipe</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue='variants' className='w-full'>
          <TabsList className='w-full grid grid-cols-3 h-auto bg-muted/50 p-1'>
            <TabsTrigger value='variants' className='text-xs'>
              Variants
            </TabsTrigger>
            <TabsTrigger value='inventory' className='text-xs'>
              Stock
            </TabsTrigger>
            <TabsTrigger value='recipe' className='text-xs'>
              Recipe
            </TabsTrigger>
          </TabsList>

          {/* TAB: Variants */}
          <TabsContent value='variants' className='pt-3'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='text-xs font-bold'>Variant</TableHead>
                  <TableHead className='text-xs font-bold'>SKU</TableHead>
                  <TableHead className='text-xs font-bold text-right'>Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className='text-xs font-medium py-2'>{v.name || 'Default'}</TableCell>
                    <TableCell className='font-mono text-[10px] py-2'>{v.sku || '—'}</TableCell>
                    <TableCell className='text-right font-bold text-xs py-2'>{PriceEngine.format(v.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          {/* TAB: Inventory */}
          <TabsContent value='inventory' className='pt-3 space-y-3'>
            {product.variants.map(v => (
              <div key={v.id}>
                {product.variants.length > 1 && (
                  <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5'>{v.name || 'Main'}</p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='text-xs'>Batch</TableHead>
                      <TableHead className='text-xs'>Location</TableHead>
                      <TableHead className='text-xs text-right'>Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {v.inventory.length > 0 ? (
                      v.inventory.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className='font-mono text-[10px] py-2'>{inv.batchNumber || 'N/A'}</TableCell>
                          <TableCell className='text-xs py-2'>{inv.location?.name ?? '—'}</TableCell>
                          <TableCell className='text-right text-xs font-bold py-2'>
                            {inv.quantity} {inv.unit.abbreviation}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className='text-center py-6 text-xs text-muted-foreground'>
                          No stock
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {v.inventory.length > 0 && (
                  <p className='text-[10px] text-muted-foreground mt-1'>
                    Expiry tracked:{' '}
                    {v.inventory
                      .filter(i => i.expiryDate)
                      .map(i => dayjs(i.expiryDate).format('MMM DD, YYYY'))
                      .join(' · ') || 'None'}
                  </p>
                )}
              </div>
            ))}
          </TabsContent>

          {/* TAB: Recipe */}
          <TabsContent value='recipe' className='pt-3 space-y-4'>
            {product.variants.map(v => {
              const ingredients = getRecipeIngredients(v)
              const addons = getAddons(v)
              return (
                <div key={v.id} className='space-y-3'>
                  {product.variants.length > 1 && <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>{v.name || 'Default'}</p>}
                  {ingredients.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='text-xs font-bold'>Material</TableHead>
                          <TableHead className='text-xs font-bold text-right'>Required</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ingredients.map(comp => (
                          <TableRow key={comp.id}>
                            <TableCell className='py-2'>
                              <p className='text-xs font-medium'>{comp.material.product.name}</p>
                              <p className='text-[10px] text-muted-foreground'>{comp.material.name}</p>
                            </TableCell>
                            <TableCell className='text-right text-xs font-mono py-2'>
                              {comp.quantityUsed} {comp.unit.abbreviation}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className='text-xs text-muted-foreground py-2'>No recipe defined.</p>
                  )}
                  {addons.length > 0 && (
                    <div className='space-y-1'>
                      <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>Add-ons</p>
                      {addons.map(addon => (
                        <div key={addon.id} className='flex items-center justify-between p-2 bg-blue-50/50 rounded-lg border border-blue-100'>
                          <p className='text-xs font-medium'>{addon.material.product.name}</p>
                          <p className='text-xs font-bold text-emerald-600'>+{PriceEngine.format(addon.priceOverride || 0)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky footer */}
      <div className='p-4 border-t shrink-0'>
        <Button variant='outline' className='w-full h-9 gap-2 rounded-xl' onClick={handleEdit}>
          <Edit className='h-3.5 w-3.5' /> Edit Product
        </Button>
      </div>
    </div>
  )
}
