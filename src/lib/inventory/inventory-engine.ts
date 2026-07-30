/**
 * inventory-engine.ts
 *
 * Sole owner of all inventory mutations. Every change to inventoryCollection
 * or inventoryMovementCollection flows through this engine — no other module
 * may write to those collections directly.
 *
 * Follows the same architectural contract as EntitlementEngine, FIFOEngine,
 * NotificationEngine: a plain exported object with named methods.
 *
 * CRITICAL CONSTRAINT (ADR-001 / Phase 3 Risk R1):
 *   All methods are synchronous. They are designed to be called from inside a
 *   dbTransaction callback. Introducing an async boundary here would break
 *   offline atomicity. If you find yourself wanting to await inside these
 *   methods, the caller — not the engine — is where async belongs.
 *
 * TENANT CONTEXT:
 *   Methods receive { userId, branchId, businessId } explicitly. The engine
 *   never reads authStore directly, making it testable and callable from any
 *   context (UI, server function, automated trigger).
 */

import { MovementType, TaskStatus, TaskType } from 'prisma/generated/prisma/enums'
import type {
  inventoryCollection as InventoryCollectionType,
  inventoryMovementCollection as MovementCollectionType,
  operationalTaskCollection as TaskCollectionType,
} from '@/db/collections'
import type { feTask } from '@/lib/queries/fetch-tasks'

// ---------------------------------------------------------------------------
// Shared tenant-context type — passed explicitly by every caller
// ---------------------------------------------------------------------------

interface TenantContext {
  /** The ID of the user performing the operation. Must be a valid, non-empty user ID. */
  userId: string
  branchId: string
  businessId: string
}

// ---------------------------------------------------------------------------
// PurchaseReceipt params — mirrors the shape produced by create-purchase.ts
// ---------------------------------------------------------------------------

export interface PurchaseReceiptItem {
  variantId: string
  quantity: number
  unitId: string
  unitCost: number
}

