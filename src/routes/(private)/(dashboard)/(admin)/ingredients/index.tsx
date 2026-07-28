import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Database, Package, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Button } from '@/components/ui/button'
import { productCollection } from '@/db/collections'
import { productCols } from '@/lib/columns/product-columns'
import { tableCols } from '@/lib/columns/table-columns'
import MountManager from '@/lib/mount-manager'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { closeIngredientSidebar, INGREDIENT_ASIDE_ID, showIngredientSidebar } from './-components/ingredient-sidebar'
import { IngredientDetailsSidebar } from './$ingredientId'
import { RestockIngredientSidebar } from './$ingredientId/-restock'
import { CreateIngredientSidebar } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isLoading } = fetchIngredients()
  const [selectedId, setSelectedId] = useState<string>('')

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showIngredientSidebar(<CreateIngredientSidebar />)
  }

  const handleSelectRow = useCallback((ingredient: NonNullable<typeof data>[number]) => {
    setSelectedId(ingredient.id)
    showIngredientSidebar(
      <IngredientDetailsSidebar
        open
        ingredientId={ingredient.id}
        onClose={() => {
          setSelectedId('')
          closeIngredientSidebar()
        }}
      />,
    )
  }, [])

  const handleRestock = useCallback((ingredient: NonNullable<typeof data>[number]) => {
    const primaryVariant = ingredient.variants?.[0]
    if (!primaryVariant) return
    showIngredientSidebar(
      <RestockIngredientSidebar
        open
        ingredient={ingredient}
        variant={primaryVariant}
        onClose={() => {
          setSelectedId('')
          closeIngredientSidebar()
        }}
        onBack={() =>
          showIngredientSidebar(
            <IngredientDetailsSidebar
              open
              ingredientId={ingredient.id}
              onClose={() => {
                setSelectedId('')
                MountManager.clear(INGREDIENT_ASIDE_ID)
              }}
            />,
          )
        }
      />,
    )
  }, [])

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(
        h =>
          [
            tableCols.number(h),
            productCols.image(h),
            productCols.name(h),
            productCols.sku(h),
            productCols.category(h),
            productCols.price(h),
            productCols.cost(h),
            productCols.netMargin(h),
            productCols.stockStatus(h),
            productCols.stockTotal(h),
            productCols.totalValue(h),
            productCols.showInPOS(h),
            tableCols.action(h, {
              cell: ({ row }) => {
                const handleDelete = async () => {
                  MountManager.show(WarningPrompt, {
                    title: 'Delete Ingredient',
                    description: 'Are you sure you want to delete this ingredient? This will affect products using this recipe.',
                    onConfirm: async () => {
                      try {
                        productCollection.update(row.original.id, draft => {
                          draft.deletedAt = new Date()
                        })
                        toast.success('Ingredient archived successfully')
                        return true
                      } catch (error) {
                        console.error('Transaction failed:', error)
                        toast.error('Failed to archive ingredient. Please try again.')
                        return false
                      }
                    },
                  })
                }

                return (
                  <div className='flex justify-end gap-2 pr-2'>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='rounded-full hover:bg-primary/10 hover:text-primary'
                      onClick={e => {
                        e.stopPropagation()
                        handleRestock(row.original)
                      }}
                    >
                      <Database />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive'
                      onClick={e => {
                        e.stopPropagation()
                        handleDelete()
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              },
            }),
            // biome-ignore lint/suspicious/noExplicitAny: TODO: fix any
          ] as ColumnDef<NonNullable<typeof data>[number], any>[],
      ),
    [handleRestock],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full p-4 pt-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-foreground'>Ingredients</h1>
            <p className='text-muted-foreground text-sm'>Manage raw materials and track stock levels for your POS.</p>
          </div>
          <a href='/ingredients/create' onClick={handleAdd} className='contents'>
            <Button size='sm' className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer'>
              <Plus /> Add Ingredient
            </Button>
          </a>
        </div>

        <TableView
          data={data}
          isFetching={isLoading}
          columns={columns}
          selectableRow={{
            onClick: handleSelectRow,
            isSelected: row => row.id === selectedId,
          }}
          renderEmpty={() => (
            <div className='flex flex-col items-center justify-center py-20 text-center'>
              <Package className='h-12 w-12 text-muted-foreground/20 mb-4' />
              <h3 className='text-lg font-medium'>No ingredients found</h3>
              <p className='text-sm text-muted-foreground'>Start by adding your first raw material.</p>
            </div>
          )}
        />
      </div>

      <MountManager id={INGREDIENT_ASIDE_ID} />
    </div>
  )
}
