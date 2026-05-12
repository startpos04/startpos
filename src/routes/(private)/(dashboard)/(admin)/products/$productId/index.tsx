import { count, eq, toArray, useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { Box, DollarSign, Edit, Package, ShoppingCart, TrendingDown } from 'lucide-react'
import type { Product, ProductVariant, Unit } from 'prisma/generated/prisma/browser'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  categoryCollection,
  inventoryCollection,
  orderItemCollection,
  productCollection,
  productComponentCollection,
  productVariantCollection,
  unitCollection,
} from '@/db/collections'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import { showModal } from '@/lib/overlay'
import { EditProductDialog } from './-edit-product'

interface ProductDetailsProps {
  productId: string
  open: boolean
  onClose: () => void
}

interface RouteComponentProps {
  productId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/products/$productId/')({
  loader: ({ params }) => ({ productId: params.productId }),
  component: () => <RouteComponent />,
})

export function ProductDetailsDialog({ open, onClose, productId }: ProductDetailsProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-6xl h-[90vh] overflow-hidden flex flex-col'>
        <RouteComponent productId={productId} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent(props: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: This component is only used inside a Dialog, so it's guaranteed to be called in a React context. We need to get employeeId from either props (when opened via showModal) or from route params (when navigated directly).
  const productId = props.productId || Route.useLoaderData().productId

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

                // Nested Inventory with Unit join
                inventory: toArray(
                  q
                    .from({ inv: inventoryCollection })
                    .where(({ inv }) => eq(inv.variantId, variant.id))
                    .leftJoin({ u: unitCollection }, ({ inv, u }) => eq(inv.unitId, u.id))
                    .select(({ inv, u }) => ({
                      ...inv,
                      unit: u,
                    })),
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
                      material: {
                        ...material,
                        product: p,
                      },
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

  if (isLoading) return <div className='p-10 animate-pulse bg-muted rounded-xl h-full' />
  if (!product) return <div className='p-6 text-center'>Product not found.</div>

  // --- CALCULATIONS ---
  const totalStock = product.variants.reduce((acc, v) => acc + v.inventory.reduce((iAcc, inv) => iAcc + inv.quantity, 0), 0)
  const totalSales = product.variants.reduce((acc, v) => acc + (v.orderItemsCount[0]?.count || 0), 0)

  const prices = product.variants.map(v => v.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  const isLowStock = totalStock < 10

  // Filter components to show only Recipe Ingredients (where isAddon is false)
  const getRecipeIngredients = (variant: (typeof product)['variants'][number]) => {
    return variant.components?.filter(c => !c.isAddon) || []
  }

  // Filter components to show only Paid Add-ons
  const getAddons = (variant: (typeof product)['variants'][number]) => {
    return variant.components?.filter(c => c.isAddon) || []
  }

  const handleEdit = () => {
    const primaryVariant = product.variants.find(v => v.variantType === 'DEFAULT') || product.variants[0]

    showModal(EditProductDialog, {
      productId: product.id,
      defaultValues: {
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
            material: {
              id: c.material.productId,
              name: c.material.product.name,
            } as Product,
            variant: {
              id: c.materialId,
              name: c.material.name,
            } as ProductVariant,
            quantityUsed: Number(c.quantityUsed),
            unit: c.unit as Unit,
          })),

        allowedAddons: (primaryVariant?.components ?? [])
          .filter(c => c.isAddon)
          .map(c => ({
            id: c.id,
            addon: {
              id: c.material.productId,
              name: c.material.product.name,
            } as Product,
            variant: {
              id: c.materialId,
              name: c.material.name,
            } as ProductVariant,
            unit: c.unit as Unit,
            defaultQuantity: Number(c.quantityUsed),
            priceOverride: c.priceOverride ? Number(c.priceOverride) / 100 : 0,
          })),

        variants: product.variants.map(v => ({
          id: v.id,
          variantType: v.variantType,
          name: v.name,
          sku: v.sku,
          price: Number(v.price) / 100,
        })),
      },
    })
  }

  return (
    <div className='flex flex-col gap-6 p-1 md:p-6 overflow-y-auto pr-2'>
      <div className='flex flex-col md:flex-row justify-between items-start gap-4'>
        <div className='flex gap-5'>
          <div className='h-24 w-24 rounded-2xl bg-secondary flex items-center justify-center border-2 shadow-sm overflow-hidden'>
            {product.image ? (
              <img src={product.image} alt={product.name} className='h-full w-full object-cover' />
            ) : (
              <Box className='h-12 w-12 text-muted-foreground/40' />
            )}
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3'>
              <h1 className='text-3xl font-extrabold tracking-tight'>{product.name}</h1>
              {!product.isAvailable && <Badge variant='destructive'>Unavailable</Badge>}
            </div>
            <div className='flex flex-wrap gap-2'>
              <Badge className='bg-slate-800'>{product.category?.name}</Badge>
              <Badge variant='secondary' className='capitalize'>
                {product.type.toLowerCase().replace('_', ' ')}
              </Badge>
              <Badge variant='outline'>{product.variants.length} Variant(s)</Badge>
            </div>
          </div>
        </div>
        <div className='flex gap-2 w-full md:w-auto'>
          <Button variant='outline' className='flex-1 md:flex-none gap-2' onClick={handleEdit}>
            <Edit className='h-4 w-4' /> Edit Product
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        <StatCard
          label='Price Range'
          value={minPrice === maxPrice ? PriceEngine.format(minPrice) : `${PriceEngine.format(minPrice)} - ${PriceEngine.format(maxPrice)}`}
          subValue='Customer pricing'
          icon={<DollarSign className='text-emerald-500' />}
        />
        <StatCard
          label='Current Stock'
          value={totalStock.toLocaleString()}
          subValue={product.baseUnit?.abbreviation}
          icon={<Package className={isLowStock ? 'text-orange-500' : 'text-primary'} />}
          status={isLowStock ? 'warning' : 'default'}
        />
        <StatCard label='Total Sales' value={totalSales.toString()} subValue='Units sold' icon={<ShoppingCart className='text-purple-500' />} />
        <StatCard label='Profitability' value='Calculated' subValue='View in Recipe tab' icon={<TrendingDown className='text-blue-500 rotate-180' />} />
      </div>

      <Tabs defaultValue='variants' className='w-full'>
        <TabsList className='grid w-full grid-cols-2 lg:grid-cols-4 h-auto bg-muted/50 p-1'>
          <TabsTrigger value='variants'>Pricing & Variants</TabsTrigger>
          <TabsTrigger value='inventory'>Stock/Batches</TabsTrigger>
          <TabsTrigger value='recipe'>Recipe & Add-ons</TabsTrigger>
          <TabsTrigger value='settings'>Specifications</TabsTrigger>
        </TabsList>

        {/* TAB: Variants */}
        <TabsContent value='variants' className='space-y-4 pt-4'>
          <Card>
            <CardHeader>
              <CardTitle className='text-md'>Active Variants</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead className='text-right'>Selling Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.variants.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className='font-medium'>{v.name || 'Default'}</TableCell>
                      <TableCell className='font-mono text-xs'>{v.sku || '—'}</TableCell>
                      <TableCell>{PriceEngine.format(v.costPrice)}</TableCell>
                      <TableCell className='text-right font-bold'>{PriceEngine.format(v.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Inventory */}
        <TabsContent value='inventory' className='space-y-4 pt-4'>
          {product.variants.map(v => (
            <Card key={v.id}>
              <CardHeader className='py-3 border-b'>
                <CardTitle className='text-sm font-semibold'>{v.name || 'Main'} Variant Stock</CardTitle>
              </CardHeader>
              <CardContent className='p-0'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/30'>
                      <TableHead className='pl-6'>Batch #</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className='text-right pr-6'>Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {v.inventory.length > 0 ? (
                      v.inventory.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className='pl-6 font-mono text-xs'>{inv.batchNumber || 'N/A'}</TableCell>
                          <TableCell>{inv.location || 'Warehouse'}</TableCell>
                          <TableCell>{inv.expiryDate ? dayjs(inv.expiryDate).format('MMM DD, YYYY') : 'None'}</TableCell>
                          <TableCell className='text-right pr-6 font-bold'>
                            {inv.quantity} {inv.unit.abbreviation}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className='text-center py-6 text-muted-foreground italic'>
                          No stock found for this variant.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* TAB: Recipe/Composition */}
        <TabsContent value='recipe' className='pt-4 space-y-6'>
          {product.variants.map(v => {
            const ingredients = getRecipeIngredients(v)
            const addons = getAddons(v)

            return (
              <div key={v.id} className='space-y-4'>
                <h3 className='font-bold text-lg px-1'>{v.name || 'Default Variant'}</h3>

                {/* Ingredients Table */}
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm text-muted-foreground uppercase tracking-wider'>Base Recipe / Materials</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead>Required</TableHead>
                          <TableHead className='text-right'>Cost Contribution</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ingredients.length > 0 ? (
                          ingredients.map(comp => (
                            <TableRow key={comp.id}>
                              <TableCell>
                                <div className='font-medium'>{comp.material.product.name}</div>
                                <div className='text-xs text-muted-foreground'>{comp.material.name}</div>
                              </TableCell>
                              <TableCell>
                                {comp.quantityUsed} {comp.unit.abbreviation}
                              </TableCell>
                              <TableCell className='text-right'>{PriceEngine.format(comp.quantityUsed * (comp.material.costPrice || 0))}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className='text-center text-muted-foreground text-xs py-4'>
                              No recipe defined
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Add-ons Table */}
                {addons.length > 0 && (
                  <Card className='border-dashed'>
                    <CardHeader className='pb-2'>
                      <CardTitle className='text-sm text-muted-foreground uppercase tracking-wider'>Available Add-ons</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Add-on Name</TableHead>
                            <TableHead>Surcharge</TableHead>
                            <TableHead className='text-right'>Qty per Order</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {addons.map(addon => (
                            <TableRow key={addon.id}>
                              <TableCell className='font-medium'>
                                {addon.material.product.name} ({addon.material.name})
                              </TableCell>
                              <TableCell className='text-emerald-600 font-semibold'>+ {PriceEngine.format(addon.priceOverride || 0)}</TableCell>
                              <TableCell className='text-right'>
                                {addon.quantityUsed} {addon.unit.abbreviation}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  subValue: string | undefined
  icon: React.ReactNode
  status?: 'default' | 'warning'
}

function StatCard({ label, value, subValue, icon, status = 'default' }: StatCardProps) {
  return (
    <Card className={status === 'warning' ? 'border-orange-200 bg-orange-50/30' : ''}>
      <CardContent className='p-4 flex items-center gap-4'>
        <div className='p-2 bg-background rounded-lg border shadow-sm'>{icon}</div>
        <div>
          <p className='text-xs text-muted-foreground font-medium'>{label}</p>
          <h3 className='text-xl font-bold'>{value}</h3>
          <p className='text-[10px] text-muted-foreground uppercase tracking-wider'>{subValue}</p>
        </div>
      </CardContent>
    </Card>
  )
}
