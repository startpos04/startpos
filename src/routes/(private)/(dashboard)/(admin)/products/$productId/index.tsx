import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import { showModal } from '@/lib/overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Box, DollarSign, Edit, Package, ShoppingCart, TrendingDown } from 'lucide-react'
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
      const result = await crudAPI.product('findUnique', {
        where: { id: productId },
        include: {
          baseUnit: true,
          category: true,
          // RE-ALIGNED: Price/Cost/SKU/Inventory are now inside variants
          variants: {
            include: {
              inventory: { include: { unit: true } },
              ingredients: {
                include: {
                  material: { include: { product: true } },
                  unit: true,
                },
              },
              _count: { select: { orderItems: true } },
            },
          },
          allowedAddons: { include: { addon: { include: { baseUnit: true } } } },
          _count: { select: { variants: true } },
        },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  if (isLoading) return <div className='p-10 animate-pulse bg-muted rounded-xl h-full' />
  if (!product) return <div className='p-6 text-center'>Product not found.</div>

  // --- CALCULATIONS (Aggregated across variants) ---
  const totalStock = product.variants.reduce((acc, v) => acc + v.inventory.reduce((iAcc, inv) => iAcc + inv.quantity, 0), 0)
  const totalSales = product.variants.reduce((acc, v) => acc + v._count.orderItems, 0)

  const prices = product.variants.map(v => v.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  const isLowStock = totalStock < 10

  const handleEdit = () => {
    // TODO: pass data to avoid refetching in dialog, or optimistically update after edit
    showModal(EditProductDialog, {
      productId,
      defaultValues: {
        name: product.name,
        type: product.type as any,
        categoryId: product.categoryId,
        baseUnitId: product.baseUnitId,
        image: product.image!,
        isAvailable: product.isAvailable,
        hasExpiry: product.hasExpiry,
        variants: product.variants,
      },
    })
  }

  return (
    <div className='flex flex-col gap-6 p-1 md:p-6 overflow-y-auto pr-2'>
      {/* 1. TOP HEADER SECTION */}
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

      {/* 2. QUICK STATS GRID */}
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

      {/* 3. DETAILED CONTENT TABS */}
      <Tabs defaultValue='variants' className='w-full'>
        <TabsList className='grid w-full grid-cols-2 lg:grid-cols-4 h-auto bg-muted/50 p-1'>
          <TabsTrigger value='variants'>Pricing & Variants</TabsTrigger>
          <TabsTrigger value='inventory'>Stock/Batches</TabsTrigger>
          <TabsTrigger value='recipe'>Recipe/Costing</TabsTrigger>
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
        <TabsContent value='recipe' className='pt-4'>
          {product.variants.map(v => (
            <Card key={v.id} className='mb-4'>
              <CardHeader>
                <CardTitle className='text-md'>{v.name || 'Default'} Composition</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material Variant</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead className='text-right'>Cost Contribution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {v.ingredients?.map(ing => (
                      <TableRow key={ing.id}>
                        <TableCell>
                          <div className='font-medium'>{ing.material.product.name}</div>
                          <div className='text-xs text-muted-foreground'>{ing.material.name}</div>
                        </TableCell>
                        <TableCell>
                          {ing.quantityUsed} {ing.unit.abbreviation}
                        </TableCell>
                        <TableCell className='text-right'>{PriceEngine.format(ing.quantityUsed * ing.material.costPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({ label, value, subValue, icon, status = 'default' }: any) {
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
