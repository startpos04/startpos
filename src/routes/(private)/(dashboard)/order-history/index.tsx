import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate, useSearch } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import { OrderStatus, type OrderType } from 'prisma/generated/prisma/enums'
import { useCallback, useMemo, useState } from 'react'
import { getColumns } from '@/components/custom/data-view'
import { TableView } from '@/components/custom/data-view/table-view'
import { type DateRange, DateRangeInput } from '@/components/custom/form/date-rage-input'
import { OfflineIndicator } from '@/components/custom/offline-indicator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { orderCollection, orderItemCollection, paymentCollection, transactionCollection, userCollection } from '@/db/collections'
import { useIsOnline } from '@/hooks/use-is-online'
import { orderCols } from '@/lib/columns/order-columns'
import dayjs from '@/lib/dayjs'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import MountManager from '@/lib/mount-manager'
import { fetchOrderHistory, type OrderHistoryItem } from '@/lib/server-fn/fetch-order-history'
import { authStore } from '@/lib/better-auth/auth-store'
import { closeOrderHistorySidebar, ORDER_HISTORY_ASIDE_ID, showOrderHistorySidebar } from './-components/order-history-sidebar'
import { OrderDetailsSidebar } from './$orderId'

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Dine In',
  TAKEOUT: 'Takeout',
  DELIVERY: 'Delivery',
}

export const Route = createFileRoute('/(private)/(dashboard)/order-history/')({
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
  const searchParams = useSearch({ from: '/(private)/(dashboard)/order-history/' })
  const navigate = useNavigate({ from: Route.fullPath })
  const [selectedId, setSelectedId] = useState<string>('')
  const isOnline = useIsOnline()

  const { from, to, status, orderType, page, pageSize } = searchParams

  // Online: Use server function for optimal performance
  const { data: onlineResult, isLoading: onlineLoading } = useQuery({
    queryKey: ['order-history', searchParams],
    queryFn: () => fetchOrderHistory(searchParams),
    enabled: isOnline,
  })

  // Offline: Use collections with basic filtering
  const offlineData = useMemo(() => {
    if (isOnline) return null

    const fromDate = dayjs(from).startOf('day').toDate()
    const toDate = dayjs(to).endOf('day').toDate()

    // Get all orders and filter by date range
    let filtered = [...orderCollection.values()].filter(order => {
      const orderDate = new Date(order.createdAt)
      return orderDate >= fromDate && orderDate <= toDate
    })

    // Filter by status if specified
    if (status) {
      filtered = filtered.filter(order => order.status === status)
    }

    // Filter by order type if specified
    if (orderType) {
      filtered = filtered.filter(order => order.orderType === orderType)
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Limit to 200 most recent orders for offline viewing
    const limited = filtered.slice(0, 200)

    // Paginate
    const paginated = limited.slice((page - 1) * pageSize, page * pageSize)

    // Enrich with related data
    const enriched: OrderHistoryItem[] = paginated.map(order => {
      const items = [...orderItemCollection.values()]
        .filter(i => i.orderId === order.id)
        .map(item => ({
          ...item,
          variant: null as any, // Skip deep variant/product joins offline
          selectedAddons: [],
        }))

      const transaction = order.transactionId ? transactionCollection.get(order.transactionId) : null
      const cashier = transaction?.cashierId ? userCollection.get(transaction.cashierId) : null
      const payments = transaction ? [...paymentCollection.values()].filter(p => p.transactionId === transaction.id) : []

      return {
        ...order,
        items,
        transaction: transaction
          ? {
              ...transaction,
              cashier: cashier ? { id: cashier.id, name: cashier.name } : null,
              payments,
            }
          : null,
      } as OrderHistoryItem
    })

    return {
      data: enriched,
      totalItems: Math.min(limited.length, 200), // Cap at 200 for pagination
      page,
      pageSize,
      isOfflineMode: true,
    }
  }, [isOnline, from, to, status, orderType, page, pageSize])

  const result = isOnline ? onlineResult : offlineData
  const orders = result?.data ?? []
  const totalItems = result?.totalItems ?? 0
  const isLoading = isOnline ? onlineLoading : false

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
        orderCols.paginatedNumber(h, { page, pageSize }),
        orderCols.orderNumber(h),
        orderCols.status(h),
        orderCols.orderType(h),
        orderCols.customerReference(h),
        orderCols.itemsCount(h),
        orderCols.invoiceNumber(h),
        orderCols.transactionTotal(h),
        orderCols.date(h),
      ]),
    [page, pageSize],
  )

  return (
    <div className='w-full h-screen bg-background flex overflow-hidden relative min-h-0 flex-1'>
      <div className='flex-1 min-w-0 h-full px-4 flex flex-col overflow-hidden transition-all duration-300 ease-in-out bg-background/50 space-y-2'>
        {/* Offline Indicator */}
        <OfflineIndicator message='Viewing cached orders (up to 200 most recent). Search filter unavailable offline.' />

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
