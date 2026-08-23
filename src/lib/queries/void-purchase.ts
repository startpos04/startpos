import { PurchaseStatus } from 'prisma/generated/prisma/enums'
import { inventoryCollection, inventoryMovementCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import { getInventoryMode } from '@/lib/inventory'
import { authStore } from '@/store/auth-store'

/**
 * Voids a purchase order — mirrors the refund pattern from createPosRefund.
 * - Marks the purchase as voided (does NOT delete it)
 * - Delegates all inventory reversal to InventoryEngine.applyPurchaseVoid
 */
export const voidPurchase = async (purchaseId: string) => {
  const { user } = authStore.state

  const result = await dbTransaction(() => {
    const purchase = purchaseCollection.get(purchaseId)
    if (!purchase) throw new Error('Purchase not found')
    // D6: guard on status field; retain notes-prefix check during transition window
    if (purchase.status === PurchaseStatus.VOIDED || purchase.notes?.startsWith('[VOIDED]')) {
      throw new Error('Purchase is already voided')
    }

    // Get all line items for this purchase
    const items = [...purchaseItemCollection.values()].filter(i => i.purchaseId === purchaseId)

    // Get inventory movements linked to this purchase (to know which batches were affected)
    const movementsToReverse = [...inventoryMovementCollection.values()]
      .filter(m => m.purchaseId === purchaseId && m.type === 'IN')
      .map(m => ({
        id: m.id,
        variantId: m.variantId,
        inventoryId: m.inventoryId,
        quantity: m.quantity,
        unitId: m.unitId,
        locationId: m.locationId,
      }))

    // 1. Mark purchase as voided — set status field (D6); retain notes prefix for
    //    backward compat with any code that still reads the notes prefix.
    purchaseCollection.update(purchaseId, draft => {
      draft.status = PurchaseStatus.VOIDED
      draft.notes = `[VOIDED] ${draft.notes ?? ''}`
    })

    // 2. Delegate all inventory reversal to InventoryEngine (single owner)
    InventoryEngine.applyPurchaseVoid({
      purchaseId,
      purchaseIdDisplay: purchase.purchaseId,
      items: items.map(i => ({
        variantId: i.variantId,
        quantity: i.quantity,
        unitId: i.unitId,
      })),
      movementsToReverse,
      inventoryCollection,
      movementCollection: inventoryMovementCollection,
      ctx: {
        userId: user.id,
        branchId: user.branch.id,
        businessId: user.business.id,
      },
      inventoryMode: getInventoryMode(user.business.id),
    })

    return { purchaseId, purchaseNo: purchase.purchaseId }
  })

  if (result.isErr()) {
    console.error('Void purchase failed:', result.error.message)
    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}
