import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Calendar, Clock, Package, TrendingDown, TrendingUp } from 'lucide-react'
import numeral from 'numeral'
import { ProductionStatus } from 'prisma/generated/prisma/enums'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { productionOrderCollection, productionOrderItemCollection, productVariantCollection } from '@/db/collections'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/preparation/history')({
  component: RouteComponent,
})

type FilterStatus = 'ALL' | ProductionStatus

function RouteComponent() {
  const user = useStore(authStore, state => state.user)
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  // Get all production orders for this branch
  const productionOrders = useMemo(() => {
    const orders = [...productionOrderCollection.values()]
      .filter(o => o.branchId === user.branch.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    if (statusFilter === 'ALL') {
      return orders
    }

    return orders.filter(o => o.status === statusFilter)
  }, [user.branch.id, statusFilter])

  // Get selected order details
  const selectedOrder = selectedOrderId ? productionOrderCollection.get(selectedOrderId) : null
  const selectedOrderItems = selectedOrder ? [...productionOrderItemCollection.values()].filter(item => item.productionOrderId === selectedOrderId) : []

  const getStatusBadge = (status: ProductionStatus) => {
    const variants: Record<ProductionStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      [ProductionStatus.DRAFT]: { variant: 'outline', label: 'Draft' },
      [ProductionStatus.IN_PROGRESS]: { variant: 'default', label: 'In Progress' },
      [ProductionStatus.COMPLETED]: { variant: 'secondary', label: 'Completed' },
      [ProductionStatus.CANCELLED]: { variant: 'destructive', label: 'Cancelled' },
    }

    const config = variants[status]
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const formatDuration = (start: Date | null, end: Date | null) => {
    if (!start || !end) return 'N/A'
    const durationMs = new Date(end).getTime() - new Date(start).getTime()
    const minutes = Math.floor(durationMs / (1000 * 60))
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    return `${minutes}m`
  }

  return (
    <div className='w-full min-h-screen bg-background p-6 space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Production History</h1>
          <p className='text-muted-foreground mt-1'>View past preparation batches and material consumption</p>
        </div>
        <Button variant='outline' onClick={() => window.history.back()}>
          Back to Preparation
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex gap-4'>
            <div className='w-64'>
              <label className='text-sm font-medium mb-2 block'>Status</label>
              <Select value={statusFilter} onValueChange={value => setStatusFilter(value as FilterStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>All Statuses</SelectItem>
                  <SelectItem value={ProductionStatus.DRAFT}>Draft</SelectItem>
                  <SelectItem value={ProductionStatus.IN_PROGRESS}>In Progress</SelectItem>
                  <SelectItem value={ProductionStatus.COMPLETED}>Completed</SelectItem>
                  <SelectItem value={ProductionStatus.CANCELLED}>Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Production Orders List */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Production Orders</CardTitle>
            <CardDescription>
              {productionOrders.length} {statusFilter === 'ALL' ? 'total' : statusFilter.toLowerCase()} order{productionOrders.length !== 1 && 's'}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-2 max-h-[600px] overflow-y-auto'>
            {productionOrders.length === 0 ? (
              <div className='text-center py-8 text-muted-foreground'>No production orders found</div>
            ) : (
              productionOrders.map(order => {
                const variant = productVariantCollection.get(order.targetVariantId)
                const isSelected = selectedOrderId === order.id

                return (
                  <div
                    key={order.id}
                    className={cn(
                      'p-4 rounded-lg border cursor-pointer transition-colors',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent',
                    )}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <div className='flex items-start justify-between mb-2'>
                      <div>
                        <h4 className='font-semibold'>{order.orderNumber}</h4>
                        <p className='text-sm text-muted-foreground'>{variant?.name || 'Unknown Product'}</p>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className='grid grid-cols-2 gap-2 text-sm mt-2'>
                      <div>
                        <span className='text-muted-foreground'>Target:</span> <span className='font-medium'>{order.targetQuantity}</span>
                      </div>
                      {order.actualQuantity !== null && (
                        <div>
                          <span className='text-muted-foreground'>Actual:</span> <span className='font-medium'>{order.actualQuantity}</span>
                        </div>
                      )}
                    </div>

                    <div className='flex items-center gap-4 mt-2 text-xs text-muted-foreground'>
                      <div className='flex items-center gap-1'>
                        <Calendar className='w-3 h-3' />
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                      {order.startedAt && order.completedAt && (
                        <div className='flex items-center gap-1'>
                          <Clock className='w-3 h-3' />
                          {formatDuration(order.startedAt, order.completedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Order Details */}
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
            <CardDescription>{selectedOrder ? `${selectedOrder.orderNumber} details` : 'Select an order to view details'}</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedOrder ? (
              <div className='text-center py-16 text-muted-foreground'>
                <Package className='w-12 h-12 mx-auto mb-4 opacity-40' />
                <p>Select a production order to view details</p>
              </div>
            ) : (
              <div className='space-y-6'>
                {/* Status and Timeline */}
                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm font-medium'>Status</span>
                    {getStatusBadge(selectedOrder.status)}
                  </div>

                  <div className='grid grid-cols-2 gap-4 text-sm'>
                    <div>
                      <span className='text-muted-foreground block mb-1'>Created</span>
                      <span className='font-medium'>{new Date(selectedOrder.createdAt).toLocaleString()}</span>
                    </div>
                    {selectedOrder.startedAt && (
                      <div>
                        <span className='text-muted-foreground block mb-1'>Started</span>
                        <span className='font-medium'>{new Date(selectedOrder.startedAt).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedOrder.completedAt && (
                      <div>
                        <span className='text-muted-foreground block mb-1'>Completed</span>
                        <span className='font-medium'>{new Date(selectedOrder.completedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Production Details */}
                <div className='space-y-3'>
                  <h4 className='font-semibold'>Production Details</h4>

                  <div className='p-4 rounded-lg border bg-muted/50 space-y-2'>
                    <div className='flex justify-between'>
                      <span className='text-sm text-muted-foreground'>Target Quantity</span>
                      <span className='font-medium'>{selectedOrder.targetQuantity}</span>
                    </div>
                    {selectedOrder.actualQuantity !== null && (
                      <>
                        <div className='flex justify-between'>
                          <span className='text-sm text-muted-foreground'>Actual Quantity</span>
                          <span className='font-medium'>{selectedOrder.actualQuantity}</span>
                        </div>
                        {selectedOrder.actualQuantity !== selectedOrder.targetQuantity && (
                          <div className='flex justify-between items-center'>
                            <span className='text-sm text-muted-foreground'>Variance</span>
                            <span
                              className={cn(
                                'font-medium flex items-center gap-1',
                                selectedOrder.actualQuantity < selectedOrder.targetQuantity ? 'text-orange-600' : 'text-green-600',
                              )}
                            >
                              {selectedOrder.actualQuantity < selectedOrder.targetQuantity ? (
                                <TrendingDown className='w-4 h-4' />
                              ) : (
                                <TrendingUp className='w-4 h-4' />
                              )}
                              {Math.abs(selectedOrder.actualQuantity - selectedOrder.targetQuantity)} (
                              {(((selectedOrder.actualQuantity - selectedOrder.targetQuantity) / selectedOrder.targetQuantity) * 100).toFixed(1)}%)
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {selectedOrder.usesRecipe && (
                      <div className='flex justify-between'>
                        <span className='text-sm text-muted-foreground'>Total Cost</span>
                        <span className='font-medium'>{PriceEngine.format(selectedOrder.totalCost)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Material Consumption (Recipe-based only) */}
                {selectedOrder.usesRecipe && selectedOrderItems.length > 0 && (
                  <div className='space-y-3'>
                    <h4 className='font-semibold'>Material Consumption</h4>
                    <div className='space-y-2'>
                      {selectedOrderItems.map(item => {
                        const material = productVariantCollection.get(item.materialVariantId)
                        return (
                          <div key={item.id} className='flex items-center justify-between p-3 rounded-lg border bg-card'>
                            <div>
                              <p className='font-medium text-sm'>{material?.name || 'Unknown'}</p>
                              <p className='text-xs text-muted-foreground'>Cost: {PriceEngine.format(item.unitCost)} per unit</p>
                            </div>
                            <div className='text-right'>
                              <p className='font-medium'>{item.quantityUsed}</p>
                              <p className='text-xs text-muted-foreground'>{PriceEngine.format(Math.round(item.unitCost * item.quantityUsed))} total</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedOrder.notes && (
                  <div className='space-y-2'>
                    <h4 className='font-semibold'>Notes</h4>
                    <p className='text-sm text-muted-foreground whitespace-pre-wrap'>{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
