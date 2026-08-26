import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { MultiView } from '@/components/custom/data-view/multi-view'
import { RequireAccess } from '@/components/require-access'
import { supplierCollection } from '@/db/collections'
import { Permissions } from '@/lib/authorization/permission-keys'
import { Capabilities } from '@/lib/entitlement/capability-keys'

export const Route = createFileRoute('/(private)/(dashboard)/business/suppliers/')({
  component: () => (
    <RequireAccess capability={Capabilities.MANAGE_SUPPLIERS} permission={Permissions.BUSINESS_VIEW_SUPPLIERS}>
      <SuppliersPage />
    </RequireAccess>
  ),
})

export function SuppliersPage() {
  const { data, isLoading } = useLiveQuery(q => q.from({ supplier: supplierCollection }))

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
          header: 'Supplier Name',
          cell: info => <span className='font-semibold text-foreground'>{info.getValue()}</span>,
        }),

        h.accessor('taxId', {
          header: 'TIN / Tax ID',
          cell: info => <span className='font-mono text-xs text-foreground'>{info.getValue() || '—'}</span>,
        }),

        h.accessor('contactNo', {
          header: 'Contact Number',
          cell: info => <span className='font-mono text-xs text-muted-foreground'>{info.getValue() || '—'}</span>,
        }),

        h.accessor('email', {
          header: 'Email Address',
          cell: info => <span className='font-mono text-xs text-muted-foreground lowercase'>{info.getValue() || '—'}</span>,
        }),
      ]),
    [],
  )

  return (
    <div className='px-4 grow flex flex-col gap-2'>
      <MultiView<NonNullable<typeof data>[number]>
        label='Suppliers'
        description='Manage procurement vendors, supply channels, and external distribution partners.'
        data={data}
        isFetching={isLoading}
        views={{
          list: [{ type: 'table', columns }],
        }}
      />
    </div>
  )
}
