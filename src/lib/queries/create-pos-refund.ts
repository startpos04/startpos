import { MovementType, SequenceType, type TaxCategory, type TaxLineType, TransactionType } from 'prisma/generated/prisma/enums'
import { inventoryCollection, inventoryMovementCollection, paymentCollection, transactionCollection, transactionTaxLineCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { writeAudit } from '@/lib/queries/write-audit'
import type { TransactionComplianceData } from '@/lib/types'
import { authStore } from '@/store/auth-store'
import { fetchStructuredId } from './fetch-structured-id'

// ---------------------------------------------------------------------------
// TransactionSnapshot
//
// Plain-object snapshot of the original transaction, passed in from the UI.
//
// Root cause of the original "transaction not found" error:
//   transactionCollection is syncMode: 'on-demand'. The transaction detail
//   sidebar is fed via crudAPI (server fetch) — those rows never land in the
//   local collection. Passing the snapshot in from the caller avoids the
//   failed .get() lookup entirely.
//
// Only INSERT operations now use the local collection.
// ---------------------------------------------------------------------------

export type TransactionSnapshot = {
  id: string
  invoiceNo: string
  totalAmount: number
  totalCost: number
  taxAmount: number
  discount: number | null
  bufferRate: number
  priceConfiguration: string
  invoiceType: string
  // cashierId is required (NOT NULL) on the Transaction table
  cashierId: string
  orderId: string | null
  buyerName: string | null
  complianceData: TransactionComplianceData
  payments: Array<{
    id: string
    method: string
    amount: number
    platform: string | null
  }>
  taxLines: Array<{
    id: string
    type: TaxLineType
    category: TaxCategory
    rate: number
    taxableAmount: number
    taxAmount: number
  }>
}

export const createPosRefund = async (snapshot: TransactionSnapshot) => {
  const { user } = authStore.state

  // Check MANAGE_INVENTORY capability — gates the inventory restock step.
  // The refund itself always completes; only the stock adjustment is skipped
  // when the user is on a plan that does not include inventory management.
  const canManageInventory = user?.entitlement?.capabilities?.includes(Capabilities.MANAGE_INVENTORY) ?? false

  const result = await dbTransaction(() => {
    // 1. Generate Refund IDs
    const transactionId = crypto.randomUUID()
    const refundInvoiceNo = fetchStructuredId(SequenceType.REFUND)

    // 2. Create Refund Transaction — built from the snapshot, not the collection
    transactionCollection.insert({
      id: transactionId,
      invoiceNo: refundInvoiceNo,
      type: TransactionType.REFUND,
      originalTransactionId: snapshot.id,
      priceConfiguration: snapshot.priceConfiguration as import('prisma/generated/prisma/browser').PriceConfiguration,
      invoiceType: snapshot.invoiceType as import('prisma/generated/prisma/browser').InvoiceType,
      bufferRate: snapshot.bufferRate,

      // Invert financial amounts
      totalAmount: -snapshot.totalAmount,
      totalCost: -snapshot.totalCost,
      taxAmount: -snapshot.taxAmount,
      discount: snapshot.discount ? -snapshot.discount : 0,

      // Carry over identity fields — orderId is required (NOT NULL) on Transaction
      cashierId: snapshot.cashierId,
      orderId: snapshot.orderId ?? snapshot.id, // fall back to transaction id if orderId missing
      buyerName: snapshot.buyerName,

      complianceData: {
        ...snapshot.complianceData,
        vatExemptSales: snapshot.complianceData.vatExemptSales ? -snapshot.complianceData.vatExemptSales : 0,
        zeroRatedSales: snapshot.complianceData.zeroRatedSales ? -snapshot.complianceData.zeroRatedSales : 0,
        scPwdDiscount: snapshot.complianceData.scPwdDiscount ? -snapshot.complianceData.scPwdDiscount : 0,
      },

      // Optional / nullable fields — null for refund transactions
      customerId: null,
      buyerTaxId: null,
      buyerAddress: null,
      providerId: null,
      sessionId: null,
      usageCounterId: null,
      startTime: null,
      endTime: null,
      notes: null,

      businessId: user.business.id,
      branchId: user.branch.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // 3. Revert Inventory — only when user has MANAGE_INVENTORY capability.
    //    The inventory movement records from the original sale are in the local
    //    collection because they were inserted there during checkout.
    if (canManageInventory) {
      const originalMovements = [...inventoryMovementCollection.values()].filter(m => m.transactionId === snapshot.id)

      for (const movement of originalMovements) {
        inventoryCollection.update(movement.inventoryId, draft => {
          draft.quantity += movement.quantity
        })

        inventoryMovementCollection.insert({
          id: crypto.randomUUID(),
          variantId: movement.variantId,
          inventoryId: movement.inventoryId,
          transactionId,
          userId: user?.id,
          type: MovementType.IN,
          quantity: movement.quantity,
          reason: `Refund: ${refundInvoiceNo} (Ref: ${snapshot.invoiceNo})`,
          unitId: movement.unitId,
          purchaseId: null,
          locationId: null,
          targetBranchId: null,
          operationalTaskId: null,
          businessId: user.business.id,
          branchId: user.branch.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
    }

    // 4. Revert Tax Lines — built from the snapshot
    for (const line of snapshot.taxLines) {
      transactionTaxLineCollection.insert({
        id: crypto.randomUUID(),
        transactionId,
        type: line.type,
        category: line.category,
        rate: line.rate,
        taxableAmount: -line.taxableAmount,
        taxAmount: -line.taxAmount,
      })
    }

    // 5. Credits and Transaction Usage Policy
    // Business Rule: Refunds do NOT restore credits or transaction usage.
    // Only checkout consumes credits/transactions, and they are not restorable
    // on any features including refunds.
    //
    // This policy ensures:
    // - Simple, predictable billing behavior
    // - No gaming of transaction limits through refund/re-purchase cycles
    // - Consistent credit consumption tracking

    // 6. Create Negative Payment — mirrors the original payment method
    const originalPayment = snapshot.payments[0]
    paymentCollection.insert({
      id: crypto.randomUUID(),
      transactionId,
      referenceNo: snapshot.invoiceNo,
      method: (originalPayment?.method ?? 'CASH') as import('prisma/generated/prisma/browser').PaymentMethod,
      amount: -snapshot.totalAmount,
      tendered: -snapshot.totalAmount,
      change: 0,
      platform: originalPayment?.platform ?? null,
      businessId: user.business.id,
      branchId: user.branch.id,
      createdAt: new Date(),
    })

    return { transactionId, refundInvoiceNo }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)
    return { data: false as const, error: result.error }
  }

  const { transactionId, refundInvoiceNo } = result.value

  writeAudit({
    data: {
      action: AuditAction.TRANSACTION_REFUNDED,
      targetType: AuditTargetType.Transaction,
      targetId: snapshot.id,
      ipAddress: null,
      before: null,
      after: { refundTransactionId: transactionId, refundInvoiceNo },
    },
  }).catch(err => console.error('[audit] TRANSACTION_REFUNDED write failed:', err))

  return { data: refundInvoiceNo, transactionId }
}
