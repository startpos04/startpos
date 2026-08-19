import { OrderStatus, OrderType, SequenceType } from 'prisma/generated/prisma/enums'
import { orderCollection, orderItemAddonCollection, orderItemCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/store/auth-store'
import type { CreateSaleInput } from './create-pos-transaction'
import type { posProduct } from './fetch-pos-products'
import { fetchStructuredId } from './fetch-structured-id'

export const createPosOrder = async (data: CreateSaleInput, posOrders: posProduct[]) => {
  const { user } = authStore.state
  const productIds = data.items.map(item => item.product.id)
  const dbProducts = posOrders.filter(p => productIds.includes(p.id)) as posProduct[]

  const orderId = data.orderId || crypto.randomUUID()
  const exists = orderCollection.has(orderId)

  const result = await dbTransaction(() => {
    if (exists) {
      // UPDATE EXISTING ORDER
      orderCollection.update(orderId, draft => {
        draft.customerReference = data.customer.customerReference || 'Walk-in Guest'
      })

      // Get all Item IDs belonging to this order
      const itemsInOrder = [...orderItemCollection.values()].filter(i => i.orderId === orderId)
      const itemIds = itemsInOrder.map(i => i.id)

      if (itemIds.length > 0) {
        // Find all Addon IDs that link to these items
        const addonIdsToDelete = [...orderItemAddonCollection.values()].filter(addon => itemIds.includes(addon.orderItemId)).map(addon => addon.id)

        // Delete Addons by IDs
        if (addonIdsToDelete.length > 0) {
          orderItemAddonCollection.delete(addonIdsToDelete)
        }

        // Delete Items by IDs
        orderItemCollection.delete(itemIds)
      }
    } else {
      // --- 2. PREPARE DATA STRUCTURES ---
      const orderNumber = fetchStructuredId(SequenceType.ORDER)

      // INSERT NEW ORDER
      orderCollection.insert({
        id: orderId,
        orderNumber,
        status: OrderStatus.PENDING,
        orderType: OrderType.DINE_IN,
        customerReference: data.customer.customerReference || 'Walk-in Guest',
        businessId: user.business.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      })
    }

    // CREATE ITEMS & ADDONS ---
    for (const item of data.items) {
      const product = dbProducts.find(p => p.id === item.product.id)!
      const variant = product.variants.find(v => v.id === item.variant.id)!
      const itemId = crypto.randomUUID()

      orderItemCollection.insert({
        id: itemId,
        orderId: orderId,
        variantId: item.variant.id,
        quantity: item.quantity,
        unitPrice: Number(variant.price),
        unitCost: Number(variant.costPrice || 0),
        unitId: product.baseUnitId,
        // 📸 PHASE 1 SNAPSHOTS: Capture product/variant/category data at time of order
        snapshotProductName: product.name,
        snapshotVariantName: variant.name,
        snapshotCategoryName: product.category.name,
        snapshotSku: variant.sku,
        snapshotProductType: product.type,
        snapshotProductImage: variant.image || product.image,
        // 📸 PHASE 2 SNAPSHOTS: Capture unit & tax data at time of order
        snapshotUnitName: product.baseUnit.name,
        snapshotUnitAbbrev: product.baseUnit.abbreviation,
        snapshotUnitType: product.baseUnit.type,
        snapshotTaxCategory: variant.taxCategory,
        businessId: user.business.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      })

      if (item.addons.length > 0) {
        const addonsToInsert = item.addons.map(a => {
          const comp = variant.components.find(c => c.id === a.id)!
          return {
            id: crypto.randomUUID(),
            orderItemId: itemId,
            addonId: comp.materialId,
            quantity: a.quantityUsed,
            snapshotUnitPrice: Number(comp.priceOverride || 0),
            snapshotUnitCost: Number(comp.material.costPrice || 0),
            // 📸 PHASE 1 SNAPSHOTS: Capture addon details at time of order
            snapshotAddonProductName: comp.material.product.name,
            snapshotAddonVariantName: comp.material.name,
            snapshotAddonSku: comp.material.sku,
            // 📸 PHASE 2 SNAPSHOTS: Capture addon unit & tax at time of order
            snapshotAddonUnitName: comp.unit.name,
            snapshotAddonUnitAbbrev: comp.unit.abbreviation,
            snapshotAddonTaxCategory: comp.material.taxCategory,
            businessId: user.business.id,
            branchId: user.branch.id,
            updatedAt: new Date(),
            createdAt: new Date(),
          }
        })
        orderItemAddonCollection.insert(addonsToInsert)
      }
    }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)
  }

  return { data: true }
}
