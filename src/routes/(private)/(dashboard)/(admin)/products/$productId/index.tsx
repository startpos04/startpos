import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Box, DollarSign, Edit, Info, Layers, Package, Scale, ShoppingCart, Tag, TrendingDown } from 'lucide-react'
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
  const productId = props.productId || Route.useLoaderData().productId

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'findUnique',
          table: 'product',
          args: {
            where: { id: productId },
            include: {
              baseUnit: true,
              category: true,
              inventory: { include: { unit: true } },
              variants: true,
              variantOf: true,
              ingredients: { include: { material: true, unit: true } },
              usedIn: { include: { host: true, unit: true } },
              allowedAddons: { include: { addon: { include: { baseUnit: true } } } },
              _count: { select: { orderItems: true, inventoryMovements: true } },
            },
          },
        },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  if (isLoading) return <div className='p-10 animate-pulse bg-muted rounded-xl h-full' />
  if (!product) return <div className='p-6 text-center'>Product not found.</div>

  // Calculations
  const totalStock = product.inventory?.reduce((acc: number, inv: any) => acc + inv.quantity, 0) || 0
  const profitCents = product.price - product.costPrice
  const marginPercentage = product.price > 0 ? (profitCents / product.price) * 100 : 0
  const isLowStock = totalStock < 10

  const handleEdit = () => {
    showModal(EditProductDialog, {
      productId,
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
    <div className='flex flex-col gap-6 p-1 md:p-6 overflow-y-auto pr-2'>
      {/* 1. TOP HEADER SECTION */}
      <div className='flex flex-col md:flex-row justify-between items-start gap-4'>
        <div className='flex gap-5'>
          <div className='h-24 w-24 rounded-2xl bg-secondary flex items-center justify-center border-2 shadow-sm'>
            {product.image ? (
              <img src={product.image} alt={product.name} className='h-full w-full object-cover rounded-2xl' />
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
              <Badge variant='outline' className='bg-primary/5'>
                {product.sku || 'No SKU'}
              </Badge>
              <Badge className='bg-slate-800'>{product.category?.name}</Badge>
              <Badge variant='secondary' className='capitalize'>
                {product.type.toLowerCase()}
              </Badge>
              {product.variantValue && (
                <Badge className='bg-purple-100 text-purple-700 border-purple-200'>
                  {product.variantType}: {product.variantValue}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className='flex gap-2 w-full md:w-auto'>
          <Button variant='outline' className='flex-1 md:flex-none gap-2' onClick={handleEdit}>
            <Edit className='h-4 w-4' /> Edit Product
          </Button>
        </div>
      </div>

      {/* 2. QUICK STATS GRID */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        <StatCard
          label='Sales Price'
          value={PriceEngine.format(product.price)}
          subValue={`Cost: ${PriceEngine.format(product.costPrice)}`}
          icon={<DollarSign className='text-emerald-500' />}
        />
        <StatCard
          label='Profit Margin'
          value={`${marginPercentage.toFixed(1)}%`}
          subValue={`${PriceEngine.format(profitCents)} profit/unit`}
          icon={<TrendingDown className='text-blue-500 rotate-180' />}
          trend={marginPercentage > 30 ? 'up' : 'down'}
        />
        <StatCard
          label='Current Inventory'
          value={totalStock.toString()}
          subValue={product.baseUnit?.abbreviation}
          icon={<Package className={isLowStock ? 'text-orange-500' : 'text-primary'} />}
          status={isLowStock ? 'warning' : 'default'}
        />
        <StatCard
          label='Total Sales'
          value={product._count?.orderItems.toString()}
          subValue='Lifetime transactions'
          icon={<ShoppingCart className='text-purple-500' />}
        />
      </div>

      {/* 3. DETAILED CONTENT TABS */}
      <Tabs defaultValue='inventory' className='w-full'>
        <TabsList className='grid w-full grid-cols-2 lg:grid-cols-5 h-auto bg-muted/50 p-1'>
          <TabsTrigger value='inventory'>Inventory</TabsTrigger>
          <TabsTrigger value='recipe'>Recipe & Cost</TabsTrigger>
          <TabsTrigger value='variants'>Variants & Add-ons</TabsTrigger>
          <TabsTrigger value='usage'>Where Used</TabsTrigger>
          <TabsTrigger value='settings'>Specs</TabsTrigger>
        </TabsList>

        {/* TAB: Inventory */}
        <TabsContent value='inventory' className='space-y-4 pt-4'>
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
            <Card className='lg:col-span-2'>
              <CardHeader>
                <CardTitle className='text-md'>Batch Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch / Lot</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className='text-right'>Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.inventory.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className='font-mono text-xs'>{inv.batchNumber || '—'}</TableCell>
                        <TableCell>{inv.location || 'Main'}</TableCell>
                        <TableCell>
                          {inv.expiryDate ? (
                            <span className={dayjs(inv.expiryDate).isBefore(dayjs()) ? 'text-red-500 font-bold' : ''}>
                              {dayjs(inv.expiryDate).format('MMM DD, YYYY')}
                            </span>
                          ) : (
                            'No Expiry'
                          )}
                        </TableCell>
                        <TableCell className='text-right font-bold'>
                          {inv.quantity} {inv.unit.abbreviation}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className='text-md'>Storage Info</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='flex justify-between border-b pb-2'>
                  <span className='text-muted-foreground text-sm'>Base Unit</span>
                  <span className='font-medium'>{product.baseUnit?.name}</span>
                </div>
                <div className='flex justify-between border-b pb-2'>
                  <span className='text-muted-foreground text-sm'>Movements</span>
                  <span className='font-medium'>{product._count?.inventoryMovements} logs</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Recipe/Products */}
        <TabsContent value='recipe' className='pt-4'>
          <Card>
            <CardHeader>
              <CardTitle className='text-md flex items-center gap-2'>
                <Layers className='h-4 w-4' /> Products / Composition
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Required Qty</TableHead>
                    <TableHead className='text-right'>Est. Cost Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.ingredients?.map((ing: any) => (
                    <TableRow key={ing.id}>
                      <TableCell className='font-medium'>{ing.material.name}</TableCell>
                      <TableCell>
                        {ing.quantityUsed} {ing.unit.abbreviation}
                      </TableCell>
                      <TableCell className='text-right'>{PriceEngine.format(ing.quantityUsed * ing.material.costPrice)}</TableCell>
                    </TableRow>
                  ))}
                  {(!product.ingredients || product.ingredients.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className='text-center py-10 text-muted-foreground'>
                        This is a raw material (no products).
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Variants & Add-ons */}
        <TabsContent value='variants' className='pt-4 space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Card>
              <CardHeader>
                <CardTitle className='text-md'>Available Variants</CardTitle>
              </CardHeader>
              <CardContent>
                {product.variants?.length > 0 ? (
                  <div className='space-y-2'>
                    {product.variants.map((v: any) => (
                      <div key={v.id} className='flex justify-between items-center p-2 border rounded-lg'>
                        <span>{v.variantValue}</span>
                        <span className='font-bold'>{PriceEngine.format(v.price)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-muted-foreground'>No variants defined.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-md'>Allowed Add-ons</CardTitle>
              </CardHeader>
              <CardContent>
                {product.allowedAddons?.length > 0 ? (
                  <div className='space-y-2'>
                    {product.allowedAddons.map((a: any) => (
                      <div key={a.id} className='flex justify-between items-center p-2 border rounded-lg bg-blue-50/30'>
                        <span>{a.addon.name}</span>
                        <span className='font-bold text-blue-600'>+{PriceEngine.format(a.priceOverride)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-muted-foreground'>No add-ons linked.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Settings/Flags */}
        <TabsContent value='settings' className='pt-4'>
          <Card>
            <CardContent className='grid grid-cols-1 md:grid-cols-3 gap-6 py-6'>
              <div className='flex items-center gap-3'>
                <div className={`p-2 rounded-full ${product.hasExpiry ? 'bg-green-100 text-green-600' : 'bg-gray-100'}`}>
                  <Tag className='h-4 w-4' />
                </div>
                <div>
                  <p className='text-sm font-bold'>Expiry Tracking</p>
                  <p className='text-xs text-muted-foreground'>{product.hasExpiry ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
              <div className='flex items-center gap-3'>
                <div className={`p-2 rounded-full ${product.requiresDeposit ? 'bg-amber-100 text-amber-600' : 'bg-gray-100'}`}>
                  <Info className='h-4 w-4' />
                </div>
                <div>
                  <p className='text-sm font-bold'>Refundable Deposit</p>
                  <p className='text-xs text-muted-foreground'>{product.requiresDeposit ? PriceEngine.format(product.depositAmount!) : 'None'}</p>
                </div>
              </div>
              <div className='flex items-center gap-3'>
                <div className='p-2 rounded-full bg-blue-100 text-blue-600'>
                  <Scale className='h-4 w-4' />
                </div>
                <div>
                  <p className='text-sm font-bold'>Service Duration</p>
                  <p className='text-xs text-muted-foreground'>{product.durationMinutes ? `${product.durationMinutes} mins` : 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({ label, value, subValue, icon, status = 'default' }: any) {
  const statusClasses = {
    warning: 'border-orange-200 bg-orange-50/50',
    default: 'bg-card',
  }

  return (
    <Card className={statusClasses[status as keyof typeof statusClasses]}>
      <CardContent className='pt-6'>
        <div className='flex justify-between items-start'>
          <div>
            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>{label}</p>
            <h3 className='text-2xl font-bold mt-1'>{value}</h3>
            <p className='text-xs text-muted-foreground mt-1'>{subValue}</p>
          </div>
          <div className='p-2 bg-background rounded-lg shadow-sm border'>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
