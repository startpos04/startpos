/** biome-ignore-all lint/suspicious/noExplicitAny: fix any */
import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Box, Edit, MapPin, Plus, X } from 'lucide-react'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { MountProps } from '@/lib/mount-manager'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'
import { closeIngredientSidebar, showIngredientSidebar } from '../-components/ingredient-sidebar'
import { EditIngredientSidebar } from './-edit-ingredient'
import { RestockIngredientSidebar } from './-restock'

interface IngredientDetailsSidebarProps extends MountProps {
  ingredientId: string
}

interface RouteComponentProps {
  ingredientId?: string
}

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/$ingredientId/')({
  loader: ({ params }) => ({ ingredientId: params.ingredientId }),
  component: () => (
    <div className='px-4 pb-4'>
      <RouteComponent />
    </div>
  ),
})

export function IngredientDetailsSidebar({ open: _open, onClose, ingredientId }: IngredientDetailsSidebarProps) {
  return <RouteComponent ingredientId={ingredientId} onClose={onClose} />
}

// Recipes Tab Component
function RecipesTab({ primaryVariant, currentCost, usageCount }: { primaryVariant: any; currentCost: number; usageCount: number }) {
  return (
    <Table>
      <TableHeader className='bg-muted/30'>
        <TableRow>
          <TableHead className='font-bold text-xs'>Host Product</TableHead>
          <TableHead className='font-bold text-right text-xs'>Qty</TableHead>
          <TableHead className='font-bold text-right text-xs'>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {primaryVariant?.usedIn?.map((usage: any) => (
          <TableRow key={usage.id}>
            <TableCell className='text-sm font-medium py-2'>
              {usage.host.product.name}
              {usage.host.name && (
                <Badge variant='outline' className='ml-1.5 text-[10px] py-0'>
                  {usage.host.name}
                </Badge>
              )}
            </TableCell>
            <TableCell className='text-right font-mono text-xs py-2'>
              {usage.quantityUsed} {usage.unit.abbreviation}
            </TableCell>
            <TableCell className='text-right font-bold font-mono text-xs py-2'>{PriceEngine.format(usage.quantityUsed * currentCost)}</TableCell>
          </TableRow>
        ))}
        {usageCount === 0 && (
          <TableRow>
            <TableCell colSpan={3} className='text-center py-8 text-sm text-muted-foreground'>
              Not used in any recipes yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

// Batches Tab Component
function BatchesTab({ primaryVariant }: { primaryVariant: any }) {
  return (
    <div className='space-y-2'>
      {primaryVariant?.inventory?.map((batch: any) => (
        <Card key={batch.id} className='border-border/50 hover:border-primary/30 transition-colors'>
          <CardContent className='p-3'>
            <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Batch #</p>
                <p className='font-mono text-xs font-bold'>{batch.batchNumber || '---'}</p>
              </div>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Stock</p>
                <p className='text-xs font-black text-emerald-600'>
                  {batch.quantity} {batch.unit.abbreviation}
                </p>
              </div>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Location</p>
                <div className='flex items-center gap-1 text-xs'>
                  <MapPin className='w-2.5 h-2.5 text-muted-foreground' />
                  {batch.location?.name}
                </div>
              </div>
              <div>
                <p className='text-[9px] text-muted-foreground uppercase font-black tracking-widest'>Expiry</p>
                <p className={cn('text-xs font-bold', dayjs(batch.expiryDate).isBefore(dayjs()) ? 'text-destructive' : '')}>
                  {batch.expiryDate ? dayjs(batch.expiryDate).format('MMM DD, YYYY') : 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {!primaryVariant?.inventory?.length && <p className='text-center py-8 text-sm text-muted-foreground'>No inventory batches recorded.</p>}
    </div>
  )
}

function RouteComponent({ ingredientId: propId, onClose }: RouteComponentProps & { onClose?: () => void }) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const ingredientId = propId || Route.useLoaderData().ingredientId
  const user = useStore(authStore, s => s.user)
  const { data: ingredients, isLoading } = fetchIngredients(ingredientId)
  const ingredient = ingredients.find(ing => ing.id === ingredientId)

  if (isLoading) return <div className='p-6 animate-pulse bg-muted rounded-xl h-40 m-4' />
  if (!ingredient) return <div className='p-6 text-center text-muted-foreground'>Ingredient not found.</div>

  const primaryVariant = ingredient.variants?.[0]
  const totalStock = primaryVariant?.inventory?.reduce((acc, inv) => acc + inv.quantity, 0) || 0
  const usageCount = primaryVariant?.usedIn?.length || 0
  const currentCost = primaryVariant?.costPrice || 0
  const currentSku = primaryVariant?.sku || 'NO SKU'
  const isLowStock = totalStock < (ingredient.variants[0]?.lowStockThreshold || user.systemConfigs.LOW_STOCK_THRESHOLD)

  const handleClose = () => {
    if (onClose) onClose()
    else closeIngredientSidebar()
  }

  const handleRestock = () => {
    if (!primaryVariant) return
    showIngredientSidebar(
      <RestockIngredientSidebar
        open
        onClose={handleClose}
        ingredient={ingredient}
        variant={primaryVariant}
        onBack={() => showIngredientSidebar(<IngredientDetailsSidebar open ingredientId={ingredientId} onClose={handleClose} />)}
      />,
    )
  }

  const handleEdit = () => {
    showIngredientSidebar(
      <EditIngredientSidebar
        open
        onClose={handleClose}
        ingredientId={ingredientId}
        defaultValues={{
          name: ingredient.name,
          sku: currentSku,
          image: ingredient.image || '',
          type: ingredient.type,
          categoryId: ingredient.categoryId,
          baseUnitId: ingredient.baseUnitId,
          price: primaryVariant?.price || 0,
          isAvailable: ingredient.isAvailable,
          hasExpiry: ingredient.hasExpiry,
        }}
        onBack={() => showIngredientSidebar(<IngredientDetailsSidebar open ingredientId={ingredientId} onClose={handleClose} />)}
      />,
    )
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3'>
          <div className='h-10 w-10 rounded-xl bg-secondary flex items-center justify-center border shadow-sm shrink-0'>
            {ingredient.image ? (
              <img src={ingredient.image} alt={ingredient.name} className='h-full w-full object-cover rounded-xl' />
            ) : (
              <Box className='h-5 w-5 text-muted-foreground' />
            )}
          </div>
          <div>
            <h2 className='text-base font-semibold leading-tight'>{ingredient.name}</h2>
            <div className='flex flex-wrap gap-1.5 mt-1'>
              <Badge variant='outline' className='capitalize text-[10px] font-bold bg-background py-0'>
                {ingredient.type.replace('_', ' ')}
              </Badge>
              <span className='text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded border'>{currentSku}</span>
            </div>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Compact info row — same style as product detail */}
      <div className='flex items-center gap-4 px-4 py-2.5 border-b bg-muted/20 shrink-0'>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Stock</p>
          <p className={cn('text-sm font-black', isLowStock ? 'text-orange-500' : '')}>
            {totalStock} <span className='text-[10px] font-normal text-muted-foreground'>{ingredient.baseUnit?.abbreviation}</span>
          </p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Cost</p>
          <p className='text-sm font-black font-mono'>{PriceEngine.format(currentCost)}</p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Recipes</p>
          <p className='text-sm font-black'>{usageCount}</p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div className='flex items-center gap-1.5'>
          <Badge variant='secondary' className='font-medium text-[10px]'>
            {ingredient.category?.name || 'Uncategorised'}
          </Badge>
          {isLowStock && (
            <Badge variant='outline' className='text-orange-600 border-orange-200 bg-orange-50 text-[10px] shrink-0'>
              Low
            </Badge>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {/* Tabs */}
        <Tab
          defaultValue='Recipes'
          tabs={[
            {
              label: 'Recipes',
              Component: RecipesTab,
              primaryVariant,
              currentCost,
              usageCount,
            },
            {
              label: 'Batches',
              Component: BatchesTab,
              primaryVariant,
            },
          ]}
        />
      </div>

      {/* Sticky footer — action buttons */}
      <div className='p-4 border-t shrink-0 flex gap-2'>
        <Button size='sm' className='flex-1 shadow-sm shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]' onClick={handleRestock}>
          <Plus className='size-3.5' /> Restock
        </Button>
        <Button variant='outline' size='sm' className='flex-1 gap-1.5' onClick={handleEdit}>
          <Edit className='size-3.5' /> Edit
        </Button>
      </div>
    </div>
  )
}