export interface ApplyPurchaseReceiptParams {
  purchaseId: string
  structuredId: string
  items: PurchaseReceiptItem[]
  inventoryCollection: typeof InventoryCollectionType
  movementCollection: typeof MovementCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// PurchaseVoid params — mirrors the shape produced by void-purchase.ts
// ---------------------------------------------------------------------------

export interface ApplyPurchaseVoidParams {
  purchaseId: string
  purchaseIdDisplay: string
  items: Array<{ variantId: string; quantity: number; unitId: string }>
  movementsToReverse: Array<{
    id: string
    variantId: string
    inventoryId: string
    quantity: number
    unitId: string
    locationId: string | null
  }>
  inventoryCollection: typeof InventoryCollectionType
  movementCollection: typeof MovementCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// Adjustment params — mirrors the shape produced by restock-ingredient.ts
// ---------------------------------------------------------------------------

export interface ApplyAdjustmentParams {
  variantId: string
  batchNumber: string
  quantity: number
  locationId: string
  costPrice: number
  expiryDate: Date | null
  unitId: string
  purchaseId: string
  structuredId: string
  reason: string | null
  inventoryCollection: typeof InventoryCollectionType
  movementCollection: typeof MovementCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// TaskFulfillment params — mirrors inventory side-effects in tasks/$taskId/index.tsx
// ---------------------------------------------------------------------------

export interface ApplyTaskFulfillmentParams {
  task: feTask
  inventoryCollection: typeof InventoryCollectionType
  movementCollection: typeof MovementCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// LowStockDetected params — for the auto-task-creation extracted from NotificationEngine
// ---------------------------------------------------------------------------

export interface HandleLowStockDetectedParams {
  variantId: string
  currentTotal: number
  threshold: number
  productLink: string
  operationalTaskCollection: typeof TaskCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// InventoryEngine
// ---------------------------------------------------------------------------

export const InventoryEngine = {
  /**
   * Apply inventory side-effects when a purchase is created (goods received).
   *
   * Creates or updates the inventory batch keyed by PO number, and inserts an
   * IN movement record for each line item.
   *
   * Called from create-purchase.ts inside dbTransaction.
   */
  applyPurchaseReceipt({ purchaseId, structuredId, items, inventoryCollection, movementCollection, ctx }: ApplyPurchaseReceiptParams): void {
    const now = new Date()

    for (const item of items) {
      const batchNumber = `PO-${structuredId}`
      const existingBatch = [...inventoryCollection.values()].find(i => i.variantId === item.variantId && i.batchNumber === batchNumber)

      let inventoryId: string

      if (existingBatch) {
        inventoryId = existingBatch.id
        inventoryCollection.update(inventoryId, draft => {
          draft.quantity += item.quantity
          draft.costPrice = item.unitCost
          draft.lastRestocked = now
        })
      } else {
        inventoryId = crypto.randomUUID()
        inventoryCollection.insert({
          id: inventoryId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitId: item.unitId,
          batchNumber,
          costPrice: item.unitCost,
          locationId: ctx.branchId,
          expiryDate: null,
          lastRestocked: now,
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          updatedAt: now,
          createdAt: now,
        })
      }

      movementCollection.insert({
        id: crypto.randomUUID(),
        variantId: item.variantId,
        inventoryId,
        userId: ctx.userId,
        quantity: item.quantity,
        unitId: item.unitId,
        type: MovementType.IN,
        reason: `Purchase Order: ${structuredId}`,
        transactionId: null,
        targetBranchId: null,
        purchaseId,
        locationId: ctx.branchId,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        updatedAt: now,
        createdAt: now,
        operationalTaskId: null,
      })
    }
  },

  /**
   * Reverse inventory side-effects when a purchase is voided.
   *
   * Prefers reversing via the original IN movements. Falls back to line-item
   * batch lookup when no movements were recorded.
   *
   * Called from void-purchase.ts inside dbTransaction.
   */
  applyPurchaseVoid({ purchaseId, purchaseIdDisplay, items, movementsToReverse, inventoryCollection, movementCollection, ctx }: ApplyPurchaseVoidParams): void {
    const now = new Date()

    if (movementsToReverse.length > 0) {
      for (const movement of movementsToReverse) {
        if (inventoryCollection.has(movement.inventoryId)) {
          inventoryCollection.update(movement.inventoryId, draft => {
            draft.quantity = Math.max(0, draft.quantity - movement.quantity)
          })
        }

        movementCollection.insert({
          id: crypto.randomUUID(),
          variantId: movement.variantId,
          inventoryId: movement.inventoryId,
          userId: ctx.userId,
          quantity: movement.quantity,
          unitId: movement.unitId,
          type: MovementType.OUT,
          reason: `Void: ${purchaseIdDisplay}`,
          transactionId: null,
          targetBranchId: null,
          purchaseId,
          locationId: movement.locationId,
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          updatedAt: now,
          createdAt: now,
          operationalTaskId: null,
        })
      }
      return
    }

    // Fallback: no movement records found — use line items with batch lookup
    for (const item of items) {
      const batch = [...inventoryCollection.values()].find(i => i.variantId === item.variantId && i.batchNumber === `PO-${purchaseIdDisplay}`)
      if (!batch) continue

      inventoryCollection.update(batch.id, draft => {
        draft.quantity = Math.max(0, draft.quantity - item.quantity)
      })

      movementCollection.insert({
        id: crypto.randomUUID(),
        variantId: item.variantId,
        inventoryId: batch.id,
        userId: ctx.userId,
        quantity: item.quantity,
        unitId: item.unitId,
        type: MovementType.OUT,
        reason: `Void: ${purchaseIdDisplay}`,
        transactionId: null,
        targetBranchId: null,
        purchaseId,
        locationId: ctx.branchId,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        updatedAt: now,
        createdAt: now,
        operationalTaskId: null,
      })
    }
  },

  /**
   * Apply a manual inventory adjustment with a stated reason.
   *
   * Creates or updates the inventory batch keyed by batchNumber, and inserts
   * an IN movement record as the audit trail.
   *
   * Called from restock-ingredient.ts inside dbTransaction.
   */
  applyAdjustment({
    variantId,
    batchNumber,
    quantity,
    locationId,
    costPrice,
    expiryDate,
    unitId,
    purchaseId,
    structuredId,
    reason,
    inventoryCollection,
    movementCollection,
    ctx,
  }: ApplyAdjustmentParams): string {
    const now = new Date()

    const existingBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.batchNumber === batchNumber)

    let inventoryId: string

    if (existingBatch) {
      inventoryId = existingBatch.id
      inventoryCollection.update(inventoryId, draft => {
        draft.quantity += quantity
        draft.costPrice = costPrice
        draft.lastRestocked = now
      })
    } else {
      inventoryId = crypto.randomUUID()
      inventoryCollection.insert({
        id: inventoryId,
        variantId,
        quantity,
        unitId,
        batchNumber,
        costPrice,
        locationId,
        expiryDate,
        lastRestocked: now,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        updatedAt: now,
        createdAt: now,
      })
    }

    movementCollection.insert({
      id: crypto.randomUUID(),
      variantId,
      inventoryId,
      userId: ctx.userId,
      quantity,
      unitId,
      type: MovementType.IN,
      reason: `${reason || 'Restock'}: ${structuredId}`,
      transactionId: null,
      targetBranchId: null,
      purchaseId,
      locationId,
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      updatedAt: now,
      createdAt: now,
      operationalTaskId: null,
    })

    return inventoryId
  },

