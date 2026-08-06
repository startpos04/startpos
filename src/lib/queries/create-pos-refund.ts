import { MovementType, SequenceType, TransactionType } from 'prisma/generated/prisma/enums'
import {
  creditLedgerCollection,
  inventoryCollection,
  inventoryMovementCollection,
  paymentCollection,
  transactionCollection,
  transactionTaxLineCollection,
} from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { authStore } from '@/store/auth-store'
import { CreditEngine } from '../billing/credit-engine'
import { BillingModel } from '../billing/types'
import { fetchStructuredId } from './fetch-structured-id'

export const createPosRefund = async (originalTransactionId: string) => {
  const { user } = authStore.state

  const result = await dbTransaction(() => {
    // 1. Fetch Original Data
    const originalTx = transactionCollection.get(originalTransactionId)
    if (!originalTx) throw new Error('Original transaction not found')

    // Find all movements associated with this sale to know which batches to restock
    const originalMovements = [...inventoryMovementCollection.values()].filter(m => m.transactionId === originalTransactionId)
    const originalTransactionTaxLine = [...transactionTaxLineCollection.values()].filter(m => m.transactionId === originalTransactionId)

    // 2. Generate Refund IDs
    const transactionId = crypto.randomUUID()
    const refundInvoiceNo = fetchStructuredId(SequenceType.REFUND)

    // 3. Create Refund Transaction (Inverse of Sale)
    transactionCollection.insert({
      ...originalTx,
      id: transactionId,
      invoiceNo: refundInvoiceNo,
      type: TransactionType.REFUND,
      originalTransactionId: originalTx.id,

      totalAmount: -originalTx.totalAmount,
      totalCost: -originalTx.totalCost,
      taxAmount: -originalTx.taxAmount,
      discount: originalTx.discount ? -originalTx.discount : 0,

      complianceData: {
        ...originalTx.complianceData,
        vatExemptSales: originalTx.complianceData.vatExemptSales ? -originalTx.complianceData.vatExemptSales : 0,
        zeroRatedSales: originalTx.complianceData.zeroRatedSales ? -originalTx.complianceData.zeroRatedSales : 0,
        scPwdDiscount: originalTx.complianceData.scPwdDiscount ? -originalTx.complianceData.scPwdDiscount : 0,
      },

      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // 4. Revert Inventory (Restock the exact batches)
    for (const movement of originalMovements) {
      // Increment the specific inventory batch
      inventoryCollection.update(movement.inventoryId, draft => {
        draft.quantity += movement.quantity
      })

      // Record the "IN" movement for the refund
      inventoryMovementCollection.insert({
        id: crypto.randomUUID(),
        variantId: movement.variantId,
        inventoryId: movement.inventoryId,
        transactionId,
        userId: user?.id,
        type: MovementType.IN,
        quantity: movement.quantity,
        reason: `Refund: ${refundInvoiceNo} (Ref: ${originalTx.invoiceNo})`,
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

    // 5. Revert Tax Line
    for (const originalLine of originalTransactionTaxLine) {
      const refundTaxLine = {
        ...originalLine,
        id: crypto.randomUUID(),
        transactionId: transactionId,
        taxableAmount: -originalLine.taxableAmount,
        taxAmount: -originalLine.taxAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      transactionTaxLineCollection.insert(refundTaxLine)
    }

    // --- 6. RESTORE CREDIT (Phase 3 — PREPAID_CREDITS billing model only) ---
    // If the original transaction consumed a credit, restore it on refund.
    // Conditional on billing model — MONTHLY_SUBSCRIPTION is unaffected.
    const subscription = authStore.state.user?.entitlement
    const billingModel = (subscription as { billingModel?: string } | undefined)?.billingModel

    if (billingModel === BillingModel.PREPAID_CREDITS) {
      const businessId = user.business.id
      // Read the latest ledger entry — prefer local collection, fall back to authStore.
      const ledgerEntries = [...creditLedgerCollection.values()]
        .filter(e => e.businessId === businessId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const latestEntry: { balanceAfter: number } | null =
        ledgerEntries[0] ?? (subscription?.creditBalance != null ? { balanceAfter: subscription.creditBalance } : null)

      const restoreResult = CreditEngine.restore(businessId, latestEntry ? { balanceAfter: latestEntry.balanceAfter } : null, transactionId)

      if (restoreResult.ok) {
        const entry = restoreResult.value
        creditLedgerCollection.insert({
          id: crypto.randomUUID(),
          businessId: entry.businessId,
          eventType: entry.eventType as import('prisma/generated/prisma/browser').CreditEventType,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          transactionId: entry.transactionId,
          note: entry.note,
          actorId: entry.actorId,
          createdAt: new Date(),
        })
      }
    }

    // --- 7. CREATE NEGATIVE PAYMENT ---
    // Mirrors the original payment method so the ledger is correctly balanced
    const originalPayment = [...paymentCollection.values()].find(p => p.transactionId === originalTransactionId)
    paymentCollection.insert({
      id: crypto.randomUUID(),
      transactionId,
      referenceNo: originalTx.invoiceNo, // Reference the original SI
      method: originalPayment?.method ?? 'CASH', // Mirror original payment method
      amount: -originalTx.totalAmount, // Negative amount
      tendered: -originalTx.totalAmount,
      change: 0,
      platform: originalPayment?.platform ?? null,
      businessId: user.business.id,
      branchId: user.branch.id,
      createdAt: new Date(),
    })

    // Directly return the generated details from the callback
    return {
      transactionId,
      refundInvoiceNo,
    }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)
    return { data: false, error: result.error }
  }

  // TypeScript now correctly infers result.value as { transactionId: string, refundInvoiceNo: string }
  return {
    data: result.value.refundInvoiceNo,
    transactionId: result.value.transactionId,
  }
}
