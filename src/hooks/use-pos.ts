import { posItem, PosProduct } from '@/lib/conversion/inventory-engine'
import { ActiveOrder, fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { fetchPosProducts } from '@/lib/queries/fetch-pos-products'
import { uuid } from '@tanstack/react-form'
import { useMemo } from 'react'

export const getOrderItems = (activeOrders: ActiveOrder[], posProducts: PosProduct[], orderId?: string) =>
  activeOrders.reduce((arr, o) => {
    if (orderId === o.id) return arr
    const items = o.items
      .map(item => {
        const product = posProducts.find(p => p.id === item.variant.productId)
        if (!product) return null
        const variant = product.variants.find(v => v.id === item.variantId)
        if (!variant) return null
        const addons = item.selectedAddons.map(a => variant.components.find(c => c.isAddon && c.materialId === a.addonId)).filter(Boolean)

        return {
          cartId: uuid(),
          product,
          variant,
          quantity: item.quantity,
          addons,
        }
      })
      .filter(Boolean) as posItem[]
    return [...arr, ...items]
  }, [] as posItem[])

export function usePOS(orderId?: string, searchQuery?: string) {
  const { data: posProducts = [], isFetching: isFetchingPosProducts } = fetchPosProducts(searchQuery)
  const { data: activeOrders = [], isFetching: isFetchingActiveOrders } = fetchActiveOrders()

  const orderItems = useMemo(() => {
    if (isFetchingPosProducts || isFetchingActiveOrders) return []
    return getOrderItems(activeOrders, posProducts, orderId)
  }, [isFetchingPosProducts, isFetchingActiveOrders, orderId])

  return { orderItems, posProducts, activeOrders, isLoading: isFetchingPosProducts || isFetchingActiveOrders }
}
