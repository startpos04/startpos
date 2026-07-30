import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ClipboardList, Receipt, X } from 'lucide-react'
import type { OrderStatus, OrderType, PaymentMethod } from 'prisma/generated/prisma/enums'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { MountProps } from '@/lib/mount-manager'
import { fetchOrderHistory, type OrderHistoryItem } from '@/lib/server-fn/fetch-order-history'
import { cn } from '@/lib/utils'
import { closeOrderHistorySidebar } from '../-components/order-history-sidebar'

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)/order-history/$orderId/')({
  loader: ({ params }) => ({ orderId: params.orderId }),
  component: () => <RouteComponent />,
})

// ─── Sidebar export ───────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

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

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  E_WALLET: 'E-Wallet',
  CARD: 'Card',
  CREDIT: 'Credit',
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function ItemsTab({ order }: { order: OrderHistoryItem }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='text-xs font-bold'>Product</TableHead>
          <TableHead className='text-xs font-bold text-right'>Qty</TableHead>
          <TableHead className='text-xs font-bold text-right'>Unit Price</TableHead>
          <TableHead className='text-xs font-bold text-right'>Subtotal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {order.items.length > 0 ? (
          order.items.map(item => (
            <TableRow key={item.id}>
              <TableCell className='py-2'>
                <p className='text-xs font-medium leading-tight'>{item.variant?.product?.name ?? '—'}</p>
                {item.variant?.name && <p className='text-[10px] text-muted-foreground font-mono mt-0.5'>{item.variant.name}</p>}
                {item.variant?.sku && <p className='text-[10px] text-muted-foreground font-mono'>SKU: {item.variant.sku}</p>}
                {item.selectedAddons?.map(addon => (
                  <p key={addon.id} className='text-[10px] text-muted-foreground ml-2 mt-0.5'>
                    + {addon.addon?.product?.name} ({addon.quantity}×)
                  </p>
                ))}
              </TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{item.quantity}</TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{PriceEngine.format(item.unitPrice)}</TableCell>
              <TableCell className='text-right font-mono text-xs font-bold py-2'>{PriceEngine.format(Math.round(item.quantity * item.unitPrice))}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
              No line items recorded.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function DetailsTab({ order }: { order: OrderHistoryItem }) {
  const tx = order.transaction

  return (
    <div className='space-y-3'>
      {/* Order meta */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
        <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Order Info</p>
        <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Order Number</p>
            <p className='font-mono text-xs font-bold text-primary'>{order.orderNumber}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Type</p>
            <p className='text-xs font-medium'>{ORDER_TYPE_LABELS[order.orderType]}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Status</p>
            <Badge variant={STATUS_VARIANTS[order.status]} className='text-[10px] capitalize mt-0.5'>
              {order.status.toLowerCase()}
            </Badge>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Date</p>
            <p className='text-xs font-medium'>{dayjs(order.createdAt).format('MMM DD, YYYY HH:mm')}</p>
          </div>
          {order.customerReference && (
            <div className='col-span-2'>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Customer Reference</p>
              <p className='text-xs font-medium'>{order.customerReference}</p>
            </div>
          )}
        </div>
      </div>

      {/* Linked transaction */}
      {tx ? (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
          <div className='flex items-center gap-1.5'>
            <Receipt className='size-3 text-muted-foreground' />
            <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Transaction</p>
          </div>
          <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Invoice No.</p>
              <p className='font-mono text-xs font-bold text-primary'>{tx.invoiceNo}</p>
            </div>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Cashier</p>
              <p className='text-xs font-medium'>{tx.cashier?.name ?? '—'}</p>
            </div>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total</p>
              <p className='font-mono text-sm font-black text-primary'>{PriceEngine.format(tx.totalAmount)}</p>
            </div>
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Payment</p>
              {tx.payments[0]?.method ? (
                <Badge variant='outline' className='text-[10px] mt-0.5'>
                  {METHOD_LABELS[tx.payments[0].method as PaymentMethod] ?? tx.payments[0].method}
                </Badge>
              ) : (
                <span className='text-xs text-muted-foreground'>—</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className='rounded-xl border border-dashed border-border/50 p-4 text-center'>
          <p className='text-xs text-muted-foreground'>No transaction linked to this order.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function RouteComponent({ order: propOrder, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const loaderData = propOrder ? null : Route.useLoaderData()
  const orderId = propOrder ? null : (loaderData?.orderId ?? '')

  const today = dayjs().format('YYYY-MM-DD')
  const startOfYear = dayjs().startOf('year').format('YYYY-MM-DD')

  // Only fetch when rendered as a standalone route (no prop passed from list page)
  const { data: result, isLoading } = useQuery({
    queryKey: ['order-detail-route', orderId],
    queryFn: () =>
      fetchOrderHistory({
        data: { from: startOfYear, to: today, page: 1, pageSize: 9999 },
      }),
    enabled: !!orderId && !propOrder,
  })

  const order = propOrder ?? result?.data?.find(o => o.id === orderId)
  const isLoading_ = propOrder ? false : isLoading

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
              {ORDER_TYPE_LABELS[order.orderType]} · {dayjs(order.createdAt).format('MMM DD, YYYY HH:mm')}
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
            {totalAmount != null ? PriceEngine.format(totalAmount) : '—'}
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
