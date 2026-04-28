import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { OverlayProps } from '@/lib/overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Clock, User } from 'lucide-react'
import { useMemo } from 'react'
import { ActiveOrdersHeader } from './-components/header'

interface RouteComponentProps {
  onClose?: (() => void) | undefined
  onCancel?: (() => void) | undefined
}

export const Route = createFileRoute('/(private)/orders/')({
  component: () => (
    <div className='py-6 space-y-6'>
      <ActiveOrdersHeader />
      <RouteComponent />
    </div>
  ),
})

export function ActiveOrdersDialog({ open, onClose, onCancel }: OverlayProps & { onCancel?: () => void }) {
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
  const queryClient = useQueryClient()
  const { data: orders = [], isFetching } = fetchActiveOrders()

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof orders>[number]>(h => [
        h.accessor('orderNumber', { header: 'Order #' }),
        h.accessor('status', { header: 'Status' }),
        h.accessor('createdAt', { header: 'Time' }),
      ]),
    [orders],
  )

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
        isFetching={isFetching}
        columns={columns}
        className='px-4'
        renderCard={row => {
          const order = row.original

          const handleClick = () => {
            onClose?.()
            navigate({ to: '/pos', search: (prev: any) => ({ ...prev, orderId: order.id }) })
          }

          const handleCancel = async () => {
            if (confirm('Are you sure you want to cancel this order?')) {
              await crudAPI.order('update', {
                where: { id: order.id },
                data: { status: 'CANCELLED' },
              })

              onCancel?.()
              await queryClient.invalidateQueries({ queryKey: ['active-orders'] })
            }
          }

          return (
            <Card key={order.id} className='overflow-hidden border-l-4 border-l-primary gap-1'>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='text-lg font-bold'>Order {order.orderNumber}</CardTitle>
                <Badge variant={order.status === 'PREPARING' ? 'default' : 'secondary'}>{order.status}</Badge>
              </CardHeader>

              <CardContent className='space-y-2'>
                <div className='flex items-center text-sm gap-2'>
                  <User className='h-4 w-4 text-muted-foreground' />
                  <span className='font-medium'>{order.customerReference}</span>
                </div>

                <div className='flex items-center text-sm gap-2'>
                  <Clock className='h-4 w-4 text-muted-foreground' />
                  <span>
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <Separator className='my-3' />

                <div className='space-y-2'>
                  {order.items.map(item => (
                    <div key={item.id} className='space-y-1'>
                      <div className='flex justify-between text-sm'>
                        <span className='flex gap-2'>
                          <span className='font-bold text-primary'>{item.quantity}x</span>
                          {[item.variant.product.name, item.variant.name ? `(${item.variant.name})` : ''].filter(Boolean).join(' ')}
                        </span>
                        <span className='text-muted-foreground text-xs'>{PriceEngine.format(item.unitPrice)}</span>
                      </div>
                      {item.selectedAddons && item.selectedAddons.length > 0 && (
                        <div className='ml-7 space-y-0.5 border-l-2 border-muted pl-2'>
                          {item.selectedAddons.map(addon => (
                            <div key={addon.id} className='flex justify-between text-[11px] text-muted-foreground italic'>
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

                <div className='pt-4 space-y-2'>
                  <button
                    className='w-full bg-primary text-primary-foreground py-2 rounded-md font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer'
                    onClick={handleClick}
                  >
                    Pay Now
                  </button>

                  <button
                    className='w-full py-2 text-muted-foreground font-bold hover:text-foreground hover:bg-muted rounded-md cursor-pointer'
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                </div>
              </CardContent>
            </Card>
          )
        }}
      />
    </>
  )
}
