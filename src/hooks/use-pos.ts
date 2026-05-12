import { uuid } from '@tanstack/react-form'
import { useMemo } from 'react'
import type { PosProduct, posItem } from '@/lib/conversion/inventory-engine'
import { type ActiveOrder, fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { fetchPosProducts } from '@/lib/queries/fetch-pos-products'

export const getOrderItems = (activeOrders: ActiveOrder[], posProducts: PosProduct[], orderId?: string): posItem[] => {
  return activeOrders
    .filter(o => orderId !== o.id)
    .flatMap(o => {
      return o.items
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
        .filter((item): item is posItem => item !== null)
    })
}

export function usePOS(orderId?: string, searchQuery?: string) {
  const { data: posProducts = [], isLoading: isLoadingPosProducts } = fetchPosProducts(searchQuery)
  const { data: activeOrders = [], isLoading: isLoadingActiveOrders } = fetchActiveOrders()

  const orderItems = useMemo(() => {
    if (isLoadingPosProducts || isLoadingActiveOrders) return []
    return getOrderItems(activeOrders, posProducts, orderId)
  }, [isLoadingPosProducts, isLoadingActiveOrders, orderId, activeOrders, posProducts])

  return { orderItems, posProducts, activeOrders, isLoading: isLoadingPosProducts || isLoadingActiveOrders }
}
