import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { categoryCollection } from '@/db/collections'

export function CategoriesPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ category: categoryCollection }))

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof data>[number]>(h => [
        h.display({
          id: 'number',
          maxSize: 40,
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),

        h.accessor('name', {
          header: 'Category Name',
          cell: info => <span className='font-semibold text-foreground'>{info.getValue()}</span>,
        }),
      ]),
    [],
  )

  return (
    <div className='px-4 grow flex flex-col gap-2'>
      <MultiView<NonNullable<typeof data>[number]>
        label='Product Categories'
        description='Organize your menu offerings, inventory items, and modifiers for streamlined POS navigation.'
        data={data}
        isFetching={isLoading}
        views={{
          list: [{ type: 'table', columns }],
        }}
      />
    </div>
  )
}
