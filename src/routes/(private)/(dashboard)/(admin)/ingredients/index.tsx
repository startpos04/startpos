import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge' // Assuming you have a Badge component
import { Button } from '@/components/ui/button'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Edit, Package, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { IngredientDetailsDialog } from './$ingredientId'
import { CreateIngredientDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/')({
  component: RouteComponent,
})

function RouteComponent() {
  const queryClient = useQueryClient()
  const { data, isFetching } = fetchIngredients()

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(CreateIngredientDialog)
  }

  const handleEdit = (e: React.MouseEvent<HTMLAnchorElement>, ingredientId: string) => {
    e.preventDefault()
    showModal(IngredientDetailsDialog, {
      ingredientId,
    })
  }

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.display({
          id: 'number',
          maxSize: 20,
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),
        h.accessor('image', {
          header: 'Avatar',
          maxSize: 40,
          cell: info => {
            const item = info.row.original
            return (
              <Avatar className='h-9 w-9 border border-border/50 shadow-sm'>
                <AvatarImage src={item.image ?? ''} alt={item.name} />
                <AvatarFallback className='bg-primary/5 text-primary text-xs font-bold'>{item.name?.charAt(0)}</AvatarFallback>
              </Avatar>
            )
          },
        }),
        h.accessor('name', {
          header: 'Ingredient',
        }),
        h.accessor('baseUnit.abbreviation', {
          header: 'Unit',
          maxSize: 60,
          cell: info => (
            <Badge variant='secondary' className='rounded-md font-medium px-2 py-0 text-[11px] bg-secondary/50'>
              {info.getValue() ?? 'pcs'}
            </Badge>
          ),
        }),
        h.display({
          id: 'stock',
          header: 'Stock Level',
          cell: info => {
            const item = info.row.original
            const totalStock = item.inventory?.reduce((acc, curr) => acc + Number(curr.quantity), 0) ?? 0

            return (
              <div className='flex items-center gap-2'>
                <span className={`text-sm font-semibold ${totalStock <= 0 ? 'text-destructive' : 'text-foreground'}`}>{totalStock.toLocaleString()}</span>
                <span className='text-xs text-muted-foreground'>{item.baseUnit?.abbreviation}</span>
              </div>
            )
          },
        }),
        h.accessor('costPrice', {
          header: 'Cost per Unit',
          cell: info => <span className='font-mono'>{PriceEngine.format(info.getValue())}</span>,
        }),
        h.display({
          maxSize: 100,
          id: 'actions',
          header: () => <div className='text-right pr-4'>Actions</div>,
          cell: ({ row }) => {
            const handleDelete = async () => {
              // TODO: in to improve what happen to product using this, inventory and many more
              const result = await crudAPI({
                data: {
                  table: 'product',
                  action: 'update',
                  args: { where: { id: row.original.id }, data: { deletedAt: { set: new Date() } } },
                },
              })

              result.match(
                async () => {
                  toast.success('Ingredient successfully deleted')
                  await queryClient.invalidateQueries({ queryKey: ['ingredients'] })
                },
                error => toast.error(error),
              )
            }

            return (
              <div className='flex justify-end gap-2 pr-2'>
                <Link
                  to='/ingredients/$ingredientId'
                  params={{ ingredientId: row.original.id }}
                  onClick={e => handleEdit(e, row.original.id)}
                  className='contents'
                >
                  <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full'>
                    <Edit className='h-4 w-4' />
                  </Button>
                </Link>
                <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full text-destructive hover:text-destructive' onClick={handleDelete}>
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            )
          },
        }),
      ]),
    [data],
  )

  return (
    <div className='flex flex-col grow gap-4 px-4'>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Ingredients</h1>
          <p className='text-muted-foreground text-sm'>Manage raw materials and track stock levels by weight, volume, or count.</p>
        </div>
        <a href='/ingredients/create' onClick={handleAdd} className='contents'>
          <Button className='rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer'>
            <Plus className='h-4 w-4 mr-2' /> Add Ingredient
          </Button>
        </a>
      </div>

      <TableView
        data={data}
        isFetching={isFetching}
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
