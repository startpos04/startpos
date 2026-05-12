import { SequenceType } from 'prisma/generated/prisma/enums'
import type { z } from 'zod'
import { inventoryCollection, inventoryMovementCollection, productVariantCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
import { authStore } from '@/store/auth-store'
import type { restockSchema } from '../server-fn/restock-ingredient'
import { fetchStructuredId } from './fetch-structured-id'

export const restockIngredient = async (data: z.infer<typeof restockSchema>) => {
  const { user } = authStore.state

  // --- 1. CREATE PURCHASE RECORD ---
  const purchaseId = crypto.randomUUID()
  const structuredPurchaseId = await fetchStructuredId(SequenceType.PURCHASE)

  await purchaseCollection.insert({
    id: purchaseId,
    purchaseId: structuredPurchaseId,
    sourceName: data.sourceName || 'Manual Restock',
    totalCost: Math.round(data.unitCost * data.quantity),
    notes: data.reason,
    organizationId: user.organization.id,
    branchId: user.branch.id,
    updatedAt: new Date(),
    createdAt: new Date(),
  })

  // Create the line item for the purchase
  await purchaseItemCollection.insert({
    id: crypto.randomUUID(),
    purchaseId: purchaseId,
    variantId: data.variantId,
    quantity: data.quantity,
    unitId: data.unitId,
    unitCost: data.unitCost,
    organizationId: user.organization.id,
    branchId: user.branch.id,
  })

  // --- 2. UPDATE VARIANT REFERENCE COST ---
  if (productVariantCollection.has(data.variantId)) {
    await productVariantCollection.update(data.variantId, draft => {
      draft.costPrice = data.unitCost
    })
  }

  // --- 3. UPSERT INVENTORY BATCH ---
  // Find if a batch already exists for this variant + batchNumber
  const existingBatch = [...inventoryCollection.values()].find(i => i.variantId === data.variantId && i.batchNumber === data.batchNumber)

  let inventoryId: string

  if (existingBatch) {
    inventoryId = existingBatch.id
    await inventoryCollection.update(inventoryId, draft => {
      draft.quantity += data.quantity
      draft.costPrice = data.unitCost
      draft.lastRestocked = new Date()
    })
  } else {
    inventoryId = crypto.randomUUID()
    await inventoryCollection.insert({
      id: inventoryId,
      variantId: data.variantId,
      quantity: data.quantity,
      unitId: data.unitId,
      batchNumber: data.batchNumber || 'DEFAULT',
      costPrice: data.unitCost,
      location: data.location,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      lastRestocked: new Date(),
      organizationId: user.organization.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })
  }

  // --- 4. CREATE AUDIT TRAIL (MOVEMENT) ---
  const movementId = crypto.randomUUID()
  await inventoryMovementCollection.insert({
    id: movementId,
    variantId: data.variantId,
    inventoryId: inventoryId,
    userId: user?.id,
    quantity: data.quantity,
    unitId: data.unitId,
    type: 'IN',
    reason: `${data.reason || 'Restock'}: ${structuredPurchaseId}`,
    targetBranchId: null,
    organizationId: user.organization.id,
    branchId: user.branch.id,
    updatedAt: new Date(),
    createdAt: new Date(),
  })

  // --- 5. RETURN HYDRATED DATA ---
  return {
    data: {
      success: true,
      purchase: {
        ...purchaseCollection.get(purchaseId),
        items: [...purchaseItemCollection.values()].filter(i => i.purchaseId === purchaseId),
      },
      inventory: inventoryCollection.get(inventoryId),
      movement: inventoryMovementCollection.get(movementId),
    },
  }
}
