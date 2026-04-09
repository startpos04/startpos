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
import { Box, Edit, Layers, Plus, Scale, TrendingDown } from 'lucide-react'
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
              usedIn: { include: { host: { include: { product: true } }, unit: true } },
            },
          },
          _count: { select: { variants: true } },
        },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  if (isLoading) return <div className='p-10 animate-pulse bg-muted rounded-xl h-full' />
  if (!ingredient) return <div className='p-6'>Ingredient not found.</div>

  // --- Realignment Logic: Aggregate from Variants ---
  // Since this is an "Ingredient", we usually care about the primary variant
  const primaryVariant = ingredient.variants?.[0]

  const totalStock = ingredient.variants?.reduce((acc, v) => acc + (v.inventory?.reduce((subAcc, inv) => subAcc + inv.quantity, 0) || 0), 0) || 0

  const usageCount = ingredient.variants?.reduce((acc, v) => acc + (v.usedIn?.length || 0), 0) || 0

  // Last Cost is now pulled from the primary variant
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
        sku: currentSku, // Pulled from variant
        image: ingredient.image || '',
        type: ingredient.type as any,
        categoryId: ingredient.categoryId,
        baseUnitId: ingredient.baseUnitId,
        price: primaryVariant?.price || 0, // Pulled from variant
        isAvailable: ingredient.isAvailable,
        hasExpiry: ingredient.hasExpiry,
      },
    })
  }

  return (
    <div className='flex flex-col gap-6 p-1 md:p-6 overflow-y-auto pr-2'>
      {/* HEADER */}
      <div className='flex justify-between items-start'>
        <div className='flex gap-4'>
          <div className='h-20 w-20 rounded-xl bg-secondary flex items-center justify-center border'>
            {ingredient.image ? (
              <img src={ingredient.image} alt={ingredient.name} className='h-full w-full object-cover rounded-xl' />
            ) : (
              <Box className='h-10 w-10 text-muted-foreground' />
            )}
          </div>
          <div>
            <h1 className='text-3xl font-bold'>{ingredient.name}</h1>
            <div className='flex gap-2 mt-2 items-center'>
              <Badge variant='outline' className='capitalize'>
                {ingredient.type.replace('_', ' ')}
              </Badge>
              <Badge variant='secondary'>{ingredient.category?.name}</Badge>
              <span className='text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded'>SKU: {currentSku}</span>
            </div>
          </div>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' className='gap-2' onClick={handleRestock}>
            <Plus className='h-4 w-4' /> Restock
          </Button>
          <Button variant='outline' size='sm' className='gap-2' onClick={handleEdit}>
            <Edit className='h-4 w-4' /> Edit
          </Button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <Card className={isLowStock ? 'border-orange-200 bg-orange-50/30' : ''}>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center'>
              <p className='text-sm font-medium text-muted-foreground'>Total Stock</p>
              <Scale className={`h-4 w-4 ${isLowStock ? 'text-orange-500' : 'text-primary'}`} />
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-3xl font-bold'>{totalStock}</span>
              <span className='text-sm text-muted-foreground'>{ingredient.baseUnit?.abbreviation}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center text-muted-foreground'>
              <p className='text-sm font-medium'>Usage</p>
              <Layers className='h-4 w-4' />
            </div>
            <p className='text-3xl font-bold mt-2'>{usageCount}</p>
            <p className='text-xs text-muted-foreground mt-1'>Active Recipes</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center text-muted-foreground'>
              <p className='text-sm font-medium'>Current Cost</p>
              <TrendingDown className='h-4 w-4' />
            </div>
            <p className='text-3xl font-bold mt-2'>{PriceEngine.format(currentCost)}</p>
            <p className='text-xs text-muted-foreground mt-1'>Base Unit Price</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue='usage' className='w-full'>
        <TabsList className='w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-6'>
          <TabsTrigger value='usage' className='data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-2 pb-2'>
            Usage in Recipes
          </TabsTrigger>
          <TabsTrigger value='batches' className='data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-2 pb-2'>
            Inventory Batches
          </TabsTrigger>
        </TabsList>

        <TabsContent value='usage' className='pt-4'>
          <Card>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Host Product</TableHead>
                    <TableHead>Required Qty</TableHead>
                    <TableHead>Cost Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredient.variants
                    ?.flatMap(v => v.usedIn)
                    .map(usage => (
                      <TableRow key={usage.id}>
                        <TableCell className='font-medium'>
                          {usage.host.product.name} <span className='text-xs text-muted-foreground'>({usage.host.name})</span>
                        </TableCell>
                        <TableCell>
                          {usage.quantityUsed} {usage.unit.abbreviation}
                        </TableCell>
                        <TableCell>{PriceEngine.format(usage.quantityUsed * (currentCost / 100))}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='batches' className='pt-4'>
          <div className='space-y-3'>
            {ingredient.variants
              ?.flatMap(v => v.inventory)
              .map(batch => (
                <Card key={batch.id}>
                  <CardContent className='flex items-center justify-between py-4'>
                    <div className='grid grid-cols-3 gap-8 flex-1'>
                      <div>
                        <p className='text-[10px] text-muted-foreground uppercase font-bold'>Batch #</p>
                        <p className='font-mono text-sm'>{batch.batchNumber || '---'}</p>
                      </div>
                      <div>
                        <p className='text-[10px] text-muted-foreground uppercase font-bold'>Expiry</p>
                        <p className={`text-sm ${dayjs(batch.expiryDate).isBefore(dayjs()) ? 'text-destructive font-bold' : ''}`}>
                          {batch.expiryDate ? dayjs(batch.expiryDate).format('MMM DD, YYYY') : 'None'}
                        </p>
                      </div>
                      <div>
                        <p className='text-[10px] text-muted-foreground uppercase font-bold'>Stock</p>
                        <p className='text-sm font-bold'>
                          {batch.quantity} {batch.unit.abbreviation}
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
