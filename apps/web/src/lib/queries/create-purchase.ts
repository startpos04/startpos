import {
  auditLogCollection,
  inventoryCollection,
  inventoryMovementCollection,
  productVariantCollection,
  purchaseCollection,
  purchaseItemCollection,
} from '@platform/db/collections'
// inventoryCollection + inventoryMovementCollection are passed to InventoryEngine — kept for the pass-through
import { dbTransaction } from '@platform/db/local-db-transaction'
import { PurchaseStatus, SequenceType } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import { getAuthenticatedUser } from '@/lib/better-auth/auth-store'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import { sequenceAPI } from '@/lib/prisma-client/sequence-api'
import { fetchStructuredId } from './fetch-structured-id'

export const createPurchaseLineSchema = z.object({
  variantId: z.string().min(1, 'Item required'),
  quantity: z.number().positive('Must be > 0'),
  unitId: z.string().min(1, 'Unit required'),
  unitCost: z.number().nonnegative('Cost must be â‰¥ 0'),
})

export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier required'),
  notes: z.string().optional().nullable(),
  items: z.array(createPurchaseLineSchema).min(1, 'Add at least one item'),
})

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>

export const createPurchase = async (data: CreatePurchaseInput) => {
  const user = getAuthenticatedUser()

  // ---------------------------------------------------------------------------
  // PHASE 1 FIX: Allocate purchase sequence SERVER-SIDE before transaction
  // ---------------------------------------------------------------------------
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  let structuredId: string

  if (isOffline) {
    // -------------------------------------------------------------------------
    // PHASE 2: Offline purchase restriction
    // Only designated terminal can create purchases offline
    // -------------------------------------------------------------------------
    if (!user.canCheckoutOffline) {
      console.error('[createPurchase] Offline purchase blocked: user is not designated offline terminal')
      return {
        error: new Error(
          'Offline purchase creation is not available. Only the designated offline terminal can create purchases while offline. Please reconnect to the internet or contact your administrator.',
        ),
      }
    }

    // Offline: use client-side allocation (only for designated terminal)
    structuredId = fetchStructuredId(SequenceType.PURCHASE)
  } else {
    // Online: use server-side atomic allocation with retry
    const sequenceResult = await sequenceAPI.allocateWithRetry(SequenceType.PURCHASE)

    if (sequenceResult.isErr()) {
      console.error('[createPurchase] Failed to allocate purchase sequence:', sequenceResult.error)
      return { error: new Error(`Failed to allocate purchase number: ${sequenceResult.error}`) }
    }

    structuredId = sequenceResult.value.invoiceNo
  }

  const result = await dbTransaction(() => {
    const purchaseId = crypto.randomUUID()
    const totalCost = data.items.reduce((sum, i) => sum + Math.round(i.unitCost * i.quantity), 0)

    // 1. Create the purchase header
    purchaseCollection.insert({
      id: purchaseId,
      purchaseId: structuredId, // Use pre-allocated sequence from above
      status: PurchaseStatus.RECEIVED, // D7: quick-receive path sets RECEIVED directly
      supplierId: data.supplierId,
      totalCost,
      notes: data.notes || null,
      operationalTaskId: null,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })

    for (const item of data.items) {
      // 2. Create purchase line items
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

      // 3. Update variant reference cost
      if (productVariantCollection.has(item.variantId)) {
        productVariantCollection.update(item.variantId, draft => {
          draft.costPrice = item.unitCost
        })
      }
    }

    // 4. Delegate all inventory mutations to InventoryEngine (single owner)
    InventoryEngine.applyPurchaseReceipt({
      purchaseId,
      structuredId,
      items: data.items.map(i => ({
        variantId: i.variantId,
        quantity: i.quantity,
        unitId: i.unitId,
        unitCost: i.unitCost,
      })),
      inventoryCollection,
      movementCollection: inventoryMovementCollection,
      ctx: {
        userId: user.id,
        branchId: user.branch.id,
        businessId: user.business.id,
      },
    })

    return { purchaseId, structuredId }
  })

  if (result.isErr()) {
    console.error('Create purchase failed:', result.error.message)

    // -------------------------------------------------------------------------
    // AUDIT: Log failed purchase after successful sequence allocation
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
        errorMessage: result.error.message,
        timestamp: new Date().toISOString(),
      },
      ipAddress: null,
      createdAt: new Date(),
    })

    return { data: null, error: result.error }
  }

  return { data: result.value, error: null }
}
