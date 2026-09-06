/**
 * finished-goods-engine.ts
 *
 * Handles consumption of finished goods during POS transactions with optimistic
 * locking to prevent race conditions when two terminals sell the last units.
 *
 * CRITICAL: This engine implements optimistic locking using the version column
 * to prevent the double-sale race condition. See CONCURRENCY-CONTROL-REQUIREMENT.md
 * for detailed analysis.
 *
 * Architecture:
 *   - All methods are synchronous (called inside dbTransaction)
 *   - Uses version column for optimistic locking
 *   - FIFO consumption (oldest producedAt first)
 *   - Throws ConcurrencyError on version mismatch (caller must retry)
 *   - Follows existing InventoryEngine patterns
 *
 * Reference: production-module-spec.md Phase 2.2, production-edge-cases.md §3
 */

import type {
  inventoryCollection as InventoryCollectionType,
  inventoryMovementCollection as MovementCollectionType,
  productVariantCollection as ProductVariantCollectionType,
} from '@platform/db/collections'
import { InventoryType, MovementType } from 'prisma/generated/prisma/enums'
import { getInventoryMode, InventoryPolicy } from '@/lib/inventory'

// ---------------------------------------------------------------------------
// ConcurrencyError - thrown when version check fails
// ---------------------------------------------------------------------------

/**
 * ConcurrencyError indicates that another transaction modified the inventory
 * between this transaction's read and write operations.
 *
 * When this error is thrown, the caller MUST retry the entire transaction
 * (not just the failed operation) with exponential backoff.
 *
 * This is distinct from OutOfStockError which indicates insufficient inventory
 * and should NOT be retried.
 */
export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConcurrencyError'
  }
}

// ---------------------------------------------------------------------------
// Shared tenant-context type
// ---------------------------------------------------------------------------

interface TenantContext {
  userId: string
  branchId: string
  businessId: string
}

// ---------------------------------------------------------------------------
// Consume Finished Goods params
// ---------------------------------------------------------------------------

