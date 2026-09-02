import Tab from '@platform/components/custom/tab'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { orderCollection, orderItemCollection, paymentCollection, transactionCollection, userCollection } from '@platform/db/collections'
import { useIsOnline } from '@platform/hooks/use-is-online'
import dayjs from '@platform/lib/dayjs'
import { cn } from '@platform/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ClipboardList, X } from 'lucide-react'
import type { OrderStatus, OrderType } from 'prisma/generated/prisma/enums'
import { useMemo } from 'react'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { MountProps } from '@/lib/mount-manager'
import { fetchOrderHistory, type OrderHistoryItem } from '@/lib/server-fn/fetch-order-history'
import { closeOrderHistorySidebar } from '../-components/order-history-sidebar'
import { DetailsTab } from './-details-tab'
import { ItemsTab } from './-items-tab'

// â”€â”€â”€ Route â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const Route = createFileRoute('/(private)/(dashboard)/order-history/$orderId/')({
  loader: ({ params }) => ({ orderId: params.orderId }),
  component: () => <RouteComponent />,
})

// â”€â”€â”€ Sidebar export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface OrderDetailsSidebarProps extends MountProps {
  order: OrderHistoryItem
}

interface RouteComponentProps {
  order?: OrderHistoryItem
  onClose?: () => void
}

export function OrderDetailsSidebar({ open: _open, order, onClose }: OrderDetailsSidebarProps) {
  return <RouteComponent order={order} onClose={onClose} />
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RouteComponent({ order: propOrder, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context â€” used inside MountManager or route component
  const loaderData = propOrder ? null : Route.useLoaderData()
  const orderId = propOrder ? null : (loaderData?.orderId ?? '')
  const isOnline = useIsOnline()

  const today = dayjs().format('YYYY-MM-DD')
  const startOfYear = dayjs().startOf('year').format('YYYY-MM-DD')

  // Online: Use server function to fetch order
  const { data: onlineResult, isLoading: onlineLoading } = useQuery({
    queryKey: ['order-detail-route', orderId],
    queryFn: () => fetchOrderHistory({ from: startOfYear, to: today, page: 1, pageSize: 9999 }),
    enabled: !!orderId && !propOrder && isOnline,
  })

  // Offline: Use collections to fetch order
  const offlineOrder = useMemo(() => {
    if (isOnline || !orderId || propOrder) return null

    const ord = orderCollection.get(orderId)
    if (!ord) return null

    const items = [...orderItemCollection.values()]
      .filter(i => i.orderId === ord.id)
      .map(item => ({
        ...item,
        variant: null as any, // Skip deep variant/product joins offline
        selectedAddons: [],
      }))

    const transaction = ord.transactionId ? transactionCollection.get(ord.transactionId) : null
    const cashier = transaction?.cashierId ? userCollection.get(transaction.cashierId) : null
    const payments = transaction ? [...paymentCollection.values()].filter(p => p.transactionId === transaction.id) : []

    return {
      ...ord,
      items,
      transaction: transaction
        ? {
            ...transaction,
            cashier: cashier ? { id: cashier.id, name: cashier.name } : null,
            payments,
          }
        : null,
    } as OrderHistoryItem
  }, [isOnline, orderId, propOrder])

  const order = propOrder ?? (isOnline ? onlineResult?.data?.find(o => o.id === orderId) : offlineOrder)
  const isLoading_ = propOrder ? false : isOnline ? onlineLoading : false

  const handleClose = () => {
    if (onClose) onClose()
    else closeOrderHistorySidebar()
  }

  if (isLoading_)
    return (
      <div className='p-6 space-y-3 animate-pulse'>
        <div className='h-12 bg-muted rounded-xl' />
        <div className='h-48 bg-muted rounded-xl' />
      </div>
    )

  if (!order)
    return (
      <div className='flex flex-col items-center justify-center h-full gap-3 text-muted-foreground'>
        <ClipboardList className='size-8 opacity-30' />
        <p className='text-sm'>Order not found.</p>
      </div>
    )

  const totalAmount = order.transaction?.totalAmount
  const itemCount = order.items.length

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2.5'>
          <div className='h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0'>
            <ClipboardList className='size-4 text-primary' />
          </div>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight font-mono'>{order.orderNumber}</h2>
              <Badge variant={STATUS_VARIANTS[order.status]} className='text-[10px] py-0 h-4 capitalize'>
                {order.status.toLowerCase()}
              </Badge>
            </div>
            <p className='text-xs text-muted-foreground mt-0.5'>
              {ORDER_TYPE_LABELS[order.orderType]} Â· {dayjs(order.createdAt).format('MMM DD, YYYY HH:mm')}
            </p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Stats row */}
      <div className='flex items-center gap-4 px-4 py-2.5 border-b bg-muted/20 shrink-0'>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Items</p>
          <p className='text-sm font-black'>{itemCount}</p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total</p>
          <p className={cn('text-sm font-black font-mono', totalAmount != null ? 'text-primary' : 'text-muted-foreground')}>
            {totalAmount != null ? PriceEngine.format(totalAmount) : 'â€”'}
          </p>
        </div>
        {order.customerReference && (
          <>
            <div className='w-px h-6 bg-border' />
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Ref</p>
              <p className='text-sm font-bold truncate max-w-20'>{order.customerReference}</p>
            </div>
          </>
        )}
        <div className='w-px h-6 bg-border' />
        <div>
          <Badge variant='outline' className='text-[10px]'>
            {ORDER_TYPE_LABELS[order.orderType]}
          </Badge>
        </div>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <Tab
          defaultValue='Items'
          tabs={[
            { label: 'Items', Component: ItemsTab, order },
            { label: 'Details', Component: DetailsTab, order },
          ]}
        />
      </div>
    </div>
  )
}
