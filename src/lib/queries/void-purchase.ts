import { inventoryCollection, inventoryMovementCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/store/auth-store'

/**
 * Voids a purchase order — mirrors the refund pattern from createPosRefund.
 * - Marks the purchase as voided (does NOT delete it)
 * - Creates negative OUT inventory movements for each line item
 * - Decrements inventory batch quantities
 */
export const voidPurchase = async (purchaseId: string) => {
  const { user } = authStore.state

  const result = await dbTransaction(() => {
    const purchase = purchaseCollection.get(purchaseId)
    if (!purchase) throw new Error('Purchase not found')
    if (purchase.notes?.startsWith('[VOIDED]')) throw new Error('Purchase is already voided')

    // Get all line items for this purchase
    const items = [...purchaseItemCollection.values()].filter(i => i.purchaseId === purchaseId)

    // Get inventory movements linked to this purchase (to know which batches were affected)
    const movements = [...inventoryMovementCollection.values()].filter(m => m.purchaseId === purchaseId && m.type === 'IN')

    // 1. Mark purchase as voided
    purchaseCollection.update(purchaseId, draft => {
      draft.notes = `[VOIDED] ${draft.notes ?? ''}`
    })

    // 2. Reverse each movement — subtract from the inventory batch it added to
    for (const movement of movements) {
      // Decrement the inventory batch
      if (inventoryCollection.has(movement.inventoryId)) {
        inventoryCollection.update(movement.inventoryId, draft => {
          draft.quantity = Math.max(0, draft.quantity - movement.quantity)
        })
      }

      // Create a corresponding OUT movement as the audit trail
      inventoryMovementCollection.insert({
        id: crypto.randomUUID(),
        variantId: movement.variantId,
        inventoryId: movement.inventoryId,
        userId: user?.id,
        quantity: movement.quantity,
        unitId: movement.unitId,
        type: 'OUT',
        reason: `Void: ${purchase.purchaseId}`,
        transactionId: null,
        targetBranchId: null,
        purchaseId,
        locationId: movement.locationId,
        businessId: user.business.id,
        branchId: user.branch.id,
        updatedAt: new Date(),
        createdAt: new Date(),
        operationalTaskId: null,
      })
    }

    // Fallback: if no movements were recorded, still decrement via line items directly
    if (movements.length === 0) {
      for (const item of items) {
        // Find any inventory batch for this variant + purchase
        const batch = [...inventoryCollection.values()].find(i => i.variantId === item.variantId && i.batchNumber === `PO-${purchase.purchaseId}`)
        if (!batch) continue

        inventoryCollection.update(batch.id, draft => {
          draft.quantity = Math.max(0, draft.quantity - item.quantity)
        })

        inventoryMovementCollection.insert({
          id: crypto.randomUUID(),
          variantId: item.variantId,
          inventoryId: batch.id,
          userId: user?.id,
          quantity: item.quantity,
          unitId: item.unitId,
          type: 'OUT',
          reason: `Void: ${purchase.purchaseId}`,
          transactionId: null,
          targetBranchId: null,
          purchaseId,
          locationId: user.branch.id,
          businessId: user.business.id,
          branchId: user.branch.id,
          updatedAt: new Date(),
          createdAt: new Date(),
          operationalTaskId: null,
        })
      }
    }

    return { purchaseId, purchaseNo: purchase.purchaseId }
  })

  if (result.isErr()) {
    console.error('Void purchase failed:', result.error.message)
    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}
