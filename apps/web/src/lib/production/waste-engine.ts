/**
 * waste-engine.ts
 *
 * Engine for tracking explicit waste of finished goods. Waste is NEVER automatic -
 * it must be explicitly recorded by the user through the UI.
 *
 * Architecture:
 *   - All methods are synchronous (called inside dbTransaction)
 *   - Creates WASTE movements for audit trail
 *   - Uses FIFO for selecting batches to waste (oldest first)
 *   - Tracks waste reasons for analytics
 *
 * Reference: production-module-spec.md Phase 2.3
 */

import type { inventoryCollection as InventoryCollectionType, inventoryMovementCollection as MovementCollectionType } from '@platform/db/collections'
import { InventoryType, MovementType } from 'prisma/generated/prisma/enums'
import { getInventoryMode, InventoryPolicy } from '@/lib/inventory'

// ---------------------------------------------------------------------------
// Shared tenant-context type
// ---------------------------------------------------------------------------

interface TenantContext {
  userId: string
  branchId: string
  businessId: string
}

// ---------------------------------------------------------------------------
// Record Waste params
// ---------------------------------------------------------------------------

export interface RecordWasteParams {
  variantId: string
  quantity: number
  unitId: string
  reason: string
  notes?: string
  inventoryIds?: string[] // Specific batches to waste (optional, defaults to FIFO)
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// Waste Summary for reporting
// ---------------------------------------------------------------------------

export interface WasteSummary {
  totalQuantity: number
  totalValue: number // Cost in cents
  byReason: Array<{
    reason: string
    quantity: number
    value: number
    count: number // Number of waste events
  }>
  byProduct: Array<{
    variantId: string
    productName: string
    quantity: number
    value: number
  }>
}

// ---------------------------------------------------------------------------
// Date range for queries
// ---------------------------------------------------------------------------

export interface DateRange {
  start: Date
  end: Date
}

// ---------------------------------------------------------------------------
// Waste Engine
// ---------------------------------------------------------------------------

export const WasteEngine = {
  /**
   * Record waste for finished goods.
   *
   * IMPORTANT: This is ONLY called when user explicitly records waste through UI.
   * There is NO automatic waste at end of day or when shelf life expires.
   *
   * Uses FIFO to select oldest batches first (unless specific inventoryIds provided).
   * Creates WASTE movements for audit trail.
   * Reduces inventory quantity.
   */
  recordWaste(
    params: RecordWasteParams,
    inventoryCollection: typeof InventoryCollectionType,
    movementCollection: typeof MovementCollectionType,
  ): { success: true; wastedBatches: Array<{ inventoryId: string; quantity: number; cost: number }> } {
    const { variantId, quantity, unitId, reason, notes, inventoryIds, ctx } = params

    if (quantity <= 0) {
      throw new Error('Waste quantity must be greater than 0')
    }

    const now = new Date()
    const wastedBatches: Array<{ inventoryId: string; quantity: number; cost: number }> = []

    // Get finished goods batches
    let batches = [...inventoryCollection.values()].filter(
      i => i.variantId === variantId && i.branchId === ctx.branchId && i.inventoryType === InventoryType.FINISHED_GOOD && i.quantity > 0,
    )

    // If specific inventory IDs provided, filter to those
    if (inventoryIds && inventoryIds.length > 0) {
      batches = batches.filter(b => inventoryIds.includes(b.id))
    }

    // Sort by FIFO (oldest producedAt first)
    batches.sort((a, b) => {
      const aTime = (a.producedAt || a.createdAt).getTime()
      const bTime = (b.producedAt || b.createdAt).getTime()
      return aTime - bTime
    })

    // Check total available
    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0)

    // Get inventory mode for validation
    const inventoryMode = getInventoryMode(ctx.businessId)

    // INVENTORY MODE VALIDATION: Check if waste disposal is allowed based on mode
    // - strict mode: cannot dispose more than exists (standard validation)
    // - relaxed mode: can dispose even if negative (for reconciliation scenarios)
    // - none mode: skip validation (no inventory tracking)
    //
    // Note: Waste validation is special. In relaxed mode, you might have:
    // - Recorded inventory: -5 units (sold 5 without preparing)
    // - Physical count: 0 units
    // - Waste recording: Dispose 5 units to reconcile back to -10
    //
    // This is different from InventoryPolicy.validateWasteDisposal() which
    // doesn't allow disposing more than exists. For production waste, we
    // use validateDeduction() which respects relaxed mode.
    if (inventoryMode !== 'none') {
      try {
        InventoryPolicy.validateDeduction(variantId, totalAvailable, quantity, inventoryMode)
      } catch (error) {
        // Validation failed (strict mode with insufficient stock)
        throw new Error(`Insufficient finished goods to waste. Available: ${totalAvailable}, Requested: ${quantity}`)
      }
    }

    // Consume from oldest batches first (FIFO)
    let remaining = quantity
    for (const batch of batches) {
      if (remaining <= 0) break

      const toWaste = Math.min(batch.quantity, remaining)
      const cost = Math.round((batch.costPrice || 0) * toWaste)

      // Update inventory
      inventoryCollection.update(batch.id, draft => {
        draft.quantity -= toWaste
        draft.updatedAt = now
      })

      // Create WASTE movement
      const reasonText = notes ? `${reason} - ${notes}` : reason

      movementCollection.insert({
        id: crypto.randomUUID(),
        variantId,
        inventoryId: batch.id,
        transactionId: null,
        productionOrderId: batch.productionOrderId,
        userId: ctx.userId,
        type: MovementType.WASTE,
        quantity: toWaste,
        reason: `Waste: ${reasonText}`,
        unitId,
        purchaseId: null,
        locationId: null,
        targetBranchId: null,
        operationalTaskId: null,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        createdAt: now,
        updatedAt: now,
      })

      wastedBatches.push({
        inventoryId: batch.id,
        quantity: toWaste,
        cost,
      })

      remaining -= toWaste
    }

    return {
      success: true,
      wastedBatches,
    }
  },

