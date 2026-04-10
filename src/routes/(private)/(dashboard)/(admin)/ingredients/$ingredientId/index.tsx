import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import { showModal } from '@/lib/overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Box, Edit, Layers, MapPin, Plus, Scale, TrendingDown } from 'lucide-react'
import { EditIngredientDialog } from './-edit-ingredient'
import { RestockIngredientDialog } from './-restock'

interface IngredientDetailsProps {
  ingredientId: string
  open: boolean
  onClose: () => void
}

interface RouteComponentProps {
  ingredientId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/$ingredientId/')({
  loader: ({ params }) => ({ ingredientId: params.ingredientId }),
  component: () => <RouteComponent />,
})

export function IngredientDetailsDialog({ open, onClose, ingredientId }: IngredientDetailsProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-5xl h-[85vh] overflow-hidden flex flex-col'>
        <RouteComponent ingredientId={ingredientId} />
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent(props: RouteComponentProps) {
  const ingredientId = props.ingredientId || Route.useLoaderData().ingredientId

  const { data: ingredient, isLoading } = useQuery({
    queryKey: ['ingredient', ingredientId],
    queryFn: async () => {
      const result = await crudAPI.product('findUnique', {
        where: { id: ingredientId },
        include: {
          baseUnit: true,
          category: true,
          variants: {
            include: {
              inventory: { include: { unit: true } },
              product: true,
              usedIn: {
                include: {
                  host: { include: { product: true } },
                  unit: true,
                },
              },
            },
          },
        },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  if (isLoading) return <div className='p-10 animate-pulse bg-muted rounded-xl h-125' />
  if (!ingredient) return <div className='p-6 text-center'>Ingredient not found.</div>

  // --- Realignment Logic: Variant-Centric Approach ---
  const primaryVariant = ingredient.variants?.[0]

  // Total stock across all batches of the primary variant
  const totalStock = primaryVariant?.inventory?.reduce((acc, inv) => acc + inv.quantity, 0) || 0

  // Count how many recipes this specific variant is used in
  const usageCount = primaryVariant?.usedIn?.length || 0

  const currentCost = primaryVariant?.costPrice || 0
  const currentSku = primaryVariant?.sku || 'NO SKU'

  const lowStockThreshold = 10
  const isLowStock = totalStock < lowStockThreshold

  const handleRestock = () => {
    showModal(RestockIngredientDialog, { ingredient, variant: primaryVariant })
  }

  const handleEdit = () => {
    showModal(EditIngredientDialog, {
      ingredientId,
      defaultValues: {
        name: ingredient.name,
        sku: currentSku,
        image: ingredient.image || '',
        type: ingredient.type as any,
        categoryId: ingredient.categoryId,
        baseUnitId: ingredient.baseUnitId,
        price: primaryVariant?.price || 0,
        isAvailable: ingredient.isAvailable,
        hasExpiry: ingredient.hasExpiry,
      },
    })
  }

  return (
    <div className='flex flex-col gap-6 pt-6 overflow-y-auto'>
      {/* HEADER */}
      <div className='flex justify-between items-start'>
        <div className='flex gap-4'>
          <div className='h-20 w-20 rounded-2xl bg-secondary flex items-center justify-center border shadow-sm'>
            {ingredient.image ? (
              <img src={ingredient.image} alt={ingredient.name} className='h-full w-full object-cover rounded-2xl' />
            ) : (
              <Box className='h-10 w-10 text-muted-foreground' />
            )}
          </div>
          <div>
            <h1 className='text-3xl font-black tracking-tight'>{ingredient.name}</h1>
            <div className='flex gap-2 mt-2 items-center'>
              <Badge variant='outline' className='capitalize font-bold bg-background'>
                {ingredient.type.replace('_', ' ')}
              </Badge>
              <Badge variant='secondary' className='font-medium'>
                {ingredient.category?.name}
              </Badge>
              <span className='text-[10px] text-muted-foreground font-mono bg-muted px-2 py-1 rounded-lg border'>SKU: {currentSku}</span>
            </div>
          </div>
        </div>
        <div className='flex gap-2'>
          <Button
            size='sm'
            className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]  rounded-xl active:scale-[0.98] cursor-pointer'
            onClick={handleRestock}
          >
            <Plus className='h-4! w-4!' /> Restock
          </Button>
          <Button variant='outline' size='sm' className='gap-2 rounded-xl' onClick={handleEdit}>
            <Edit className='h-4! w-4!' /> Edit
          </Button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card className={isLowStock ? 'border-orange-200 bg-orange-50/30' : 'border-border/50 shadow-sm'}>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center'>
              <p className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>Total Stock</p>
              <Scale className={`h-4 w-4 ${isLowStock ? 'text-orange-500' : 'text-emerald-500'}`} />
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-3xl font-black'>{totalStock}</span>
              <span className='text-sm font-medium text-muted-foreground'>{ingredient.baseUnit?.abbreviation}</span>
            </div>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-sm'>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center text-muted-foreground'>
              <p className='text-xs font-bold uppercase tracking-wider'>Usage</p>
              <Layers className='h-4 w-4 text-blue-500' />
            </div>
            <p className='text-3xl font-black mt-2'>{usageCount}</p>
            <p className='text-[10px] font-bold text-muted-foreground uppercase mt-1'>Active Recipes</p>
          </CardContent>
        </Card>

        <Card className='border-border/50 shadow-sm'>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center text-muted-foreground'>
              <p className='text-xs font-bold uppercase tracking-wider'>Last Unit Cost</p>
              <TrendingDown className='h-4 w-4 text-purple-500' />
            </div>
            <p className='text-3xl font-black mt-2 font-mono'>{PriceEngine.format(currentCost)}</p>
            <p className='text-[10px] font-bold text-muted-foreground uppercase mt-1'>Per {ingredient.baseUnit?.name}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue='usage' className='w-full'>
        <TabsList className='w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-6'>
          <TabsTrigger
            value='usage'
            className='data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-2 pb-2 font-bold'
          >
            Usage in Recipes
          </TabsTrigger>
          <TabsTrigger
            value='batches'
            className='data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-2 pb-2 font-bold'
          >
            Inventory Batches
          </TabsTrigger>
        </TabsList>

        <TabsContent value='usage' className='pt-4'>
          <Card className='border-border/50'>
            <CardContent className='p-0'>
              <Table>
                <TableHeader className='bg-muted/30'>
                  <TableRow>
                    <TableHead className='font-bold'>Host Product</TableHead>
                    <TableHead className='font-bold text-right'>Required Qty</TableHead>
                    <TableHead className='font-bold text-right'>Cost Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {primaryVariant?.usedIn?.map(usage => (
                    <TableRow key={usage.id}>
                      <TableCell className='font-medium'>
                        {usage.host.product.name}{' '}
                        {usage.host.name && (
                          <Badge variant='outline' className='ml-2 text-[10px]'>
                            {usage.host.name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right font-mono'>
                        {usage.quantityUsed} {usage.unit.abbreviation}
                      </TableCell>
                      <TableCell className='text-right font-bold font-mono'>
                        {/* Cost logic: (qty * currentCost) since currentCost is already base unit price */}
                        {PriceEngine.format(usage.quantityUsed * currentCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {usageCount === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className='text-center py-10 text-muted-foreground'>
                        This ingredient isn't used in any recipes yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='batches' className='pt-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            {primaryVariant?.inventory?.map(batch => (
              <Card key={batch.id} className='border-border/50 hover:border-primary/50 transition-colors'>
                <CardContent className='flex items-center justify-between py-4 px-6'>
                  <div className='grid grid-cols-2 gap-y-4 gap-x-8 flex-1'>
                    <div>
                      <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Batch #</p>
                      <p className='font-mono text-sm font-bold'>{batch.batchNumber || '---'}</p>
                    </div>
                    <div>
                      <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Stock</p>
                      <p className='text-sm font-black text-emerald-600'>
                        {batch.quantity} {batch.unit.abbreviation}
                      </p>
                    </div>
                    <div>
                      <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Location</p>
                      <div className='flex items-center gap-1 text-sm'>
                        <MapPin className='w-3 h-3 text-muted-foreground' />
                        {batch.location || 'Not Set'}
                      </div>
                    </div>
                    <div>
                      <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Expiry</p>
                      <p className={`text-sm font-bold ${dayjs(batch.expiryDate).isBefore(dayjs()) ? 'text-destructive' : ''}`}>
                        {batch.expiryDate ? dayjs(batch.expiryDate).format('MMM DD, YYYY') : 'None'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
