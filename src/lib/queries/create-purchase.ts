import { SequenceType } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { inventoryCollection, inventoryMovementCollection, productVariantCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
// inventoryCollection + inventoryMovementCollection are passed to InventoryEngine — kept for the pass-through
import { dbTransaction } from '@/db/local-db-transaction'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import { authStore } from '@/store/auth-store'
import { fetchStructuredId } from './fetch-structured-id'

export const createPurchaseLineSchema = z.object({
  variantId: z.string().min(1, 'Item required'),
  quantity: z.number().positive('Must be > 0'),
  unitId: z.string().min(1, 'Unit required'),
  unitCost: z.number().nonnegative('Cost must be ≥ 0'),
})

export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier required'),
  notes: z.string().optional().nullable(),
  items: z.array(createPurchaseLineSchema).min(1, 'Add at least one item'),
})

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>

export const createPurchase = async (data: CreatePurchaseInput) => {
  const { user } = authStore.state

  const result = await dbTransaction(() => {
    const purchaseId = crypto.randomUUID()
    const structuredId = fetchStructuredId(SequenceType.PURCHASE)
    const totalCost = data.items.reduce((sum, i) => sum + Math.round(i.unitCost * i.quantity), 0)

    // 1. Create the purchase header
    purchaseCollection.insert({
      id: purchaseId,
      purchaseId: structuredId,
      supplierId: data.supplierId,
      totalCost,
      notes: data.notes || null,
      operationalTaskId: null,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })

    for (const item of data.items) {
      // 2. Create purchase line items
      purchaseItemCollection.insert({
        id: crypto.randomUUID(),
        purchaseId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitId: item.unitId,
        unitCost: item.unitCost,
        businessId: user.business.id,
        branchId: user.branch.id,
      })

      // 3. Update variant reference cost
      if (productVariantCollection.has(item.variantId)) {
        productVariantCollection.update(item.variantId, draft => {
          draft.costPrice = item.unitCost
        })
      }
    }

    // 4. Delegate all inventory mutations to InventoryEngine (single owner)
    InventoryEngine.applyPurchaseReceipt({
      purchaseId,
      structuredId,
      items: data.items.map(i => ({
        variantId: i.variantId,
        quantity: i.quantity,
        unitId: i.unitId,
        unitCost: i.unitCost,
      })),
      inventoryCollection,
      movementCollection: inventoryMovementCollection,
      ctx: {
        userId: user.id,
        branchId: user.branch.id,
        businessId: user.business.id,
      },
    })

    return { purchaseId, structuredId }
  })

  if (result.isErr()) {
    console.error('Create purchase failed:', result.error.message)
    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}
