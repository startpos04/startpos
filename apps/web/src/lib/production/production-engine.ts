/**
 * production-engine.ts
 *
 * Core engine for batch preparation operations. Handles both recipe-based and
 * recipe-free production flows. Sole owner of ProductionOrder and ProductionOrderItem
 * mutations.
 *
 * Architecture:
 *   - All methods are synchronous (called inside dbTransaction)
 *   - Receives tenant context explicitly (never reads authStore directly)
 *   - Delegates inventory mutations to InventoryEngine
 *   - Uses UnitEngine for all unit conversions
 *   - Follows FIFO pattern for raw material consumption
 *
 * Reference: production-module-spec.md Phase 2.1
 */

import type {
  inventoryCollection as InventoryCollectionType,
  inventoryMovementCollection as MovementCollectionType,
  productionOrderCollection as ProductionOrderCollectionType,
  productionOrderItemCollection as ProductionOrderItemCollectionType,
  productVariantCollection as ProductVariantCollectionType,
} from '@platform/db/collections'
import { UnitEngine } from '@platform/lib/conversion/unit-engine'
import type { OperationResult } from '@platform/lib/result'
import { opFail, opOk } from '@platform/lib/result'
import type { ProductComponent, Unit } from 'prisma/generated/prisma/browser'
import { InventoryType, MovementType, ProductionStatus } from 'prisma/generated/prisma/enums'
import { FIFOEngine } from '@/lib/costing/fifo-engine'
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
// Material Requirement (for recipe-based production)
// ---------------------------------------------------------------------------

export interface MaterialRequirement {
  materialId: string
  materialName: string
  requiredQuantity: number
  requiredUnit: Unit
  availableQuantity: number
  sufficient: boolean
}

// ---------------------------------------------------------------------------
// Create Production Order params
// ---------------------------------------------------------------------------