  /**
   * Apply inventory side-effects when a task is marked as FULFILLED.
   *
   * Handles four task types:
   *   SHELF_REFILL      — deduct source location batch, credit target location batch
   *   BRANCH_TRANSFER   — deduct sending branch batch (receiving branch credited separately)
   *   STOCK_COUNT       — set batch quantity to physically counted value
   *   WASTE_DISPOSAL    — deduct wasted quantity from batch
   *
   * B6 fix applied: WASTE_DISPOSAL uses 'WASTE' movement type (not 'OUT').
   *                 BRANCH_TRANSFER uses 'EXTERNAL_TRANSFER' (not 'ADJUST').
   *                 SHELF_REFILL uses 'INTERNAL_TRANSFER' (not 'ADJUST').
   *
   * Called from tasks/$taskId/index.tsx inside dbTransaction.
   */
  applyTaskFulfillment({ task, inventoryCollection, movementCollection, ctx }: ApplyTaskFulfillmentParams): void {
    const meta = task.metadata
    const variantId = meta?.variantId
    const qty = meta?.suggestedQty ?? 0

    if (!variantId || qty <= 0) return

    const timestamp = new Date()
    const movementBase = {
      variantId,
      userId: ctx.userId,
      transactionId: null,
      purchaseId: null,
      operationalTaskId: task.id,
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      updatedAt: timestamp,
      createdAt: timestamp,
    }

    if (task.type === TaskType.SHELF_REFILL) {
      const sourceId = meta?.sourceLocationId
      const targetId = meta?.targetLocationId

      const sourceBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === sourceId && i.quantity > 0)

      if (sourceBatch) {
        inventoryCollection.update(sourceBatch.id, draft => {
          draft.quantity -= Math.min(qty, sourceBatch.quantity)
        })
      }

      const targetBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === targetId)

      if (targetBatch) {
        inventoryCollection.update(targetBatch.id, draft => {
          draft.quantity += qty
        })
      } else {
        inventoryCollection.insert({
          id: crypto.randomUUID(),
          variantId,
          quantity: qty,
          unitId: sourceBatch?.unitId ?? '',
          batchNumber: 'SHELF-REFILL',
          costPrice: sourceBatch?.costPrice ?? 0,
          locationId: targetId ?? null,
          expiryDate: null,
          lastRestocked: timestamp,
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          updatedAt: timestamp,
          createdAt: timestamp,
        })
      }

      movementCollection.insert({
        ...movementBase,
        id: crypto.randomUUID(),
        // B6 fix: SHELF_REFILL uses INTERNAL_TRANSFER, not ADJUST
        type: MovementType.INTERNAL_TRANSFER,
        quantity: qty,
        unitId: sourceBatch?.unitId ?? '',
        reason: `Shelf Refill: Task #${task.id.slice(0, 8)}`,
        locationId: targetId ?? null,
        targetBranchId: null,
        inventoryId: targetBatch?.id ?? crypto.randomUUID(),
      })
      return
    }

