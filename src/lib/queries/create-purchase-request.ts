/**
 * create-purchase-request.ts
 *
 * D5: Purchase Request path — creates a purchase at PENDING_APPROVAL status.
 * The quick-receive path (create-purchase.ts → RECEIVED) is unchanged and
 * remains the default for cash-and-carry operations.
 *
 * This path:
 *   1. Creates the purchase header at PENDING_APPROVAL
 *   2. Creates purchase line items
 *   3. Does NOT credit inventory (goods not yet received)
 *   4. Sends a PURCHASE_PENDING_APPROVAL notification to supervisors/admins
 *
 * Inventory is credited when the purchase transitions APPROVED → RECEIVED
 * via transitionPurchaseStatus in purchase-workflow-actions.ts.
 *
 * D5 — Traceability: pass the originating PURCHASE_REQUEST task ID (if any) so
 * the purchase record is linked back to the task that requested it. This closes
 * the task → purchase audit trail (Purchase.operationalTaskId FK).
 */

import { PurchaseStatus, Role, SequenceType } from 'prisma/generated/prisma/enums'
import { auditLogCollection, membershipCollection, purchaseCollection, purchaseItemCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import { NotificationEngine } from '@/lib/notification/notification-engine'
import { sequenceAPI } from '@/lib/prisma-client/sequence-api'
import { authStore } from '@/lib/better-auth/auth-store'
import { type CreatePurchaseInput, createPurchaseSchema } from './create-purchase'
import { fetchStructuredId } from './fetch-structured-id'

export type { CreatePurchaseInput }
export { createPurchaseSchema }

export interface CreatePurchaseRequestOptions {
  /** ID of the PURCHASE_REQUEST OperationalTask that originated this request, if any.
   *  When provided, the resulting Purchase record is linked back to the task so the
   *  full procurement cycle (task → purchase → GRN) is traceable in one query.
   *  Source: Architecture Compliance Audit Deviation 5 — operationalTaskId never populated.
   */
  originatingTaskId?: string | null
}

export const createPurchaseRequest = async (data: CreatePurchaseInput, options: CreatePurchaseRequestOptions = {}) => {
  const { user } = authStore.state
  const { originatingTaskId = null } = options

  // ---------------------------------------------------------------------------
  // PHASE 1 FIX: Allocate purchase sequence SERVER-SIDE before transaction
  // ---------------------------------------------------------------------------
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  let structuredId: string

  if (isOffline) {
    // -------------------------------------------------------------------------
    // PHASE 2: Offline purchase request restriction
    // Only designated terminal can create purchase requests offline
    // -------------------------------------------------------------------------
    if (!user.canCheckoutOffline) {
      console.error('[createPurchaseRequest] Offline purchase request blocked: user is not designated offline terminal')
      return {
        error: new Error(
          'Offline purchase request creation is not available. Only the designated offline terminal can create purchase requests while offline. Please reconnect to the internet or contact your administrator.',
        ),
      }
    }

    // Offline: use client-side allocation (only for designated terminal)
    structuredId = fetchStructuredId(SequenceType.PURCHASE)
  } else {
    // Online: use server-side atomic allocation with retry
    const sequenceResult = await sequenceAPI.allocateWithRetry(SequenceType.PURCHASE)

    if (sequenceResult.isErr()) {
      console.error('[createPurchaseRequest] Failed to allocate purchase sequence:', sequenceResult.error)
      return { error: new Error(`Failed to allocate purchase number: ${sequenceResult.error}`) }
    }

    structuredId = sequenceResult.value.invoiceNo
  }

  const result = await dbTransaction(() => {
    const purchaseId = crypto.randomUUID()
    const totalCost = data.items.reduce((sum, i) => sum + Math.round(i.unitCost * i.quantity), 0)

    // 1. Create the purchase header at PENDING_APPROVAL — no inventory yet.
    //    operationalTaskId links this purchase back to the originating PURCHASE_REQUEST task
    //    so the full audit trail (task → purchase → GRN) is queryable from a single record.
    purchaseCollection.insert({
      id: purchaseId,
      purchaseId: structuredId, // Use pre-allocated sequence from above
      status: PurchaseStatus.PENDING_APPROVAL,
      supplierId: data.supplierId,
      totalCost,
      notes: data.notes || null,
      operationalTaskId: originatingTaskId,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })

    // 2. Create purchase line items (same as quick-receive path)
    for (const item of data.items) {
      purchaseItemCollection.insert({
        id: crypto.randomUUID(),
        purchaseId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitId: item.unitId,
        unitCost: item.unitCost,
        businessId: user.business.id,
        branchId: user.branch.id,
      })
    }

    return { purchaseId, structuredId }
  })

  if (result.isErr()) {
    console.error('Create purchase request failed:', result.error.message)

    // -------------------------------------------------------------------------
    // AUDIT: Log failed purchase request after successful sequence allocation
    // Write to local collection so it syncs automatically (resilient to network failures)
    // -------------------------------------------------------------------------
    auditLogCollection.insert({
      id: crypto.randomUUID(),
      businessId: user.business.id,
      actorId: user.id,
      action: AuditAction.SEQUENCE_ALLOCATION_FAILED,
      targetType: AuditTargetType.SequenceCounter,
      targetId: structuredId,
      before: null,
      after: {
        sequenceType: SequenceType.PURCHASE,
        purchaseId: structuredId,
        operationalTaskId: originatingTaskId,
        errorMessage: result.error.message,
        timestamp: new Date().toISOString(),
      },
      ipAddress: null,
      createdAt: new Date(),
    })

    return { data: null, error: result.error }
  }

  // 3. Notify supervisors/admins (outside transaction — notification delivery is best-effort)
  const admins = [...membershipCollection.values()].filter(m => ([Role.ADMIN, Role.SUPERVISOR] as Role[]).includes(m.role))
  if (admins.length > 0) {
    await NotificationEngine.send(
      admins.map(a => a.id),
      {
        type: 'PURCHASE_PENDING_APPROVAL',
        title: 'Purchase Request Pending Approval',
        message: `Purchase ${result.value.structuredId} has been submitted and requires your approval.`,
        metadata: { purchaseId: result.value.purchaseId, structuredId: result.value.structuredId },
        link: `/purchases/${result.value.purchaseId}`,
      },
    )
  }

  return { data: result.value, error: null }
}
