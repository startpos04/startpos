import { getColumns } from '@platform/components/custom/data-view'
import { MultiView } from '@platform/components/custom/data-view/multi-view'
import { Badge } from '@platform/components/ui/badge'
import dayjs from '@platform/lib/dayjs'
import { Capabilities } from '@platform/lib/entitlement/capability-keys'
import MountManager from '@platform/lib/mount-manager'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { getAuthenticatedUser } from '@/lib/better-auth/auth-store'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { type fePurchase, fetchPurchases } from '@/lib/queries/fetch-purchases'
import { getPurchaseStatusUIMetadata } from '@/lib/server-fn/purchase-workflow'
import { closePurchaseSidebar, PURCHASE_ASIDE_ID, showPurchaseSidebar } from './-components/purchase-sidebar'
import { PurchaseDetailsSidebar } from './$purchaseId'
import { CreatePurchaseSidebar } from './create/-index'

export const Route = createFileRoute('/(private)/(dashboard)/purchases/')({
  component: RouteComponent,
  beforeLoad: () => {
    const user = getAuthenticatedUser()
    if (!user.entitlement.capabilities.includes(Capabilities.CREATE_PURCHASE)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
})

function RouteComponent() {
  const { data: purchases = [], isLoading } = fetchPurchases()
  const [selectedId, setSelectedId] = useState<string>('')

  const handleAdd = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setSelectedId('')
    showPurchaseSidebar(<CreatePurchaseSidebar />)
  }

  const handleSelectRow = useCallback((purchase: fePurchase) => {
    setSelectedId(purchase.id)
    showPurchaseSidebar(
      <PurchaseDetailsSidebar
        open
        purchaseId={purchase.id}
        onClose={() => {
          setSelectedId('')
          closePurchaseSidebar()
        }}
      />,
    )
  }, [])

  const columns = useMemo(
    () =>
      getColumns<fePurchase>(h => [
        h.display({
          id: 'number',
          maxSize: 50,
          header: 'No.',
          cell: info => <span className='text-xs font-mono text-muted-foreground/50'>{(info.row.index + 1).toString().padStart(2, '0')}</span>,
        }),

        h.accessor('purchaseId', {
          header: 'Purchase ID',
          cell: info => <span className='font-mono text-xs font-bold text-primary'>{info.getValue()}</span>,
        }),

        h.display({
          id: 'supplier',
          header: 'Supplier',
          cell: ({ row }) => <span className='font-medium text-sm'>{row.original.supplier?.name ?? '—'}</span>,
        }),

        h.display({
          id: 'items',
          header: 'Items',
          cell: ({ row }) => (
            <Badge variant='secondary' className='text-[10px]'>
              {row.original.items.length} line{row.original.items.length !== 1 ? 's' : ''}
            </Badge>
          ),
        }),

        h.accessor('totalCost', {
          header: 'Total Cost',
          cell: info => <span className='font-mono font-bold text-sm'>{PriceEngine.format(info.getValue())}</span>,
        }),

        h.accessor('createdAt', {
          header: 'Date',
          cell: info => <span className='text-xs text-muted-foreground'>{dayjs(info.getValue()).format('MMM DD, YYYY')}</span>,
        }),

        h.display({
          id: 'status',
          header: 'Status',
          cell: ({ row }) => {
            const { label, colorClass } = getPurchaseStatusUIMetadata(row.original.status)
            return (
              <Badge variant='outline' className={`text-[10px] ${colorClass}`}>
                {label}
              </Badge>
            )
          },
        }),

        h.display({
          id: 'notes',
          header: 'Reference',
          cell: ({ row }) => {
            const notes = row.original.notes?.replace(/^\[(VOIDED|DELETED)\]\s*/i, '') || null
            return <span className='text-xs text-muted-foreground truncate max-w-48 block'>{notes ?? '—'}</span>
          },
        }),
      ]),
    [],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden bg-background/50 space-y-2'>
        <MultiView<fePurchase>
          label='Purchases'
          description='Track supplier purchases and inventory receipts.'
          data={purchases}
          isFetching={isLoading}
          creatable={{ label: 'New Purchase', href: '#', onAdd: handleAdd }}
          views={{
            list: [
              {
                type: 'table',
                columns,
                selectableRow: {
                  onClick: handleSelectRow,
                  isSelected: row => row.id === selectedId,
                },
              },
            ],
          }}
        />
      </div>

      <MountManager id={PURCHASE_ASIDE_ID} />
    </div>
  )
}
