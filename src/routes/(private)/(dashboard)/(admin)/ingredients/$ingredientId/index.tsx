import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Box, ChevronRight, ClipboardList, Edit, Layers, Scale, TrendingDown } from 'lucide-react'
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
      const result = await crudAPI({
        data: {
          action: 'findUnique',
          table: 'product',
          args: {
            where: { id: ingredientId },
            include: {
              baseUnit: true,
              category: true,
              inventory: { include: { unit: true } },
              // Items that USE this as an ingredient
              usedIn: { include: { host: true, unit: true } },
              // If this ingredient is itself a sub-recipe (e.g., Marinated Sauce)
              ingredients: { include: { material: true, unit: true } },
              _count: { select: { inventoryMovements: true } },
            },
          },
        },
      })
      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

  if (isLoading) return <div className='p-10 animate-pulse bg-muted rounded-xl h-full' />
  if (!ingredient) return <div className='p-6'>Ingredient not found.</div>

  const totalStock = ingredient.inventory?.reduce((acc: number, inv: any) => acc + inv.quantity, 0) || 0
  const lowStockThreshold = 10 // This could be a field in your schema later
  const isLowStock = totalStock < lowStockThreshold

  const handleRestock = () => {
    showModal(RestockIngredientDialog, { ingredient })
  }

  const handleEdit = () => {
    showModal(EditIngredientDialog, {
      ingredientId,
      defaultValues: {
        name: ingredient.name,
        sku: ingredient.sku!,
        image: ingredient.image!,
        type: ingredient.type as any,
        categoryId: ingredient.categoryId,
        baseUnitId: ingredient.baseUnitId,
        price: ingredient.price,
        isAvailable: ingredient.isAvailable,
        hasExpiry: ingredient.hasExpiry,
      },
    })
  }

  return (
    <div className='flex flex-col gap-6 p-1 md:p-6 overflow-y-auto pr-2'>
      {/* HEADER: Ingredient Identity */}
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
            <div className='flex gap-2 mt-2'>
              <Badge variant='outline' className='capitalize'>
                {ingredient.type.replace('_', ' ')}
              </Badge>
              <Badge variant='secondary'>{ingredient.category?.name}</Badge>
              <Badge variant='outline' className='bg-blue-50 text-blue-700 border-blue-200'>
                Unit: {ingredient.baseUnit?.abbreviation}
              </Badge>
            </div>
          </div>
        </div>
        <div className='flex gap-4'>
          <Button variant='outline' size='sm' className='gap-2' onClick={handleRestock}>
            <Edit className='h-4 w-4' /> Restock
          </Button>
          <Button variant='outline' size='sm' className='gap-2' onClick={handleEdit}>
            <Edit className='h-4 w-4' /> Edit Ingredient
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* STAT 1: Current Inventory */}
        <Card className={isLowStock ? 'border-orange-200 bg-orange-50/30' : ''}>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center'>
              <p className='text-sm font-medium text-muted-foreground'>Current Stock</p>
              <Scale className={`h-4 w-4 ${isLowStock ? 'text-orange-500' : 'text-primary'}`} />
            </div>
            <div className='mt-2 flex items-baseline gap-2'>
              <span className='text-3xl font-bold'>{totalStock}</span>
              <span className='text-sm text-muted-foreground'>{ingredient.baseUnit?.abbreviation}</span>
            </div>
            {isLowStock && (
              <div className='mt-2 flex items-center gap-1 text-orange-600 text-xs font-medium'>
                <AlertTriangle className='h-3 w-3' /> Low Stock Level
              </div>
            )}
          </CardContent>
        </Card>

        {/* STAT 2: Usage Profile */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center text-muted-foreground'>
              <p className='text-sm font-medium'>Usage Frequency</p>
              <Layers className='h-4 w-4' />
            </div>
            <p className='text-3xl font-bold mt-2'>{ingredient.usedIn?.length || 0}</p>
            <p className='text-xs text-muted-foreground mt-1'>Parent products/recipes</p>
          </CardContent>
        </Card>

        {/* STAT 3: Financials */}
        <Card>
          <CardContent className='pt-6'>
            <div className='flex justify-between items-center text-muted-foreground'>
              <p className='text-sm font-medium'>Last Cost</p>
              <TrendingDown className='h-4 w-4' />
            </div>
            <p className='text-3xl font-bold mt-2'>{PriceEngine.format(ingredient.costPrice)}</p>
            <p className='text-xs text-muted-foreground mt-1'>Per {ingredient.baseUnit?.abbreviation}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue='usage' className='w-full'>
        <TabsList className='w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-6'>
          <TabsTrigger value='usage' className='data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-2 pb-2'>
            Where it's Used
          </TabsTrigger>
          <TabsTrigger value='batches' className='data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-2 pb-2'>
            Batches & Expiry
          </TabsTrigger>
          {ingredient.ingredients.length > 0 && (
            <TabsTrigger value='subrecipe' className='data-[state=active]:border-primary border-b-2 border-transparent rounded-none bg-transparent px-2 pb-2'>
              Composition
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAB 1: USAGE (Parent Products) */}
        <TabsContent value='usage' className='pt-4'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                <ClipboardList className='h-4 w-4' /> Recipes using {ingredient.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Host Product</TableHead>
                    <TableHead>Required Qty</TableHead>
                    <TableHead>Cost Impact</TableHead>
                    <TableHead className='text-right'>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredient.usedIn.map((usage: any) => {
                    const costContribution = usage.quantityUsed * (ingredient.costPrice / 100)
                    return (
                      <TableRow key={usage.id}>
                        <TableCell className='font-medium'>{usage.host.name}</TableCell>
                        <TableCell>
                          {usage.quantityUsed} {usage.unit.abbreviation}
                        </TableCell>
                        <TableCell>{PriceEngine.format(costContribution)}</TableCell>
                        <TableCell className='text-right'>
                          <Button variant='ghost' size='sm'>
                            <ChevronRight className='h-4 w-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {ingredient.usedIn.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className='text-center py-6 text-muted-foreground'>
                        This item is not currently used in any recipes.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: BATCH TRACKING */}
        <TabsContent value='batches' className='pt-4'>
          <div className='space-y-4'>
            {ingredient.inventory.map((batch: any) => (
              <Card key={batch.id}>
                <CardContent className='flex items-center justify-between py-4'>
                  <div className='flex gap-6 items-center'>
                    <div>
                      <p className='text-xs text-muted-foreground uppercase font-bold'>Batch #</p>
                      <p className='font-mono text-sm'>{batch.batchNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className='text-xs text-muted-foreground uppercase font-bold'>Expiry</p>
                      <p className={`text-sm ${dayjs(batch.expiryDate).isBefore(dayjs()) ? 'text-destructive font-bold' : ''}`}>
                        {batch.expiryDate ? dayjs(batch.expiryDate).format('MMM DD, YYYY') : 'None'}
                      </p>
                    </div>
                    <div>
                      <p className='text-xs text-muted-foreground uppercase font-bold'>Location</p>
                      <p className='text-sm'>{batch.location || 'Main Shelf'}</p>
                    </div>
                  </div>
                  <div className='text-right'>
                    <p className='text-lg font-bold'>
                      {batch.quantity} {batch.unit.abbreviation}
                    </p>
                    <Progress value={(batch.quantity / totalStock) * 100} className='h-1 w-24 ml-auto' />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 3: SUB-RECIPE (If this is a "prepared" ingredient) */}
        <TabsContent value='subrecipe' className='pt-4'>
          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>Ingredients within {ingredient.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Logic to list item.ingredients here */}
              <p className='text-xs text-muted-foreground italic'>Composition details for prepared materials would list here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
