import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { getColumns } from '@startpos-core/components/custom/data-view'
import { MultiView } from '@startpos-core/components/custom/data-view/multi-view'
import { RequireAccess } from '@startpos-core/components/custom/guards/require-access'
import { customerCollection } from '@startpos-core/db/collections'
import { Permissions } from '@startpos-core/lib/authorization/permission-keys'
import { Capabilities } from '@startpos-core/lib/entitlement/capability-keys'

export const Route = createFileRoute('/(private)/(dashboard)/business/customers/')({
  component: () => (
    <RequireAccess capability={Capabilities.CUSTOMER_PROFILES} permission={Permissions.BUSINESS_VIEW_CUSTOMERS}>
      <CustomersPage />
    </RequireAccess>
  ),
})

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
    <div className='px-4 grow flex flex-col gap-2'>
      <MultiView<NonNullable<typeof data>[number]>
        label='Customers'
        description='Manage customer profiles and contact directories.'
        data={data}
        isFetching={isLoading}
        views={{
          list: [{ type: 'table', columns }],
        }}
      />
    </div>
  )
}
