import { SequenceType } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { inventoryCollection, inventoryMovementCollection, productVariantCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import { authStore } from '@/store/auth-store'
import { fetchStructuredId } from './fetch-structured-id'

export const restockSchema = z.object({
  variantId: z.string(),
  quantity: z.number().gt(0),
  unitCost: z.number().gte(0),
  unitId: z.string(),
  reason: z.string().nullable(),
  batchNumber: z.string().optional().default('DEFAULT'),
  expiryDate: z.string().optional().nullable(),
  supplierId: z.string(),
  locationId: z.string(),
})

export const restockIngredient = async (data: z.infer<typeof restockSchema>) => {
  const { user } = authStore.state
  const result = await dbTransaction(() => {
    // --- 1. CREATE PURCHASE RECORD ---
    const purchaseId = crypto.randomUUID()
    const structuredPurchaseId = fetchStructuredId(SequenceType.PURCHASE)

    purchaseCollection.insert({
      id: purchaseId,
      purchaseId: structuredPurchaseId,
      supplierId: data.supplierId,
      totalCost: Math.round(data.unitCost * data.quantity),
      notes: data.reason,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
      operationalTaskId: null,
    })

    purchaseItemCollection.insert({
      id: crypto.randomUUID(),
      purchaseId,
      variantId: data.variantId,
      quantity: data.quantity,
      unitId: data.unitId,
      unitCost: data.unitCost,
      businessId: user.business.id,
      branchId: user.branch.id,
    })

    // --- 2. UPDATE VARIANT REFERENCE COST ---
    if (productVariantCollection.has(data.variantId)) {
      productVariantCollection.update(data.variantId, draft => {
        draft.costPrice = data.unitCost
      })
    }

    // --- 3. Delegate inventory batch upsert + movement to InventoryEngine (single owner) ---
    const inventoryId = InventoryEngine.applyAdjustment({
      variantId: data.variantId,
      batchNumber: data.batchNumber || 'DEFAULT',
      quantity: data.quantity,
      locationId: data.locationId,
      costPrice: data.unitCost,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      unitId: data.unitId,
      purchaseId,
      structuredId: structuredPurchaseId,
      reason: data.reason,
      inventoryCollection,
      movementCollection: inventoryMovementCollection,
      ctx: {
        userId: user.id,
        branchId: user.branch.id,
        businessId: user.business.id,
      },
    })

    return {
      success: true,
      purchase: {
        ...purchaseCollection.get(purchaseId),
        items: [...purchaseItemCollection.values()].filter(i => i.purchaseId === purchaseId),
      },
      inventory: inventoryCollection.get(inventoryId),
    }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)
    return { data: false, error: result.error }
  }

  return { data: result.value }
}
