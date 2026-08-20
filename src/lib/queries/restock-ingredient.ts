import { SequenceType } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import {
  auditLogCollection,
  inventoryCollection,
  inventoryMovementCollection,
  productVariantCollection,
  purchaseCollection,
  purchaseItemCollection,
} from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { AuditAction, AuditTargetType } from '@/lib/audit/types'
import { InventoryEngine } from '@/lib/inventory/inventory-engine'
import { sequenceAPI } from '@/lib/prisma-client/sequence-api'
import { authStore } from '@/store/auth-store'
import { fetchStructuredId } from './fetch-structured-id'

export const restockSchema = z.object({
  variantId: z.string(),
  quantity: z.number().gt(0),
  unitCost: z.number().gte(0),
  unitId: z.string(),
  reason: z.string().nullable(),
  batchNumber: z.string().optional().default('DEFAULT'),
  expiryDate: z.string().optional().nullable(),
  supplierId: z.string(),
  locationId: z.string(),
})

export const restockIngredient = async (data: z.infer<typeof restockSchema>) => {
  const { user } = authStore.state

  // ---------------------------------------------------------------------------
  // PHASE 1 FIX: Allocate purchase sequence SERVER-SIDE before transaction
  // ---------------------------------------------------------------------------
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  let structuredPurchaseId: string

  if (isOffline) {
    // -------------------------------------------------------------------------
    // PHASE 2: Offline restock restriction
    // Only designated terminal can restock ingredients offline
    // -------------------------------------------------------------------------
    if (!user.canCheckoutOffline) {
      console.error('[restockIngredient] Offline restock blocked: user is not designated offline terminal')
      return {
        error: new Error(
          'Offline ingredient restock is not available. Only the designated offline terminal can restock ingredients while offline. Please reconnect to the internet or contact your administrator.',
        ),
      }
    }

    // Offline: use client-side allocation (only for designated terminal)
    structuredPurchaseId = fetchStructuredId(SequenceType.PURCHASE)
  } else {
    // Online: use server-side atomic allocation with retry
    const sequenceResult = await sequenceAPI.allocateWithRetry(SequenceType.PURCHASE)

    if (sequenceResult.isErr()) {
      console.error('[restockIngredient] Failed to allocate purchase sequence:', sequenceResult.error)
      return { error: new Error(`Failed to allocate purchase number: ${sequenceResult.error}`) }
    }

    structuredPurchaseId = sequenceResult.value.invoiceNo
  }

  const result = await dbTransaction(() => {
    // --- 1. CREATE PURCHASE RECORD ---
    const purchaseId = crypto.randomUUID()

    purchaseCollection.insert({
      id: purchaseId,
      purchaseId: structuredPurchaseId, // Use pre-allocated sequence from above
      supplierId: data.supplierId,
      totalCost: Math.round(data.unitCost * data.quantity),
      notes: data.reason,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
      operationalTaskId: null,
    })

    purchaseItemCollection.insert({
      id: crypto.randomUUID(),
      purchaseId,
      variantId: data.variantId,
      quantity: data.quantity,
      unitId: data.unitId,
      unitCost: data.unitCost,
      businessId: user.business.id,
      branchId: user.branch.id,
    })

    // --- 2. UPDATE VARIANT REFERENCE COST ---
    if (productVariantCollection.has(data.variantId)) {
      productVariantCollection.update(data.variantId, draft => {
        draft.costPrice = data.unitCost
      })
    }

    // --- 3. Delegate inventory batch upsert + movement to InventoryEngine (single owner) ---
    const inventoryId = InventoryEngine.applyAdjustment({
      variantId: data.variantId,
      batchNumber: data.batchNumber || 'DEFAULT',
      quantity: data.quantity,
      locationId: data.locationId,
      costPrice: data.unitCost,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      unitId: data.unitId,
      purchaseId,
      structuredId: structuredPurchaseId,
      reason: data.reason,
      inventoryCollection,
      movementCollection: inventoryMovementCollection,
      ctx: {
        userId: user.id,
        branchId: user.branch.id,
        businessId: user.business.id,
      },
    })

    return {
      success: true,
      purchase: {
        ...purchaseCollection.get(purchaseId),
        items: [...purchaseItemCollection.values()].filter(i => i.purchaseId === purchaseId),
      },
      inventory: inventoryCollection.get(inventoryId),
    }
  })

  if (result.isErr()) {
    console.error('Transaction failed:', result.error.message)

    // -------------------------------------------------------------------------
    // AUDIT: Log failed ingredient restock after successful sequence allocation
    // Write to local collection so it syncs automatically (resilient to network failures)
    // -------------------------------------------------------------------------
    auditLogCollection.insert({
      id: crypto.randomUUID(),
      businessId: user.business.id,
      actorId: user.id,
      action: AuditAction.SEQUENCE_ALLOCATION_FAILED,
      targetType: AuditTargetType.SequenceCounter,
      targetId: structuredPurchaseId,
      before: null,
      after: {
        sequenceType: SequenceType.PURCHASE,
        purchaseId: structuredPurchaseId,
        variantId: data.variantId,
        errorMessage: result.error.message,
        timestamp: new Date().toISOString(),
      },
      ipAddress: null,
      createdAt: new Date(),
    })

    return { data: false, error: result.error }
  }

  return { data: result.value }
}