export interface ConsumeFinishedGoodsParams {
  variantId: string
  quantity: number
  unitId: string
  transactionId: string
  inventoryCollection: typeof InventoryCollectionType
  movementCollection: typeof MovementCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// Consumption Result
// ---------------------------------------------------------------------------

export interface ConsumptionResult {
  consumed: Array<{
    inventoryId: string
    quantity: number
    costPrice: number
  }>
  totalCost: number
}

// ---------------------------------------------------------------------------
// Expiring Batch (for shelf life warnings)
// ---------------------------------------------------------------------------

export interface ExpiringBatch {
  inventoryId: string
  variantId: string
  productName: string
  quantity: number
  producedAt: Date
  shelfLifeHours: number
  hoursRemaining: number
  expiresAt: Date
}

// ---------------------------------------------------------------------------
// FinishedGoodsEngine
// ---------------------------------------------------------------------------

export const FinishedGoodsEngine = {
  /**
   * Consume finished goods using FIFO with optimistic locking.
   *
   * CRITICAL: Version checking prevents race conditions when two POS terminals
   * attempt to sell the last few units simultaneously.
   *
   * Race condition scenario WITHOUT version check:
   *   Terminal A reads: quantity = 5, version = 1
   *   Terminal B reads: quantity = 5, version = 1
   *   Terminal A writes: quantity = 2  ✓
   *   Terminal B writes: quantity = 2  ✓
   *   Result: -1 units (NEGATIVE INVENTORY BUG)
   *
   * WITH version check (this implementation):
   *   Terminal A reads: quantity = 5, version = 1
   *   Terminal B reads: quantity = 5, version = 1
   *   Terminal A writes: quantity = 2, version = 2 WHERE version = 1  ✓
   *   Terminal B writes: quantity = 2, version = 2 WHERE version = 1  ✗
   *   Result: ConcurrencyError thrown, terminal B retries, sees quantity = 2,
   *           correctly shows out-of-stock error
   *
   * Flow:
   *   1. Get finished goods batches sorted by producedAt (FIFO)
   *   2. Check total availability
   *   3. Consume from oldest batches first with version checking
   *   4. Throw ConcurrencyError if version mismatch detected
   *   5. Create MOVEMENT_OUT records for audit trail
   *
   * @throws ConcurrencyError when version mismatch detected (caller must retry)
   * @throws Error when insufficient finished goods available (do NOT retry)
   */
  consumeFinishedGoods(params: ConsumeFinishedGoodsParams): ConsumptionResult {
    const { variantId, quantity, unitId, transactionId, inventoryCollection, movementCollection, ctx } = params

    const now = new Date()

    // Get finished goods batches sorted by producedAt (oldest first = FIFO)
    const finishedBatches = [...inventoryCollection.values()]
      .filter(i => i.variantId === variantId && i.branchId === ctx.branchId && i.inventoryType === InventoryType.FINISHED_GOOD && i.quantity > 0)
      .sort((a, b) => {
        const aTime = (a.producedAt || a.createdAt).getTime()
        const bTime = (b.producedAt || b.createdAt).getTime()
        return aTime - bTime // Oldest first
      })

    // Check total availability BEFORE attempting to consume
    const totalAvailable = finishedBatches.reduce((sum, b) => sum + b.quantity, 0)

    // Get inventory mode for validation
    const inventoryMode = getInventoryMode(ctx.businessId)

    // INVENTORY MODE VALIDATION: Check if sufficient finished goods exist based on mode
    // - strict mode: blocks sale if insufficient finished goods
    // - relaxed mode: allows sale (finished goods can go negative for reconciliation)
    // - none mode: skips validation (no inventory tracking)
    try {
      InventoryPolicy.validateDeduction(variantId, totalAvailable, quantity, inventoryMode)
    } catch (_error) {
      // Validation failed (strict mode with insufficient stock)
      // DO NOT RETRY - this is out-of-stock, not a concurrency conflict
      throw new Error(
        `Insufficient finished goods for variant ${variantId}. Available: ${totalAvailable}, Required: ${quantity}. Please prepare more inventory.`,
      )
    }

    // Consume from batches using FIFO with version checking
    let remaining = quantity
    const consumed: ConsumptionResult['consumed'] = []
    let totalCost = 0

    for (const batch of finishedBatches) {
      if (remaining <= 0) break

      const toConsume = Math.min(batch.quantity, remaining)
      const expectedVersion = batch.version

      // CRITICAL: Version check prevents race condition
      // If another transaction modified this batch between our read and write,
      // the version will have changed and we throw ConcurrencyError
      inventoryCollection.update(batch.id, draft => {
        if (draft.version !== expectedVersion) {
          throw new ConcurrencyError(
            `Inventory ${batch.id} was modified by another transaction. ` +
              `Expected version ${expectedVersion}, found ${draft.version}. ` +
              `This transaction will be retried.`,
          )
        }

        // Deduct quantity and increment version
        draft.quantity -= toConsume
        draft.version += 1
        draft.updatedAt = now
      })

      // Calculate cost for this consumption
      const cost = Math.round(toConsume * batch.costPrice)
      totalCost += cost

      consumed.push({
        inventoryId: batch.id,
        quantity: toConsume,
        costPrice: batch.costPrice,
      })

      // Create OUT movement for audit trail
      movementCollection.insert({
        id: crypto.randomUUID(),
        variantId,
        inventoryId: batch.id,
        userId: ctx.userId,
        quantity: toConsume,
        unitId,
        type: MovementType.OUT,
        reason: `Sale: Transaction ${transactionId}`,
        transactionId,
        targetBranchId: null,
        purchaseId: null,
        productionOrderId: batch.productionOrderId,
        locationId: null,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        operationalTaskId: null,
        createdAt: now,
        updatedAt: now,
      })

      remaining -= toConsume
    }

    // Verify we consumed exactly what was requested
    if (remaining > 0.000001) {
      throw new Error(
        `Consumption verification failed: ${remaining} units remaining after FIFO consumption. This should not happen if total availability check passed.`,
      )
    }

    return {
      consumed,
      totalCost,
    }
  },

  /**
   * Check if sufficient finished goods exist for a sale.
   *
   * This is a read-only check. The actual consumption happens in consumeFinishedGoods()
   * which includes the version checking for race condition prevention.
   *
   * Use this for UI validation or pre-flight checks before attempting a transaction.
   */
  checkAvailability(variantId: string, quantity: number, branchId: string, inventoryCollection: typeof InventoryCollectionType): boolean {
    const totalAvailable = [...inventoryCollection.values()]
      .filter(i => i.variantId === variantId && i.branchId === branchId && i.inventoryType === InventoryType.FINISHED_GOOD && i.quantity > 0)
      .reduce((sum, b) => sum + b.quantity, 0)

    return totalAvailable >= quantity
  },

  /**
   * Get batches approaching expiry (based on shelfLifeHours).
   *
   * Returns batches that will expire within the specified threshold.
   * Used for shelf life warnings in the preparation UI.
   *
   * Note: This is for WARNINGS only. The system does NOT automatically
   * waste expired inventory. User must explicitly record waste.
   */
  getBatchesApproachingExpiry(
    branchId: string,
    hoursThreshold: number,
    inventoryCollection: typeof InventoryCollectionType,
    productVariantCollection: typeof ProductVariantCollectionType,
  ): ExpiringBatch[] {
    const now = new Date()
    const expiringBatches: ExpiringBatch[] = []

    // Get all finished goods with shelf life configured
    const finishedGoods = [...inventoryCollection.values()].filter(
      i => i.branchId === branchId && i.inventoryType === InventoryType.FINISHED_GOOD && i.quantity > 0,
    )

    for (const batch of finishedGoods) {
      const variant = productVariantCollection.get(batch.variantId)
      if (!variant?.shelfLifeHours) continue

      const producedAt = batch.producedAt || batch.createdAt
      const expiresAt = new Date(producedAt.getTime() + variant.shelfLifeHours * 60 * 60 * 1000)
      const hoursRemaining = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)

      // Only include batches within the threshold and not yet expired
      if (hoursRemaining <= hoursThreshold && hoursRemaining > 0) {
        expiringBatches.push({
          inventoryId: batch.id,
          variantId: batch.variantId,
          productName: variant.name || variant.product?.name || 'Unknown',
          quantity: batch.quantity,
          producedAt,
          shelfLifeHours: variant.shelfLifeHours,
          hoursRemaining: Math.max(0, hoursRemaining),
          expiresAt,
        })
      }
    }

    // Sort by hours remaining (soonest expiry first)
    return expiringBatches.sort((a, b) => a.hoursRemaining - b.hoursRemaining)
  },

