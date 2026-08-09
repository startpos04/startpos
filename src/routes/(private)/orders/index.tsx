import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Ban, CheckCheck, ChevronDown, Clock, CreditCard, DollarSign, Play, SquarePen, Undo2, User } from 'lucide-react'
import { OrderStatus } from 'prisma/generated/prisma/browser'
import { toast } from 'sonner'
import { GridView } from '@/components/custom/data-view/grid-view'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { useSubscriptionGate } from '@/components/feature-disabled'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { orderCollection } from '@/db/collections'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import MountManager, { type MountProps } from '@/lib/mount-manager'
import { createPosRefund } from '@/lib/queries/create-pos-refund'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'
import { ActiveOrdersHeader } from './-components/header'

const statusVariants: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  [OrderStatus.PENDING]: 'outline',
  [OrderStatus.PREPARING]: 'default',
  [OrderStatus.SERVED]: 'secondary',
  [OrderStatus.CANCELLED]: 'destructive',
}

interface RouteComponentProps {
  onClose?: (() => void) | undefined
  onCancel?: (() => void) | undefined
}

export const Route = createFileRoute('/(private)/orders/')({
  component: OrdersPageGate,
  beforeLoad: () => {
    const { user } = authStore.state
    if (!user?.entitlement?.capabilities?.includes(Capabilities.CREATE_ORDER)) {
      throw redirect({ to: '/unauthorized' })
    }
  },
})

function OrdersPageGate() {
  const gate = useSubscriptionGate()
  if (gate) return gate

  return (
    <div className='py-6 space-y-6'>
      <ActiveOrdersHeader />
      <RouteComponent />
    </div>
  )
}

