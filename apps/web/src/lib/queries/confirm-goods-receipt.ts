/**
 * confirm-goods-receipt.ts
 *
 * E5: Confirms a PENDING GRN (PENDING â†’ CONFIRMED) and triggers inventory
 * credit via InventoryEngine.applyPurchaseReceipt.
 *
 * This is the point at which INV-01 is satisfied:
 *   "Inventory cannot exist without a source (GoodsAccepted event)"
 *
 * Business invariants enforced:
 *   - GRN must be in PENDING status (receiptWorkflow.canTransition guard)
 *   - User must be SUPERVISOR or ADMIN (receiptWorkflow guard)
 *   - Inventory is credited using receivedQty (what was physically counted),
 *     not orderedQty (what was on the PO) — satisfying TASK-3 equivalent for receipts
 *   - The parent Purchase advances to RECEIVED after the GRN is confirmed
 *   - Variant reference costs are updated (same as quick-receive path)
 *   - All mutations are atomic inside one dbTransaction
 *
 * Parallel to the quick-receive path in create-purchase.ts — same
 * InventoryEngine.applyPurchaseReceipt call, different trigger point.
 */

import {
  goodsReceiptCollection,
  goodsReceiptItemCollection,
  inventoryCollection,
  inventoryMovementCollection,
  productVariantCollection,
  purchaseCollection,
} from '@platform/db/collections'
import { dbTransaction } from '@platform/db/local-db-transaction'
import { GoodsReceiptStatus, PurchaseStatus } from 'prisma/generated/prisma/enums'
import { getAuthenticatedUser } from '@/lib/better-auth/auth-store'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import { receiptWorkflow } from '@/lib/server-fn/receipt-workflow'

export const confirmGoodsReceipt = async (receiptId: string) => {
  const user = getAuthenticatedUser()

  // Pre-check: workflow guard (same pattern as B1 server-side task transition guard)
  const receipt = goodsReceiptCollection.get(receiptId)
  if (!receipt) return { data: null, error: new Error('Goods receipt not found') }

  const check = receiptWorkflow.canTransition(receipt.status, GoodsReceiptStatus.CONFIRMED, {
    userRole: user.role,
    userId: user.id,
  })
  if (!check.ok) return { data: null, error: new Error(check.reason) }

  const result = await dbTransaction(() => {
    const grn = goodsReceiptCollection.get(receiptId)
    if (!grn) throw new Error('Goods receipt not found')
    if (grn.status !== GoodsReceiptStatus.PENDING) {
      throw new Error(`Cannot confirm a receipt in ${grn.status} status`)
    }

    const grnItems = [...goodsReceiptItemCollection.values()].filter(i => i.receiptId === receiptId)
    if (grnItems.length === 0) throw new Error('Goods receipt has no line items')

    const purchase = purchaseCollection.get(grn.purchaseId)
    if (!purchase) throw new Error('Parent purchase not found')

    // 1. Advance GRN to CONFIRMED
    goodsReceiptCollection.update(receiptId, draft => {
      draft.status = GoodsReceiptStatus.CONFIRMED
      draft.updatedAt = new Date()
    })

    // 2. Credit inventory using receivedQty (actual counted quantity, not PO qty)
    //    Uses the same engine path as the quick-receive flow — single code path.
    InventoryEngine.applyPurchaseReceipt({
      purchaseId: grn.purchaseId,
      structuredId: purchase.purchaseId,
      items: grnItems.map(item => ({
        variantId: item.variantId,
        quantity: item.receivedQty, // actual received, not ordered
        unitId: item.unitId,
        unitCost: item.unitCost,
      })),
      inventoryCollection,
      movementCollection: inventoryMovementCollection,
      ctx: {
        userId: user.id,
        branchId: grn.branchId,
        businessId: grn.businessId,
      },
    })

    // 3. Update variant reference costs (mirrors quick-receive path)
    for (const item of grnItems) {
      if (productVariantCollection.has(item.variantId)) {
        productVariantCollection.update(item.variantId, draft => {
          draft.costPrice = item.unitCost
        })
      }
    }

    // 4. Advance the parent Purchase to RECEIVED
    //    A purchase is RECEIVED when at least one confirmed GRN exists.
    //    Full partial-receipt tracking (PARTIALLY_RECEIVED) is deferred to Phase E4+.
    purchaseCollection.update(grn.purchaseId, draft => {
      draft.status = PurchaseStatus.RECEIVED
      draft.updatedAt = new Date()
    })

    return { receiptId, purchaseId: grn.purchaseId, purchaseNo: purchase.purchaseId }
  })

  if (result.isErr()) {
    console.error('Confirm goods receipt failed:', result.error.message)
    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}

// ---------------------------------------------------------------------------
// Dispute a GRN — marks as DISPUTED, no inventory credit, purchase stays APPROVED
// ---------------------------------------------------------------------------

export const disputeGoodsReceipt = async (receiptId: string, reason?: string) => {
  const user = getAuthenticatedUser()

  const receipt = goodsReceiptCollection.get(receiptId)
  if (!receipt) return { data: null, error: new Error('Goods receipt not found') }

  const check = receiptWorkflow.canTransition(receipt.status, GoodsReceiptStatus.DISPUTED, {
    userRole: user.role,
    userId: user.id,
  })
  if (!check.ok) return { data: null, error: new Error(check.reason) }

  const result = await dbTransaction(() => {
    const grn = goodsReceiptCollection.get(receiptId)
    if (!grn) throw new Error('Goods receipt not found')
    if (grn.status !== GoodsReceiptStatus.PENDING) {
      throw new Error(`Cannot dispute a receipt in ${grn.status} status`)
    }

    goodsReceiptCollection.update(receiptId, draft => {
      draft.status = GoodsReceiptStatus.DISPUTED
      draft.notes = reason ? `[DISPUTED] ${reason}` : draft.notes
      draft.updatedAt = new Date()
    })

    // Purchase stays APPROVED — supplier must resolve and a new GRN will be created
    return { receiptId, purchaseId: grn.purchaseId }
  })

  if (result.isErr()) {
    console.error('Dispute goods receipt failed:', result.error.message)
    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}