  /**
   * Get total finished goods quantity for a variant.
   *
   * Simple aggregation across all finished goods batches.
   * Used for low stock detection and UI displays.
   */
  getTotalFinishedGoods(variantId: string, branchId: string, inventoryCollection: typeof InventoryCollectionType): number {
    return [...inventoryCollection.values()]
      .filter(i => i.variantId === variantId && i.branchId === branchId && i.inventoryType === InventoryType.FINISHED_GOOD && i.quantity > 0)
      .reduce((sum, b) => sum + b.quantity, 0)
  },

  /**
   * Get detailed finished goods inventory breakdown.
   *
   * Returns all batches with their metadata sorted by age (oldest first).
   * Useful for inventory management UI showing batch details.
   */
  getFinishedGoodsBatches(
    variantId: string,
    branchId: string,
    inventoryCollection: typeof InventoryCollectionType,
    productVariantCollection: typeof ProductVariantCollectionType,
  ): Array<{
    inventoryId: string
    quantity: number
    costPrice: number
    producedAt: Date
    ageHours: number
    expiresAt: Date | null
    hoursRemaining: number | null
    productionOrderId: string | null
  }> {
    const now = new Date()
    const variant = productVariantCollection.get(variantId)

    return [...inventoryCollection.values()]
      .filter(i => i.variantId === variantId && i.branchId === branchId && i.inventoryType === InventoryType.FINISHED_GOOD && i.quantity > 0)
      .sort((a, b) => {
        const aTime = (a.producedAt || a.createdAt).getTime()
        const bTime = (b.producedAt || b.createdAt).getTime()
        return aTime - bTime // Oldest first
      })
      .map(batch => {
        const producedAt = batch.producedAt || batch.createdAt
        const ageHours = (now.getTime() - producedAt.getTime()) / (1000 * 60 * 60)

        let expiresAt: Date | null = null
        let hoursRemaining: number | null = null

        if (variant?.shelfLifeHours) {
          expiresAt = new Date(producedAt.getTime() + variant.shelfLifeHours * 60 * 60 * 1000)
          hoursRemaining = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        }

        return {
          inventoryId: batch.id,
          quantity: batch.quantity,
          costPrice: batch.costPrice,
          producedAt,
          ageHours,
          expiresAt,
          hoursRemaining,
          productionOrderId: batch.productionOrderId,
        }
      })
  },
}