  /**
   * Get waste summary for reporting.
   *
   * Aggregates waste movements by reason and product for analytics.
   * Used for waste analysis dashboard and reports.
   */
  getWasteSummary(
    branchId: string,
    dateRange: DateRange,
    movementCollection: typeof MovementCollectionType,
    inventoryCollection: typeof InventoryCollectionType,
  ): WasteSummary {
    // Get all waste movements in date range
    const wasteMovements = [...movementCollection.values()].filter(
      m => m.branchId === branchId && m.type === MovementType.WASTE && new Date(m.createdAt) >= dateRange.start && new Date(m.createdAt) <= dateRange.end,
    )

    // Aggregate by reason
    const byReasonMap = new Map<string, { quantity: number; value: number; count: number }>()

    for (const movement of wasteMovements) {
      // Extract reason from movement reason text (format: "Waste: {reason}")
      const reasonMatch = movement.reason?.match(/^Waste: (.+?)(?:\s-\s.+)?$/)
      const reason = reasonMatch ? reasonMatch[1] : 'Unknown'

      // Get inventory to calculate value
      const inventory = inventoryCollection.get(movement.inventoryId)
      const value = inventory ? Math.round((inventory.costPrice || 0) * movement.quantity) : 0

      const existing = byReasonMap.get(reason) || { quantity: 0, value: 0, count: 0 }
      byReasonMap.set(reason, {
        quantity: existing.quantity + movement.quantity,
        value: existing.value + value,
        count: existing.count + 1,
      })
    }

    const byReason = Array.from(byReasonMap.entries())
      .map(([reason, data]) => ({
        reason,
        quantity: data.quantity,
        value: data.value,
        count: data.count,
      }))
      .sort((a, b) => b.value - a.value) // Sort by value descending

    // Aggregate by product
    const byProductMap = new Map<string, { productName: string; quantity: number; value: number }>()

    for (const movement of wasteMovements) {
      const inventory = inventoryCollection.get(movement.inventoryId)
      if (!inventory) continue

      const existing = byProductMap.get(movement.variantId) || {
        productName: 'Unknown', // Will be populated from inventory
        quantity: 0,
        value: 0,
      }

      const value = Math.round((inventory.costPrice || 0) * movement.quantity)

      byProductMap.set(movement.variantId, {
        productName: existing.productName, // Keep existing name if already set
        quantity: existing.quantity + movement.quantity,
        value: existing.value + value,
      })
    }

    const byProduct = Array.from(byProductMap.entries())
      .map(([variantId, data]) => ({
        variantId,
        productName: data.productName,
        quantity: data.quantity,
        value: data.value,
      }))
      .sort((a, b) => b.value - a.value) // Sort by value descending

    // Calculate totals
    const totalQuantity = byReason.reduce((sum, r) => sum + r.quantity, 0)
    const totalValue = byReason.reduce((sum, r) => sum + r.value, 0)

    return {
      totalQuantity,
      totalValue,
      byReason,
      byProduct,
    }
  },
}
