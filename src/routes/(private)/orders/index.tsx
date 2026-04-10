import { getColumns } from '@/components/custom/data-view'
import GridView from '@/components/custom/data-view/grid-view'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { OverlayProps } from '@/lib/overlay'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Clock, User } from 'lucide-react'
import { useMemo } from 'react'
import { ActiveOrdersHeader } from './-components/header'

export const Route = createFileRoute('/(private)/orders/')({
  component: () => (
    <div className='py-6 space-y-6'>
      <ActiveOrdersHeader />
      <RouteComponent />
    </div>
  ),
})

export function ActiveOrdersDialog({ open, onClose }: OverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-7xl p-0 overflow-hidden border-none shadow-2xl'>
        <div className='py-6 gap-6 flex flex-col h-[80vh]'>
          <RouteComponent onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RouteComponent({ onClose }: { onClose?: () => void }) {
  const { data: orders = [], isFetching } = fetchActiveOrders()
  const navigate = useNavigate()

  const columns = useMemo(
    () =>
      getColumns<NonNullable<typeof orders>[number]>(h => [
        h.accessor('orderNumber', { header: 'Order #' }),
        h.accessor('status', { header: 'Status' }),
        h.accessor('createdAt', { header: 'Time' }),
      ]),
    [orders],
  )

  const handleClick = (orderId: string) => {
    onClose?.()
    navigate({ to: '/pos', search: (prev: any) => ({ ...prev, orderId }) })
  }

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
          return (
            <button key={order.id} onClick={() => handleClick(order.id)} className='w-full cursor-pointer'>
              <Card className='overflow-hidden border-l-4 border-l-primary'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                  <CardTitle className='text-lg font-bold'>Order #{order.orderNumber}</CardTitle>
                  <Badge variant={order.status === 'PREPARING' ? 'default' : 'secondary'}>{order.status}</Badge>
                </CardHeader>

                <CardContent className='space-y-4'>
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

                  <Separator />

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

                  <div className='pt-2'>
                    <button className='w-full bg-primary text-primary-foreground py-2 rounded-md font-semibold text-sm hover:opacity-90 transition-opacity'>
                      Mark as Served
                    </button>
                  </div>
                </CardContent>
              </Card>
            </button>
          )
        }}
      />
    </>
  )
}