    if (task.type === TaskType.BRANCH_TRANSFER) {
      const sourceBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.quantity > 0)

      if (sourceBatch) {
        inventoryCollection.update(sourceBatch.id, draft => {
          draft.quantity -= Math.min(qty, sourceBatch.quantity)
        })
      }

      movementCollection.insert({
        ...movementBase,
        id: crypto.randomUUID(),
        // B6 fix: BRANCH_TRANSFER uses EXTERNAL_TRANSFER, not ADJUST
        type: MovementType.EXTERNAL_TRANSFER,
        quantity: qty,
        unitId: sourceBatch?.unitId ?? '',
        reason: `Branch Transfer: Task #${task.id.slice(0, 8)}`,
        locationId: sourceBatch?.locationId ?? null,
        targetBranchId: meta?.targetBranchId ?? null,
        inventoryId: sourceBatch?.id ?? crypto.randomUUID(),
      })
      return
    }

    if (task.type === TaskType.STOCK_COUNT) {
      const existingBatch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === (meta?.locationId ?? null))

      if (existingBatch) {
        const diff = qty - existingBatch.quantity
        inventoryCollection.update(existingBatch.id, draft => {
          draft.quantity = qty
        })
        movementCollection.insert({
          ...movementBase,
          id: crypto.randomUUID(),
          type: MovementType.ADJUST,
          quantity: Math.abs(diff),
          unitId: existingBatch.unitId,
          reason: `Stock Count Reconciliation: Task #${task.id.slice(0, 8)} (${diff >= 0 ? '+' : ''}${diff})`,
          locationId: meta?.locationId ?? null,
          targetBranchId: null,
          inventoryId: existingBatch.id,
        })
      }
      return
    }

    if (task.type === TaskType.WASTE_DISPOSAL) {
      const wasteLocationId = meta?.locationId ?? null
      const batch = [...inventoryCollection.values()].find(i => i.variantId === variantId && i.locationId === wasteLocationId && i.quantity > 0)

      if (batch) {
        inventoryCollection.update(batch.id, draft => {
          draft.quantity -= Math.min(qty, batch.quantity)
        })
        movementCollection.insert({
          ...movementBase,
          id: crypto.randomUUID(),
          // B6 fix: WASTE_DISPOSAL uses WASTE, not OUT
          type: MovementType.WASTE,
          quantity: qty,
          unitId: batch.unitId,
          reason: `Waste Disposal: Task #${task.id.slice(0, 8)}`,
          locationId: wasteLocationId,
          targetBranchId: null,
          inventoryId: batch.id,
        })
      }
    }
  },

  /**
   * Create the auto-generated SHELF_REFILL task when a LowStockDetected
   * condition is confirmed. This is the task-creation logic extracted from
   * NotificationEngine.checkLowStock (A6 — cross-domain violation fix).
   *
   * The Notification domain retains only the send() call after this method
   * handles the task record insertion.
   *
   * Called from NotificationEngine.checkLowStock inside dbTransaction.
   */
  handleLowStockDetected({ variantId, currentTotal, threshold, productLink, operationalTaskCollection, ctx }: HandleLowStockDetectedParams): void {
    const suggestedQty = threshold - currentTotal > 0 ? threshold - currentTotal : 10

    operationalTaskCollection.insert({
      id: crypto.randomUUID(),
      type: TaskType.SHELF_REFILL,
      status: TaskStatus.PENDING,
      notes: `Auto-generated task: Low stock threshold breached for variant ${variantId}`,
      dueDate: new Date(),
      creatorId: ctx.userId,
      approverId: ctx.userId,
      clerkId: ctx.userId,
      metadata: {
        variantId,
        currentTotal,
        link: productLink,
        suggestedQty,
        approvedQty: suggestedQty,
        verifiedQty: null,
      },
      approvedAt: new Date(),
      inProgressAt: new Date(),
      fulfilledAt: null,
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
      reviewerId: null,
      canceledAt: null,
      cancelerId: null,
    })
  },
}
