import type { Transaction } from '@tanstack/db'
import { SequenceType } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { orderCollection, orderItemAddonCollection, orderItemCollection } from '@/db/collections'
import { authStore } from '@/store/auth-store'
import type { PosProduct } from '../conversion/inventory-engine'
import type { CreateSaleInput } from '../server-fn/create-pos-transaction'
import { fetchStructuredId } from './fetch-structured-id'

export const createPosOrder = async (data: CreateSaleInput, posOrders: PosProduct[]) => {
  const { user } = authStore.state
  const productIds = data.items.map(item => item.productId)
  const dbProducts = posOrders.filter(p => productIds.includes(p.id)) as PosProduct[]
  const results: Record<string, Transaction<Record<string, unknown>>> = {}

  try {
    const orderId = data.orderId || crypto.randomUUID()
    const exists = orderCollection.has(orderId)

    if (exists) {
      // UPDATE EXISTING ORDER
      results['order'] = await orderCollection.update(orderId, draft => {
        draft.customerReference = data.customerReference || 'Walk-in Guest'
      })
      await results['order'].isPersisted.promise

      // Get all Item IDs belonging to this order
      const itemsInOrder = [...orderItemCollection.values()].filter(i => i.orderId === orderId)
      const itemIds = itemsInOrder.map(i => i.id)

      if (itemIds.length > 0) {
        // Find all Addon IDs that link to these items
        const addonIdsToDelete = [...orderItemAddonCollection.values()].filter(addon => itemIds.includes(addon.orderItemId)).map(addon => addon.id)

        // Delete Addons by IDs
        if (addonIdsToDelete.length > 0) {
          results['orderItemAddon'] = await orderItemAddonCollection.delete(addonIdsToDelete)
          await results['orderItemAddon'].isPersisted.promise
        }

        // Delete Items by IDs
        results['orderItem'] = await orderItemCollection.delete(itemIds)
        await results['orderItem'].isPersisted.promise
      }
    } else {
      // --- 2. PREPARE DATA STRUCTURES ---
      const orderNumber = await fetchStructuredId(SequenceType.ORDER)

      // INSERT NEW ORDER
      results['order'] = await orderCollection.insert({
        id: orderId,
        orderNumber,
        status: 'PENDING',
        orderType: 'DINE_IN',
        customerReference: data.customerReference || 'Walk-in Guest',
        organizationId: user.organization.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      })
      await results['order'].isPersisted.promise
    }

    // CREATE ITEMS & ADDONS ---
    for (const item of data.items) {
      const product = dbProducts.find(p => p.id === item.productId)!
      const variant = product.variants.find(v => v.id === item.variantId)!
      const itemId = crypto.randomUUID()

      results['orderItem'] = await orderItemCollection.insert({
        id: itemId,
        orderId: orderId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: Number(variant.price),
        unitCost: Number(variant.costPrice || 0),
        unitId: product.baseUnitId,
        organizationId: user.organization.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      })
      await results['orderItem'].isPersisted.promise

      if (item.addons.length > 0) {
        const addonsToInsert = item.addons.map(a => {
          const comp = variant.components.find(c => c.id === a.id)!
          return {
            id: crypto.randomUUID(),
            orderItemId: itemId,
            addonId: comp.materialId,
            quantity: a.quantityUsed,
            priceAtSale: Number(comp.priceOverride || 0),
            costAtSale: Number(comp.material.costPrice || 0),
            organizationId: user.organization.id,
            branchId: user.branch.id,
            updatedAt: new Date(),
            createdAt: new Date(),
          }
        })
        results['orderItemAddon'] = await orderItemAddonCollection.insert(addonsToInsert)
        await results['orderItemAddon'].isPersisted.promise
      }
    }

    // Return the "Order" with items attached (simulating Prisma's include)
    const finalOrder = [...orderCollection.values()].find(o => o.id === orderId)
    return {
      data: {
        ...finalOrder,
        items: [...orderItemCollection.values()].find(i => i.orderId === orderId),
      },
    }
  } catch (error) {
    await Promise.all(Object.values(results).map(r => r.rollback()))

    console.error('Transaction failed:', error)
    toast.error('Failed to add order. Please try again.')

    return null
  }
}

type CreatePosOrderFn = typeof createPosOrder
export type CreatePosOrderResponse = Awaited<ReturnType<CreatePosOrderFn>>
