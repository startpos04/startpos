import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge' // Assuming you have a Badge component
import { Button } from '@/components/ui/button'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { showModal } from '@/lib/Overlay'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { createFileRoute } from '@tanstack/react-router'
import { Edit, Package, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { RestockIngredientDialog } from './-components/restock'
import { CreateIngredientDialog } from './create'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/ingredients/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data, isFetching } = fetchIngredients()

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    showModal(CreateIngredientDialog)
  }

  const handleRestock = (ingredient: NonNullable<typeof data>[number]) => {
    showModal(RestockIngredientDialog, { ingredient })
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
          cell: ({ row }) => (
            <div className='flex justify-end gap-2 pr-2'>
              <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full' onClick={() => handleRestock(row.original)}>
                <Edit className='h-4 w-4' />
              </Button>
              <Button variant='ghost' size='icon' className='h-8 w-8 rounded-full text-destructive hover:text-destructive'>
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          ),
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