export function ActiveOrdersDialog({ open, onClose, onCancel }: MountProps & { onCancel?: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-7xl p-0 overflow-hidden border-none shadow-2xl'>
        <div className='py-6 gap-6 flex flex-col h-[80vh]'>
          <RouteComponent onClose={onClose} onCancel={onCancel} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose, onCancel }: RouteComponentProps) {
  const navigate = useNavigate()
  const { data: orders = [], isLoading } = fetchActiveOrders()

  return (
    <>
      <div className='flex justify-between items-center px-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Active Orders</h1>
          <p className='text-muted-foreground'>Manage and track ongoing kitchen preparation.</p>
        </div>
        <Badge variant='outline' className='text-primary border-primary px-3 py-1'>
          {orders.length} Running
        </Badge>
      </div>

      <GridView<NonNullable<typeof orders>[number]>
        data={orders}
        isFetching={isLoading}
        className='px-4'
        renderCard={row => {
          const order = row.original

          // BACK TO PENDING STATUS
          const handlePending = async () => {
            try {
              orderCollection.update(order.id, draft => {
                draft.status = OrderStatus.PENDING
              })
              toast.success('Order marked as pending')
            } catch (error) {
              console.error('Transaction failed:', error)
              toast.error('Failed to update order. Please try again.')
            }
          }

          // PREPARE ORDER
          const handlePrepare = async () => {
            try {
              orderCollection.update(order.id, draft => {
                draft.status = OrderStatus.PREPARING
              })

              toast.success('Order marked as preparing')
            } catch (error) {
              console.error('Transaction failed:', error)
              toast.error('Failed to update order. Please try again.')
            }
          }

          // MARK AS SERVED
          const handleServe = async () => {
            MountManager.show(WarningPrompt, {
              title: 'Mark as Served',
              description: 'Are you sure you want to mark this order as served?',
              onConfirm: async () => {
                try {
                  orderCollection.update(order.id, draft => {
                    draft.status = OrderStatus.SERVED
                  })

                  toast.success('Order marked as served')
                  return true
                } catch (error) {
                  console.error('Transaction failed:', error)
                  toast.error('Failed to update order. Please try again.')
                }
                return false
              },
            })
          }

          // PAY NOW
          const handlePay = () => {
            if (order.status !== 'SERVED') return
            onClose?.()
            navigate({ to: '/pos', search: prev => ({ ...prev, orderId: order.id }) })
          }

          // Cancel Order
          const handleCancel = async () => {
            MountManager.show(WarningPrompt, {
              title: 'Cancel Order',
              description: 'Are you sure you want to cancel this order?',
              onConfirm: async () => {
                try {
                  orderCollection.update(order.id, draft => {
                    draft.status = 'CANCELLED'
                  })

                  toast.success('Order cancelled successfully')
                  onCancel?.()
                  return true
                } catch (error) {
                  console.error('Transaction failed:', error)
                  toast.error('Failed to cancel order. Please try again.')
                }
                return false
              },
            })
          }

          // Cancel Order
          const handleRefund = () => {
            MountManager.show(WarningPrompt, {
              title: 'Refund Order',
              description: 'Are you sure you want to refund this order?',
              onConfirm: async () => {
                const tx = order.transaction
                if (!tx) {
                  toast.error('No transaction found for this order.')
                  return false
                }

                const result = await createPosRefund({
                  id: tx.id,
                  invoiceNo: tx.invoiceNo,
                  totalAmount: tx.totalAmount,
                  totalCost: tx.totalCost,
                  taxAmount: tx.taxAmount,
                  discount: tx.discount,
                  bufferRate: ((tx as Record<string, unknown>)['bufferRate'] as number) ?? 0,
                  priceConfiguration: ((tx as Record<string, unknown>)['priceConfiguration'] as string) ?? 'INCLUSIVE',
                  invoiceType: ((tx as Record<string, unknown>)['invoiceType'] as string) ?? 'SALES_INVOICE',
                  cashierId: tx.cashierId,
                  orderId: tx.orderId,
                  buyerName: tx.buyerName ?? null,
                  complianceData: tx.complianceData as import('@/lib/types').TransactionComplianceData,
                  payments: [], // orders page doesn't have payment detail — omit
                  taxLines: [], // orders page doesn't have tax line detail — omit
                })

                if (result.error) {
                  toast.error('Failed to process refund. Please try again.')
                  return false
                }

                return true
              },
            })
          }

          return (
            <Card key={order.id} className='overflow-hidden border-l-4 border-l-primary gap-1'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='font-bold'>Order {order.orderNumber}</CardTitle>
                <Badge variant={statusVariants[order.status]}>{order.status}</Badge>
              </CardHeader>

              <CardContent className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <User className='text-muted-foreground' />
                  <span className='text-xs font-medium'>{order.customerReference}</span>
                </div>

                <div className='flex items-center gap-2'>
                  <Clock className='text-muted-foreground' />
                  <span className='text-xs'>
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className='flex items-center gap-2'>
                  <DollarSign className='text-muted-foreground' />
                  <span className={cn('font-bold text-xs', order.transaction ? 'text-primary' : 'text-amber-600')}>
                    {order.transaction ? 'PAID' : 'UNPAID'}
                  </span>
                </div>

                <Separator className='my-3' />

                <div className='space-y-2'>
                  {order.items.map(item => (
                    <div key={item.id} className='space-y-1'>
                      <div className='flex justify-between text-xs'>
                        <span className='flex gap-2'>
                          <span className='font-bold text-primary'>{item.quantity}x</span>
                          {[item.variant.product?.name, item.variant.name ? `(${item.variant.name})` : ''].filter(Boolean).join(' ')}
                        </span>
                        <span className='text-muted-foreground'>{PriceEngine.format(item.unitPrice)}</span>
                      </div>
                      {item.selectedAddons && item.selectedAddons.length > 0 && (
                        <div className='ml-7 space-y-0.5 border-l-2 border-muted pl-2'>
                          {item.selectedAddons.map(addon => (
                            <div key={addon.id} className='flex justify-between text-[10px] text-muted-foreground italic'>
                              <span>
                                + {addon.quantity} {addon.addon.product.name} {addon.addon.name ? `(${addon.addon.name})` : ''}
                              </span>
                              {addon.priceAtSale > 0 && <span>₱{(addon.priceAtSale / 100).toFixed(2)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className='pt-4'>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='outline' className='w-full flex justify-between items-center font-bold'>
                        Actions
                        <ChevronDown className='h-4 w-4 opacity-50' />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align='end' className='w-50'>
                      <DropdownMenuLabel>Manage Order</DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      {/* REVERT/BACK TO PENDING STATUS */}
                      {!['PENDING', 'SERVED'].includes(order.status) && (
                        <DropdownMenuItem onClick={handlePending}>
                          <Undo2 className='mr-2 h-4 w-4' />
                          <span>Back to Pending</span>
                        </DropdownMenuItem>
                      )}

                      {/* PREPARE ORDER */}
                      {order.status === OrderStatus.PENDING && (
                        <DropdownMenuItem onClick={handlePrepare}>
                          <Play className='mr-2 h-4 w-4 text-primary' />
                          <span>Prepare Order</span>
                        </DropdownMenuItem>
                      )}

                      {/* MARK AS SERVED */}
                      {order.status === OrderStatus.PREPARING && (
                        <DropdownMenuItem onClick={handleServe}>
                          <CheckCheck className='mr-2 h-4 w-4 text-blue-600' />
                          <span>Mark as Served</span>
                        </DropdownMenuItem>
                      )}

                      {/* PAY NOW */}
                      {!order.transaction && order.status !== OrderStatus.PENDING && (
                        <DropdownMenuItem onClick={handlePay}>
                          <CreditCard className='mr-2 h-4 w-4 text-green-600' />
                          <span>Pay Now</span>
                        </DropdownMenuItem>
                      )}

                      {/* UPDATE ORDER */}
                      {!order.transaction && order.status === OrderStatus.PENDING && (
                        <DropdownMenuItem onClick={handlePay}>
                          <SquarePen className='mr-2 h-4 w-4 text-green-600' />
                          <span>Update Order</span>
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      {/* DESTRUCTIVE ACTIONS REFUND/CANCEL */}
                      {order.status === OrderStatus.PENDING ? (
                        <DropdownMenuItem
                          onClick={order.transaction ? handleRefund : handleCancel}
                          className='text-destructive focus:text-destructive focus:bg-destructive/10'
                        >
                          {order.transaction ? (
                            <>
                              <Undo2 className='mr-2 h-4 w-4' /> Refund Order
                            </>
                          ) : (
                            <>
                              <Ban className='mr-2 h-4 w-4' /> Cancel Order
                            </>
                          )}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          )
        }}
      />
    </>
  )
}
