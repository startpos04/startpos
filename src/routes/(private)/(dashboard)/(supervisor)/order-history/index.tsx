import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useSearch } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import { OrderStatus, type OrderType } from 'prisma/generated/prisma/enums'
import { useCallback, useMemo, useState } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { type DateRange, DateRangeInput } from '@/components/custom/form/date-rage-input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import MountManager from '@/lib/mount-manager'
import { fetchOrderHistory, type OrderHistoryItem } from '@/lib/server-fn/fetch-order-history'
import { closeOrderHistorySidebar, ORDER_HISTORY_ASIDE_ID, showOrderHistorySidebar } from './-components/order-history-sidebar'
import { OrderDetailsSidebar } from './$orderId'

const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  PREPARING: 'default',
  SERVED: 'secondary',
  CANCELLED: 'destructive',
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Dine In',
  TAKEOUT: 'Takeout',
  DELIVERY: 'Delivery',
}

import { Capabilities } from '@/lib/entitlement/capability-keys'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/order-history/')({
  beforeLoad: () => {
    const { user } = authStore.state
    if (!user?.entitlement?.capabilities?.includes(Capabilities.VIEW_ORDER_HISTORY)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    from: (search['from'] as string) || dayjs().startOf('month').format('YYYY-MM-DD'),
    to: (search['to'] as string) || dayjs().endOf('month').format('YYYY-MM-DD'),
    status: (search['status'] as OrderStatus) ?? undefined,
    orderType: (search['orderType'] as OrderType) ?? undefined,
    search: (search['search'] as string) ?? undefined,
    page: Number(search['page']) || 1,
    pageSize: Number(search['pageSize']) || 50,
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const searchParams = useSearch({ from: '/(private)/(dashboard)/(supervisor)/order-history/' })
  const navigate = useNavigate({ from: Route.fullPath })
  const [selectedId, setSelectedId] = useState<string>('')

  const { from, to, status, orderType, page, pageSize } = searchParams

  const { data: result, isLoading } = useQuery({
    queryKey: ['order-history', searchParams],
    queryFn: () => fetchOrderHistory(searchParams),
  })

  const orders = result?.data ?? []
  const totalItems = result?.totalItems ?? 0

  const handleSelectRow = useCallback((order: OrderHistoryItem) => {
    setSelectedId(order.id)
    showOrderHistorySidebar(
      <OrderDetailsSidebar
        open
        order={order}
        onClose={() => {
          setSelectedId('')
          closeOrderHistorySidebar()
        }}
      />,
    )
  }, [])

  const handleDateChange = (range: DateRange) => {
    if (!range) return
    navigate({
      search: prev => ({
        ...prev,
        from: range.from ? dayjs(range.from).format('YYYY-MM-DD') : dayjs().startOf('month').format('YYYY-MM-DD'),
        to: range.to ? dayjs(range.to).format('YYYY-MM-DD') : dayjs().endOf('month').format('YYYY-MM-DD'),
        page: 1,
      }),
    })
  }

  const columns = useMemo(
    () =>
      getColumns<OrderHistoryItem>(h => [
        h.display({
          id: 'number',
          maxSize: 50,
          header: 'No.',
          cell: info => (
            <span className='text-xs font-mono text-muted-foreground/50'>{((page - 1) * pageSize + info.row.index + 1).toString().padStart(2, '0')}</span>
          ),
        }),
        h.accessor('orderNumber', {
          header: 'Order No.',
          cell: info => <span className='font-mono text-xs font-bold text-primary'>{info.getValue()}</span>,
        }),
        h.accessor('status', {
          header: 'Status',
          maxSize: 110,
          cell: info => (
            <Badge variant={STATUS_VARIANTS[info.getValue()]} className='text-[10px] capitalize'>
              {info.getValue().toLowerCase()}
            </Badge>
          ),
        }),
        h.accessor('orderType', {
          header: 'Type',
          maxSize: 100,
          cell: info => (
            <Badge variant='outline' className='text-[10px]'>
              {ORDER_TYPE_LABELS[info.getValue()]}
            </Badge>
          ),
        }),
        h.accessor('customerReference', {
          header: 'Reference',
          cell: info => <span className='text-sm text-muted-foreground'>{info.getValue() ?? '—'}</span>,
        }),
        h.display({
          id: 'items',
          header: 'Items',
          maxSize: 70,
          cell: ({ row }) => (
            <Badge variant='secondary' className='text-[10px]'>
              {row.original.items.length} line{row.original.items.length !== 1 ? 's' : ''}
            </Badge>
          ),
        }),
        h.display({
          id: 'invoice',
          header: 'Invoice',
          cell: ({ row }) => <span className='font-mono text-xs text-muted-foreground'>{row.original.transaction?.invoiceNo ?? '—'}</span>,
        }),
        h.display({
          id: 'total',
          header: 'Total',
          cell: ({ row }) => {
            const total = row.original.transaction?.totalAmount
            return total != null ? (
              <span className='font-mono font-bold text-sm'>{PriceEngine.format(total)}</span>
            ) : (
              <span className='text-muted-foreground text-xs'>—</span>
            )
          },
        }),
        h.accessor('createdAt', {
          header: 'Date',
          cell: info => <span className='text-xs text-muted-foreground'>{dayjs(info.getValue()).format('MMM DD, YYYY HH:mm')}</span>,
        }),
      ]),
    [page, pageSize],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full p-4 pt-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        {/* Header */}
        <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight text-foreground flex items-center gap-2'>
              <ClipboardList className='h-7 w-7 text-primary' />
              Order History
            </h1>
            <p className='text-muted-foreground text-sm'>Complete record of all orders and their outcomes.</p>
          </div>
        </div>

        {/* Filters */}
        <div className='flex flex-wrap items-center gap-2'>
          <DateRangeInput
            value={{ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }}
            onChange={handleDateChange}
            placeholder='Date range'
          />
          <Select
            value={status ?? 'all'}
            onValueChange={val => navigate({ search: prev => ({ ...prev, status: val === 'all' ? undefined : (val as OrderStatus), page: 1 }) })}
          >
            <SelectTrigger className='h-8 w-36 text-xs'>
              <SelectValue placeholder='All statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All statuses</SelectItem>
              {Object.values(OrderStatus).map(s => (
                <SelectItem key={s} value={s} className='capitalize'>
                  {s.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={orderType ?? 'all'}
            onValueChange={val => navigate({ search: prev => ({ ...prev, orderType: val === 'all' ? undefined : (val as OrderType), page: 1 }) })}
          >
            <SelectTrigger className='h-8 w-36 text-xs'>
              <SelectValue placeholder='All types' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All types</SelectItem>
              {Object.entries(ORDER_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TableView
          data={orders}
          isFetching={isLoading}
          columns={columns}
          emptyMessage='No orders found for the selected filters.'
          selectableRow={{
            onClick: handleSelectRow,
            isSelected: row => row.id === selectedId,
          }}
          paginable={{
            pageIndex: page - 1,
            pageSize,
            totalItems,
            onPaginationChange: next => {
              navigate({
                search: prev => ({ ...prev, page: next.pageIndex + 1, pageSize: next.pageSize }),
                replace: true,
              })
            },
          }}
        />
      </div>

      <MountManager id={ORDER_HISTORY_ASIDE_ID} />
    </div>
  )
}
