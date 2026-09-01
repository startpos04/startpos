/** biome-ignore-all lint/suspicious/noExplicitAny: fix any */
import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Box, Edit, Plus, X } from 'lucide-react'
import Tab from '@startpos-core/components/custom/tab'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { MountProps } from '@/lib/mount-manager'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { cn } from '@startpos-core/lib/utils'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'
import { closeIngredientSidebar, showIngredientSidebar } from '../-components/ingredient-sidebar'
import { BatchesTab } from './-batches-tab'
import { EditIngredientSidebar } from './-edit-ingredient'
import { RecipesTab } from './-recipes-tab'
import { RestockIngredientSidebar } from './-restock'

interface IngredientDetailsSidebarProps extends MountProps {
  ingredientId: string
}

interface RouteComponentProps {
  ingredientId?: string
}

export const Route = createFileRoute('/(private)/(dashboard)/ingredients/$ingredientId/')({
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
  const isLowStock = totalStock < (ingredient.variants[0]?.lowStockThreshold || user.configs.LOW_STOCK_THRESHOLD)

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
