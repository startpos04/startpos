import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { customerCollection } from '@/db/collections'

export function CustomersPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ customer: customerCollection }))

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
          header: 'Customer Name',
          cell: info => <span className='font-semibold text-foreground'>{info.getValue()}</span>,
        }),

        h.accessor('email', {
          header: 'Email Address',
          cell: info => <span className='font-mono text-xs text-muted-foreground lowercase'>{info.getValue() || '—'}</span>,
        }),

        h.accessor('phone', {
          header: 'Phone Number',
          cell: info => <span className='font-mono text-xs text-muted-foreground'>{info.getValue() || '—'}</span>,
        }),
      ]),
    [],
  )

  return (
    <MultiView<NonNullable<typeof data>[number]>
      label='Customers'
      description='Manage customer profiles, contact directories, and loyalty segment tracking.'
      data={data}
      isFetching={isLoading}
      className='px-4'
      views={{
        list: [{ type: 'table', columns }],
      }}
    />
  )
}