export interface CreateProductionOrderParams {
  variantId: string
  quantity: number
  unitId: string
  usesRecipe: boolean
  notes?: string
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// Start Production params (consumes raw materials for recipe-based)
// ---------------------------------------------------------------------------

export interface StartProductionParams {
  orderId: string
  productionOrderCollection: typeof ProductionOrderCollectionType
  productionOrderItemCollection: typeof ProductionOrderItemCollectionType
  productVariantCollection: typeof ProductVariantCollectionType
  inventoryCollection: typeof InventoryCollectionType
  movementCollection: typeof MovementCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// Complete Production params (adds finished goods to inventory)
// ---------------------------------------------------------------------------

export interface CompleteProductionParams {
  orderId: string
  actualQuantity: number
  productionOrderCollection: typeof ProductionOrderCollectionType
  inventoryCollection: typeof InventoryCollectionType
  movementCollection: typeof MovementCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// Cancel Production params
// ---------------------------------------------------------------------------

export interface CancelProductionParams {
  orderId: string
  reason: string
  productionOrderCollection: typeof ProductionOrderCollectionType
  ctx: TenantContext
}

// ---------------------------------------------------------------------------
// Calculate Material Requirements params
// ---------------------------------------------------------------------------

export interface CalculateMaterialRequirementsParams {
  variantId: string
  quantity: number
  productVariantCollection: typeof ProductVariantCollectionType
  inventoryCollection: typeof InventoryCollectionType
  branchId: string
}

// ---------------------------------------------------------------------------
// Production Engine
// ---------------------------------------------------------------------------

export const ProductionEngine = {
  /**
   * Create a new production order (DRAFT status).
   *
   * For recipe-based: validates that variant has components
   * For recipe-free: just records the intention to prepare
   *
   * Does NOT consume raw materials yet — that happens in startProduction()
   */
  createProductionOrder(
    params: CreateProductionOrderParams,
    orderNumber: string,
    productionOrderCollection: typeof ProductionOrderCollectionType,
    productVariantCollection: typeof ProductVariantCollectionType,
  ): OperationResult<string> {
    const { variantId, quantity, unitId, usesRecipe, notes, ctx } = params

    // Validate variant exists
    const variant = productVariantCollection.get(variantId)
    if (!variant) {
      return opFail('NOT_FOUND', `Variant ${variantId} not found`)
    }

    // For recipe-based production, verify variant has components
    if (usesRecipe) {
      const components = [...productVariantCollection.values()].filter(v => v.components?.some((c: ProductComponent) => c.hostId === variantId && !c.isAddon))

      if (components.length === 0) {
        return opFail('PRECONDITION_FAILED', `Variant ${variant.name} has no recipe defined. Set productionUsesRecipe to false for recipe-free production.`)
      }
    }

    const orderId = crypto.randomUUID()
    const now = new Date()

    productionOrderCollection.insert({
      id: orderId,
      orderNumber,
      status: ProductionStatus.DRAFT,
      targetVariantId: variantId,
      targetQuantity: quantity,
      targetUnitId: unitId,
      actualQuantity: null,
      usesRecipe,
      startedAt: null,
      completedAt: null,
      producedById: ctx.userId,
      notes: notes || null,
      totalCost: 0,
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      createdAt: now,
      updatedAt: now,
    })

    return opOk(orderId)
  },

  /**
   * Calculate material requirements for recipe-based production.
   *
   * Uses UnitEngine to convert between recipe units and inventory units.
   * Checks availability across all inventory batches.
   *
   * Returns null for recipe-free production (usesRecipe = false)
   */
  calculateMaterialRequirements(params: CalculateMaterialRequirementsParams): MaterialRequirement[] | null {
    const { variantId, quantity, productVariantCollection, inventoryCollection, branchId } = params

    const variant = productVariantCollection.get(variantId)
    if (!variant) return null

    // Get recipe components (excluding addons)
    const components = variant.components?.filter((c: ProductComponent) => !c.isAddon) || []

    if (components.length === 0) {
      return null // No recipe (recipe-free production)
    }

    const requirements: MaterialRequirement[] = []

    for (const component of components) {
      const material = productVariantCollection.get(component.materialId)
      if (!material) continue

      const componentUnit = { id: component.unitId } as Unit // Will be populated from collection

      // Calculate required quantity in recipe unit
      const requiredInRecipeUnit = component.quantityUsed * quantity

      // Get all inventory batches for this material
      const inventoryBatches = [...inventoryCollection.values()].filter(
        i => i.variantId === component.materialId && i.branchId === branchId && i.inventoryType === InventoryType.RAW_MATERIAL && i.quantity > 0,
      )

      // Convert each batch to recipe unit and sum
      let availableInRecipeUnit = 0
      for (const batch of inventoryBatches) {
        try {
          const batchUnit = {
            id: batch.unitId,
            type: componentUnit.type,
            conversionFactor: 1, // Will be looked up properly
          } as Unit

          const converted = UnitEngine.convert(batch.quantity, batchUnit, componentUnit)
          availableInRecipeUnit += converted
        } catch (error) {
          // Unit conversion error - skip this batch
          console.warn(`Unit conversion error for material ${component.materialId}:`, error)
        }
      }

      requirements.push({
        materialId: component.materialId,
        materialName: material.name || material.product?.name || 'Unknown',
        requiredQuantity: requiredInRecipeUnit,
        requiredUnit: componentUnit,
        availableQuantity: availableInRecipeUnit,
        sufficient: availableInRecipeUnit >= requiredInRecipeUnit,
      })
    }

    return requirements
  },

  /**
   * Start production (DRAFT → IN_PROGRESS).
   *
   * For recipe-based production:
   *   - Validates sufficient raw materials exist
   *   - Consumes raw materials using FIFO
   *   - Creates ProductionOrderItem records
   *   - Creates PRODUCTION_OUT movements
   *
   * For recipe-free production:
   *   - Just changes status to IN_PROGRESS
   */
  startProduction(params: StartProductionParams): OperationResult<void> {
    const { orderId, productionOrderCollection, productionOrderItemCollection, productVariantCollection, inventoryCollection, movementCollection, ctx } = params

    const order = productionOrderCollection.get(orderId)
    if (!order) {
      return opFail('NOT_FOUND', `Production order ${orderId} not found`)
    }

    if (order.status !== ProductionStatus.DRAFT) {
      return opFail('PRECONDITION_FAILED', `Production order must be in DRAFT status (current: ${order.status})`)
    }

    const now = new Date()

    // Recipe-free production: just update status
    if (!order.usesRecipe) {
      productionOrderCollection.update(orderId, draft => {
        draft.status = ProductionStatus.IN_PROGRESS
        draft.startedAt = now
        draft.updatedAt = now
      })
      return opOk()
    }

    // Recipe-based production: consume raw materials
    const variant = productVariantCollection.get(order.targetVariantId)
    if (!variant) {
      return opFail('NOT_FOUND', `Target variant ${order.targetVariantId} not found`)
    }

    const components = variant.components?.filter((c: ProductComponent) => !c.isAddon) || []
    if (components.length === 0) {
      return opFail('PRECONDITION_FAILED', `Variant ${variant.name} has no recipe defined`)
    }

    let totalCost = 0

    // Get inventory mode for validation
    const inventoryMode = getInventoryMode(ctx.businessId)

    // Consume each material using FIFO
    for (const component of components) {
      const requiredQty = component.quantityUsed * order.targetQuantity

      // Get available inventory batches for this material
      const inventoryBatches = [...inventoryCollection.values()]
        .filter(i => i.variantId === component.materialId && i.branchId === ctx.branchId && i.inventoryType === InventoryType.RAW_MATERIAL && i.quantity > 0)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(i => ({
          id: i.id,
          quantity: i.quantity,
          costPrice: i.costPrice,
        }))

      // Calculate total available quantity for this material
      const totalAvailable = inventoryBatches.reduce((sum, batch) => sum + batch.quantity, 0)

      // Get material details for error messages
      const material = productVariantCollection.get(component.materialId)
      const materialName = material?.name || material?.product?.name || 'Unknown material'

      // INVENTORY MODE VALIDATION: Check if sufficient materials exist based on mode
      // - strict mode: blocks production if insufficient materials
      // - relaxed mode: allows production (materials can go negative for reconciliation)
      // - none mode: skips validation (no inventory tracking)
      try {
        InventoryPolicy.validateProductionConsumption(component.materialId, totalAvailable, requiredQty, inventoryMode, materialName)
      } catch (error) {
        // Validation failed (strict mode with insufficient stock)
        return opFail('PRECONDITION_FAILED', error instanceof Error ? error.message : `Insufficient inventory for ${materialName}`)
      }

      // Use FIFO engine to calculate consumption
      let fifoResult
      try {
        fifoResult = FIFOEngine.consume(inventoryBatches, requiredQty)
      } catch (error) {
        return opFail('PRECONDITION_FAILED', `Insufficient inventory for ${materialName}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // Deduct from inventory and create movements
      for (const consumption of fifoResult.consumed || []) {
        // Deduct from inventory
        inventoryCollection.update(consumption.inventoryId, draft => {
          draft.quantity -= consumption.quantity
          draft.updatedAt = now
        })

        // Create PRODUCTION_OUT movement
        movementCollection.insert({
          id: crypto.randomUUID(),
          variantId: component.materialId,
          inventoryId: consumption.inventoryId,
          userId: ctx.userId,
          quantity: consumption.quantity,
          unitId: component.unitId,
          type: MovementType.PRODUCTION_OUT,
          reason: `Production: ${order.orderNumber}`,
          transactionId: null,
          targetBranchId: null,
          purchaseId: null,
          productionOrderId: orderId,
          locationId: null,
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          operationalTaskId: null,
          createdAt: now,
          updatedAt: now,
        })

        // Create ProductionOrderItem record
        productionOrderItemCollection.insert({
          id: crypto.randomUUID(),
          productionOrderId: orderId,
          materialVariantId: component.materialId,
          quantityUsed: consumption.quantity,
          unitId: component.unitId,
          unitCost: Math.round(consumption.cost / consumption.quantity), // Cost per unit
          businessId: ctx.businessId,
        })
      }

      totalCost += fifoResult.totalCost
    }

    // Update production order
    productionOrderCollection.update(orderId, draft => {
      draft.status = ProductionStatus.IN_PROGRESS
      draft.startedAt = now
      draft.totalCost = totalCost
      draft.updatedAt = now
    })

    return opOk()
  },

  /**
   * Complete production (IN_PROGRESS → COMPLETED).
   *
   * Adds finished goods to inventory with proper cost allocation:
   *   - Recipe-based: costPerUnit = totalCost / actualQuantity
   *   - Recipe-free: costPerUnit = 0
   *
   * Creates PRODUCTION_IN movements for finished goods.
   *
   * Handles variance:
   *   - If actualQuantity < target: loss absorbed into higher unit cost
   *   - If actualQuantity = 0: no finished goods created (total loss)
   */
  completeProduction(params: CompleteProductionParams): OperationResult<void> {
    const { orderId, actualQuantity, productionOrderCollection, inventoryCollection, movementCollection, ctx } = params

    const order = productionOrderCollection.get(orderId)
    if (!order) {
      return opFail('NOT_FOUND', `Production order ${orderId} not found`)
    }

    if (order.status !== ProductionStatus.IN_PROGRESS) {
      return opFail('PRECONDITION_FAILED', `Production order must be IN_PROGRESS (current: ${order.status})`)
    }

    if (actualQuantity < 0) {
      return opFail('VALIDATION_FAILED', 'Actual quantity cannot be negative')
    }

    const now = new Date()

    // Calculate cost per unit
    // Recipe-based: allocate total material cost across actual output
    // Recipe-free: no cost tracking (costPerUnit = 0)
    const costPerUnit = actualQuantity > 0 && order.usesRecipe ? Math.round(order.totalCost / actualQuantity) : 0

    // Create finished goods inventory (only if actualQuantity > 0)
    if (actualQuantity > 0) {
      const inventoryId = crypto.randomUUID()

      inventoryCollection.insert({
        id: inventoryId,
        variantId: order.targetVariantId,
        quantity: actualQuantity,
        unitId: order.targetUnitId,
        batchNumber: `PROD-${order.orderNumber}`,
        costPrice: costPerUnit,
        locationId: null,
        expiryDate: null,
        inventoryType: InventoryType.FINISHED_GOOD,
        productionOrderId: orderId,
        producedAt: now,
        version: 1, // Initial version for optimistic locking
        lastRestocked: now,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        createdAt: now,
        updatedAt: now,
      })

      // Create PRODUCTION_IN movement
      movementCollection.insert({
        id: crypto.randomUUID(),
        variantId: order.targetVariantId,
        inventoryId,
        userId: ctx.userId,
        quantity: actualQuantity,
        unitId: order.targetUnitId,
        type: MovementType.PRODUCTION_IN,
        reason: `Production Complete: ${order.orderNumber}`,
        transactionId: null,
        targetBranchId: null,
        purchaseId: null,
        productionOrderId: orderId,
        locationId: null,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        operationalTaskId: null,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Update production order
    productionOrderCollection.update(orderId, draft => {
      draft.status = ProductionStatus.COMPLETED
      draft.actualQuantity = actualQuantity
      draft.completedAt = now
      draft.updatedAt = now

      if (actualQuantity === 0) {
        draft.notes = `${draft.notes || ''}\nTotal loss: No finished goods produced`.trim()
      } else if (actualQuantity < order.targetQuantity) {
        const variance = (((order.targetQuantity - actualQuantity) / order.targetQuantity) * 100).toFixed(1)
        draft.notes = `${draft.notes || ''}\nVariance: ${variance}% below target (${actualQuantity} of ${order.targetQuantity})`.trim()
      }
    })

    return opOk()
  },

  /**
   * Cancel production order (DRAFT → CANCELLED).
   *
   * Can only cancel DRAFT orders (before materials are consumed).
   * Once IN_PROGRESS, must complete the production even if output is 0.
   */
  cancelProduction(params: CancelProductionParams): OperationResult<void> {
    const { orderId, reason, productionOrderCollection, ctx: _ctx } = params

    const order = productionOrderCollection.get(orderId)
    if (!order) {
      return opFail('NOT_FOUND', `Production order ${orderId} not found`)
    }

    if (order.status !== ProductionStatus.DRAFT) {
      return opFail(
        'PRECONDITION_FAILED',
        `Can only cancel DRAFT orders. Order is ${order.status}. For IN_PROGRESS orders, complete with actualQuantity = 0 instead.`,
      )
    }

    const now = new Date()

    productionOrderCollection.update(orderId, draft => {
      draft.status = ProductionStatus.CANCELLED
      draft.notes = `${draft.notes || ''}\nCancelled: ${reason}`.trim()
      draft.updatedAt = now
    })

    return opOk()
  },

  /**
   * Check if a variant can be batch-prepared.
   *
   * Returns true if variant has isBatchPrepared flag set.
   */
  canBatchPrepare(variantId: string, productVariantCollection: typeof ProductVariantCollectionType): boolean {
    const variant = productVariantCollection.get(variantId)
    return variant?.isBatchPrepared ?? false
  },

  /**
   * Get finished goods inventory summary for a variant.
   *
   * Returns total quantity and batch details sorted by age (oldest first).
   */
  getFinishedInventory(
    variantId: string,
    branchId: string,
    inventoryCollection: typeof InventoryCollectionType,
    productVariantCollection: typeof ProductVariantCollectionType,
  ): {
    totalQuantity: number
    batches: Array<{
      inventoryId: string
      quantity: number
      producedAt: Date
      expiresAt: Date | null
      ageHours: number
    }>
  } {
    const variant = productVariantCollection.get(variantId)
    const now = new Date()

    const batches = [...inventoryCollection.values()]
      .filter(i => i.variantId === variantId && i.branchId === branchId && i.inventoryType === InventoryType.FINISHED_GOOD && i.quantity > 0)
      .sort((a, b) => {
        const aTime = (a.producedAt || a.createdAt).getTime()
        const bTime = (b.producedAt || b.createdAt).getTime()
        return aTime - bTime // Oldest first (FIFO)
      })
      .map(i => {
        const producedAt = i.producedAt || i.createdAt
        const ageHours = (now.getTime() - producedAt.getTime()) / (1000 * 60 * 60)
        const expiresAt = variant?.shelfLifeHours ? new Date(producedAt.getTime() + variant.shelfLifeHours * 60 * 60 * 1000) : null

        return {
          inventoryId: i.id,
          quantity: i.quantity,
          producedAt,
          expiresAt,
          ageHours,
        }
      })

    const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0)

    return {
      totalQuantity,
      batches,
    }
  },
}
