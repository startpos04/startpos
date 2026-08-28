import { MovementType, SequenceType, type TaxCategory, type TaxLineType, TransactionType } from 'prisma/generated/prisma/enums'
import {
  auditLogCollection,
  inventoryCollection,
  inventoryMovementCollection,
  paymentCollection,
  transactionCollection,
  transactionTaxLineCollection,
} from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import { getComplianceAdapter } from '@/lib/compliance'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { sequenceAPI } from '@/lib/prisma-client/sequence-api'
import { writeAudit } from '@/lib/server-fn/write-audit'
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
  snapshotBufferRate: number
  priceConfiguration: string
  invoiceType: string
  // cashierId is required (NOT NULL) on the Transaction table
  cashierId: string
  orderId: string | null
  snapshotCustomerName: string | null
  complianceData: TransactionComplianceData
  // Universal snapshots
  snapshotBusinessName?: string
  snapshotBranchName?: string
  snapshotBranchAddress?: string
  snapshotBranchSN?: string | null
  snapshotCurrency?: string
  // PH-specific snapshots
  snapshotBusinessTIN?: string | null
  snapshotBranchCode?: string | null
  snapshotIsVATRegistered?: boolean | null
  snapshotPTUNumber?: string | null
  snapshotRDOCode?: string | null
  snapshotCustomerTIN?: string | null
  snapshotScPwdId?: string | null
  snapshotScPwdName?: string | null
  snapshotScPwdDiscount?: number | null
  snapshotBuyerName?: string | null
  snapshotBuyerTIN?: string | null
  snapshotBuyerAddress?: string | null
  snapshotBuyerBusinessStyle?: string | null
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

  // ---------------------------------------------------------------------------
  // PHASE 1 FIX: Allocate refund sequence SERVER-SIDE before transaction
  // ---------------------------------------------------------------------------
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  let refundInvoiceNo: string

  if (isOffline) {
    // -------------------------------------------------------------------------
    // PHASE 2: Offline refund restriction
    // Same offline guard as checkout - only designated terminal can refund offline
    // -------------------------------------------------------------------------
    if (!user.canCheckoutOffline) {
      console.error('[createPosRefund] Offline refund blocked: user is not designated offline terminal')
      return {
        error: new Error(
          'Offline refund is not available. Only the designated offline terminal can process refunds while offline. Please reconnect to the internet or contact your administrator.',
        ),
      }
    }

    // Offline: use client-side allocation (only for designated terminal)
    refundInvoiceNo = fetchStructuredId(SequenceType.REFUND)
  } else {
    // Online: use server-side atomic allocation with retry
    const sequenceResult = await sequenceAPI.allocateWithRetry(SequenceType.REFUND)

    if (sequenceResult.isErr()) {
      console.error('[createPosRefund] Failed to allocate refund sequence:', sequenceResult.error)
      return { error: new Error(`Failed to allocate refund number: ${sequenceResult.error}`) }
    }

    refundInvoiceNo = sequenceResult.value.invoiceNo
  }

  const result = await dbTransaction(() => {
    // 1. Generate Refund IDs
    const transactionId = crypto.randomUUID()

    // --- Phase 11: Use compliance adapter to copy transaction snapshots (country-agnostic) ---
    const adapter = getComplianceAdapter()

    // Phase 11 Task 4: Validate compliance data before allowing refund
    // SOFT VALIDATION: Warn but allow refunds for unregistered businesses
    // Build ComplianceData from user.compliance for validation
    const complianceData = {
      businessTaxId: user.compliance.BIR_TIN || '',
      businessPermitNumber: user.compliance.BIR_PTU_NUMBER,
      businessPermitIssuedAt: user.compliance.BIR_PTU_ISSUED_AT,
      businessTaxOfficeCode: user.compliance.BIR_RDO_CODE,
      branchSerialNumber: user.compliance.BRANCH_SERIAL_NUMBER,
      branchCode: user.compliance.BRANCH_CODE || user.branch.branchCode,
      branchPermitNumber: user.compliance.BRANCH_PTU_NUMBER,
      branchTaxOfficeCode: user.compliance.BRANCH_RDO_CODE,
      isTaxRegistered: user.configs.IS_VAT_REGISTERED,
    }

    const missingFields = adapter.validateCompliance(complianceData)
    const hasIncompleteCompliance = missingFields.length > 0

    // Log warning for audit purposes if compliance is incomplete
    if (hasIncompleteCompliance) {
      console.warn('[POS Refund] Incomplete compliance data:', {
        businessId: user.business.id,
        missingFields,
        message: 'Refund allowed but receipts may not be tax-compliant',
      })
    }

    const refundSnapshotFields = adapter.copyRefundSnapshot({
      originalTransaction: snapshot,
      currentUser: { name: user.name },
    })

    // 2. Create Refund Transaction — built from the snapshot, not the collection
    transactionCollection.insert({
      id: transactionId,
      invoiceNo: refundInvoiceNo, // Use pre-allocated sequence from above
      type: TransactionType.REFUND,
      originalTransactionId: snapshot.id,
      priceConfiguration: snapshot.priceConfiguration as import('prisma/generated/prisma/browser').PriceConfiguration,
      invoiceType: snapshot.invoiceType as import('prisma/generated/prisma/browser').InvoiceType,
      snapshotBufferRate: snapshot.snapshotBufferRate,

      // Invert financial amounts
      totalAmount: -snapshot.totalAmount,
      totalCost: -snapshot.totalCost,
      taxAmount: -snapshot.taxAmount,
      discount: snapshot.discount ? -snapshot.discount : 0,

      // Carry over identity fields — orderId is required (NOT NULL) on Transaction
      cashierId: snapshot.cashierId,
      orderId: snapshot.orderId ?? snapshot.id, // fall back to transaction id if orderId missing
      snapshotCustomerName: snapshot.snapshotCustomerName,

      // --- Phase 11: Country-specific snapshot fields from adapter ---
      // The adapter automatically copies the correct fields based on deployment country
      // and handles proper inversion (e.g., SC/PWD discount becomes negative)
      ...refundSnapshotFields,

      complianceData: {
        ...snapshot.complianceData,
        vatExemptSales: snapshot.complianceData.vatExemptSales ? -snapshot.complianceData.vatExemptSales : 0,
        zeroRatedSales: snapshot.complianceData.zeroRatedSales ? -snapshot.complianceData.zeroRatedSales : 0,
        scPwdDiscount: snapshot.complianceData.scPwdDiscount ? -snapshot.complianceData.scPwdDiscount : 0,
      },

      // Optional / nullable fields — null for refund transactions
      customerId: null,
      snapshotCustomerTaxId: null,
      snapshotCustomerAddress: null,
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

    // -------------------------------------------------------------------------
    // AUDIT: Log failed refund after successful sequence allocation
    // Write to local collection so it syncs automatically (resilient to network failures)
    // -------------------------------------------------------------------------
    auditLogCollection.insert({
      id: crypto.randomUUID(),
      businessId: user.business.id,
      actorId: user.id,
      action: AuditAction.SEQUENCE_ALLOCATION_FAILED,
      targetType: AuditTargetType.SequenceCounter,
      targetId: refundInvoiceNo,
      before: null,
      after: {
        sequenceType: SequenceType.REFUND,
        refundInvoiceNo,
        originalTransactionId: snapshot.id,
        errorMessage: result.error.message,
        timestamp: new Date().toISOString(),
      },
      ipAddress: null,
      createdAt: new Date(),
    })

    return { data: false as const, error: result.error }
  }

  const { transactionId } = result.value
  // Note: refundInvoiceNo already declared above from sequence allocation

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
