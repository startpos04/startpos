import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'
import { getColumns } from '@startpos-core/components/custom/data-view'
import { MultiView } from '@startpos-core/components/custom/data-view/multi-view'
import { locationCollection } from '@startpos-core/db/collections'

export function LocationsPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ location: locationCollection }))

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
          header: 'Location Name',
          cell: info => <span className='font-semibold text-foreground'>{info.getValue()}</span>,
        }),

        h.accessor('description', {
          header: 'Description',
          cell: info => <span className='text-xs text-muted-foreground'>{info.getValue() || '—'}</span>,
        }),

        h.accessor('contact', {
          header: 'Contact Info',
          cell: info => <span className='font-mono text-xs text-foreground'>{info.getValue() || '—'}</span>,
        }),

        h.accessor('address', {
          header: 'Specific Address',
          cell: info => <span className='text-xs text-foreground'>{info.getValue() || '—'}</span>,
        }),
      ]),
    [],
  )

  return (
    <div className='px-4 grow flex flex-col gap-2'>
      <MultiView<NonNullable<typeof data>[number]>
        label='Store Locations'
        description='Manage physical warehouses, retail fronts, and fulfillment centers across your distribution network.'
        data={data}
        isFetching={isLoading}
        views={{
          list: [{ type: 'table', columns }],
        }}
      />
    </div>
  )
}
