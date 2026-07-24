import { SequenceType } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { inventoryCollection, inventoryMovementCollection, productVariantCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
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

    // Create the line item for the purchase
    purchaseItemCollection.insert({
      id: crypto.randomUUID(),
      purchaseId: purchaseId,
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

    // --- 3. UPSERT INVENTORY BATCH ---
    // Find if a batch already exists for this variant + batchNumber
    const existingBatch = [...inventoryCollection.values()].find(i => i.variantId === data.variantId && i.batchNumber === data.batchNumber)

    let inventoryId: string

    if (existingBatch) {
      inventoryId = existingBatch.id
      inventoryCollection.update(inventoryId, draft => {
        draft.quantity += data.quantity
        draft.costPrice = data.unitCost
        draft.lastRestocked = new Date()
      })
    } else {
      inventoryId = crypto.randomUUID()
      inventoryCollection.insert({
        id: inventoryId,
        variantId: data.variantId,
        quantity: data.quantity,
        unitId: data.unitId,
        batchNumber: data.batchNumber || 'DEFAULT',
        costPrice: data.unitCost,
        locationId: data.locationId,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        lastRestocked: new Date(),
        businessId: user.business.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      })
    }

    // --- 4. CREATE AUDIT TRAIL (MOVEMENT) ---
    const movementId = crypto.randomUUID()
    inventoryMovementCollection.insert({
      id: movementId,
      variantId: data.variantId,
      inventoryId: inventoryId,
      userId: user?.id,
      quantity: data.quantity,
      unitId: data.unitId,
      type: 'IN',
      reason: `${data.reason || 'Restock'}: ${structuredPurchaseId}`,
      transactionId: null,
      targetBranchId: null,
      purchaseId,
      locationId: data.locationId,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
      operationalTaskId: null,
    })

    return {
      success: true,
      purchase: {
        ...purchaseCollection.get(purchaseId),
        items: [...purchaseItemCollection.values()].filter(i => i.purchaseId === purchaseId),
      },
      inventory: inventoryCollection.get(inventoryId),
      movement: inventoryMovementCollection.get(movementId),
    }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)
    return { data: false, error: result.error }
  }

  // --- 5. RETURN HYDRATED DATA ---
  return {
    data: result.value,
  }
}
