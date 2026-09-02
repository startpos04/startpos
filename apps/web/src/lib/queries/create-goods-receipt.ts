/**
 * create-goods-receipt.ts
 *
 * E4: Creates a Goods Receipt Note (GRN) for an APPROVED purchase at PENDING
 * status. This replaces the direct APPROVEDâ†’RECEIVED inventory credit that
 * previously happened inside $purchaseId/index.tsx.
 *
 * The contract (from DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md Part 2):
 *   - Receiving domain owns the GRN lifecycle
 *   - Inventory is only credited when a GRN transitions PENDING â†’ CONFIRMED
 *   - A GRN must reference a valid Purchase Order (INV-08)
 *
 * What this function does:
 *   1. Validates the purchase is in APPROVED status (pre-condition)
 *   2. Builds GRN line items from the PO line items, defaulting receivedQty = orderedQty
 *      (receiver adjusts quantities if there is a discrepancy before confirming)
 *   3. Inserts GoodsReceipt at PENDING status inside dbTransaction
 *   4. Inserts one GoodsReceiptItem per PO line inside the same transaction
 *   5. Does NOT credit inventory â€” that happens in confirm-goods-receipt.ts
 *
 * Backward compat: the quick-receive path (create-purchase.ts â†’ RECEIVED) is
 * completely untouched. This path is only triggered when the user clicks
 * "Receive Goods" on an APPROVED purchase.
 */

import { goodsReceiptCollection, goodsReceiptItemCollection, purchaseCollection, purchaseItemCollection } from '@platform/db/collections'
import { dbTransaction } from '@platform/db/local-db-transaction'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { GoodsReceiptStatus, PurchaseStatus } from 'prisma/generated/prisma/enums'

export interface CreateGoodsReceiptInput {
  /** The purchase (PO) this receipt is for. Must be in APPROVED status. */
  purchaseId: string
  /**
   * Optional override quantities per PO line. Key = purchaseItemId.
   * If not provided for a line, defaults to the PO ordered quantity.
   * receivedQty = 0 is valid (entire line rejected / not delivered).
   */
  lineOverrides?: Record<string, { receivedQty: number; discrepancyNotes?: string }>
  notes?: string | null
}

export const createGoodsReceipt = async (input: CreateGoodsReceiptInput) => {
  const { user } = authStore.state

  const result = await dbTransaction(() => {
    const purchase = purchaseCollection.get(input.purchaseId)
    if (!purchase) throw new Error('Purchase not found')
    if (purchase.status !== PurchaseStatus.APPROVED) {
      throw new Error(`Cannot create a receipt for a purchase in ${purchase.status} status. Purchase must be APPROVED.`)
    }

    const poItems = [...purchaseItemCollection.values()].filter(i => i.purchaseId === input.purchaseId)
    if (poItems.length === 0) throw new Error('Purchase has no line items')

    const receiptId = crypto.randomUUID()
    const now = new Date()

    // 1. Insert the GRN header at PENDING
    goodsReceiptCollection.insert({
      id: receiptId,
      purchaseId: input.purchaseId,
      status: GoodsReceiptStatus.PENDING,
      notes: input.notes ?? null,
      receivedById: user.id,
      businessId: user.business.id,
      branchId: user.branch.id,
      createdAt: now,
      updatedAt: now,
    })

    // 2. Insert one GoodsReceiptItem per PO line
    for (const poItem of poItems) {
      const override = input.lineOverrides?.[poItem.id]
      const receivedQty = override?.receivedQty ?? poItem.quantity

      goodsReceiptItemCollection.insert({
        id: crypto.randomUUID(),
        receiptId,
        purchaseItemId: poItem.id,
        variantId: poItem.variantId,
        unitId: poItem.unitId,
        orderedQty: poItem.quantity,
        receivedQty,
        unitCost: poItem.unitCost,
        discrepancyNotes: override?.discrepancyNotes ?? null,
        businessId: user.business.id,
        branchId: user.branch.id,
      })
    }

    return { receiptId }
  })

  if (result.isErr()) {
    console.error('Create goods receipt failed:', result.error.message)
    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}
