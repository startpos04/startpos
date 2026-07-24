import { createFileRoute, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Database, Edit, Package, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Button } from '@/components/ui/button'
import { productCollection } from '@/db/collections'
import { productCols } from '@/lib/columns/product-columns'
import { tableCols } from '@/lib/columns/table-columns'
import { showModal } from '@/lib/overlay'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { IngredientDetailsDialog } from './$ingredientId'
import { RestockIngredientDialog } from './$ingredientId/-restock'
import { CreateIngredientDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isLoading } = fetchIngredients()

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(CreateIngredientDialog)
  }

  const handleEdit = useCallback((e: React.MouseEvent<HTMLAnchorElement>, ingredientId: string) => {
    e.preventDefault()
    showModal(IngredientDetailsDialog, { ingredientId })
  }, [])

  const handleRestock = useCallback((ingredient: NonNullable<typeof data>[number]) => {
    const primaryVariant = ingredient.variants?.[0]
    if (!primaryVariant) return
    showModal(RestockIngredientDialog, { ingredient, variant: primaryVariant })
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
                  showModal(WarningPrompt, {
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
                    <Link
                      to='/ingredients/$ingredientId'
                      params={{ ingredientId: row.original.id }}
                      onClick={e => handleEdit(e, row.original.id)}
                      className='contents'
                    >
                      <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary'>
                        <Edit className='h-4 w-4' />
                      </Button>
                    </Link>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary'
                      onClick={() => handleRestock(row.original)}
                    >
                      <Database className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive'
                      onClick={handleDelete}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                )
              },
            }),
            // biome-ignore lint/suspicious/noExplicitAny: TODO: fix any
          ] as ColumnDef<NonNullable<typeof data>[number], any>[],
      ),
    [handleEdit, handleRestock],
  )

  return (
    <div className='flex flex-col grow gap-4 px-4'>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Ingredients</h1>
          <p className='text-muted-foreground text-sm'>Manage raw materials and track stock levels for your POS.</p>
        </div>
        <a href='/ingredients/create' onClick={handleAdd} className='contents'>
          <Button className='shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer'>
            <Plus className='h-4 w-4 mr-2' /> Add Ingredient
          </Button>
        </a>
      </div>

      <TableView
        data={data}
        isFetching={isLoading}
        columns={columns}
        renderEmpty={() => (
          <div className='flex flex-col items-center justify-center py-20 text-center'>
            <Package className='h-12 w-12 text-muted-foreground/20 mb-4' />
            <h3 className='text-lg font-medium'>No ingredients found</h3>
            <p className='text-sm text-muted-foreground'>Start by adding your first raw material.</p>
          </div>
        )}
      />
    </div>
  )
}
