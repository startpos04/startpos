/**
 * inventory-policy.ts — Policy layer for inventory enforcement
 * 
 * Separates inventory validation rules from the inventory engine.
 * The stock engine returns TRUTH (actual quantities), and this policy
 * layer enforces RULES based on the inventory mode.
 * 
 * Architecture:
 * ```
 * PosStockEngine (TRUTH) → InventoryPolicy (ENFORCEMENT) → InventoryEngine (MUTATION)
 * ```
 */

import { InsufficientStockError } from './errors'

export type InventoryMode = 'none' | 'relaxed' | 'strict'

/**
 * InventoryPolicy — validation layer for inventory operations
 * 
 * Provides methods to validate inventory operations against the current
 * inventory mode before mutations occur.
 */
export const InventoryPolicy = {
  /**
   * Validates a proposed inventory deduction against the current mode.
   * 
   * - none: Always allows (no validation)
   * - relaxed: Always allows (can go negative)
   * - strict: Throws InsufficientStockError if insufficient stock
   * 
   * @param variantId - The product variant ID being deducted
   * @param currentQuantity - The current available quantity
   * @param requestedQuantity - The quantity being requested for deduction
   * @param inventoryMode - The inventory enforcement mode
   * @param productName - Optional product name for better error messages
   * @param batchId - Optional batch ID if deducting from a specific batch
   * 
   * @throws {InsufficientStockError} When strict mode and insufficient stock
   * 
   * @example
   * ```typescript
   * // Strict mode with sufficient stock - passes
   * InventoryPolicy.validateDeduction('variant-1', 10, 5, 'strict')
   * 
   * // Strict mode with insufficient stock - throws
   * try {
   *   InventoryPolicy.validateDeduction('variant-1', 5, 10, 'strict', 'Coffee')
   * } catch (error) {
   *   if (InsufficientStockError.isInsufficientStockError(error)) {
   *     console.log(error.toUserMessage())
   *   }
   * }
   * 
   * // Relaxed mode with insufficient stock - passes
   * InventoryPolicy.validateDeduction('variant-1', 5, 10, 'relaxed')
   * ```
   */
  validateDeduction(
    variantId: string,
    currentQuantity: number,
    requestedQuantity: number,
    inventoryMode: InventoryMode,
    productName?: string,
    batchId?: string
  ): void {
    // No inventory mode: skip validation entirely
    if (inventoryMode === 'none') {
      return
    }

    // Relaxed mode: allow negative stock (always passes)
    if (inventoryMode === 'relaxed') {
      return
    }

    // Strict mode: reject if would result in negative stock
    const resultingQuantity = currentQuantity - requestedQuantity
    if (resultingQuantity < 0) {
      throw new InsufficientStockError(
        `Cannot deduct ${requestedQuantity} from ${currentQuantity} for ${productName || variantId}`,
        {
          variantId,
          available: currentQuantity,
          requested: requestedQuantity,
          productName,
          batchId,
        }
      )
    }
  },

  /**
   * Checks if a deduction would be allowed without throwing an error.
   * Useful for UI to check if an action is possible before attempting it.
   * 
   * @returns true if the deduction would be allowed, false otherwise
   * 
   * @example
   * ```typescript
   * const canSell = InventoryPolicy.canDeduct(currentStock, 5, 'strict')
   * if (!canSell) {
   *   showOutOfStockMessage()
   * }
   * ```
   */
  canDeduct(
    currentQuantity: number,
    requestedQuantity: number,
    inventoryMode: InventoryMode
  ): boolean {
    // None and relaxed modes always allow
    if (inventoryMode === 'none' || inventoryMode === 'relaxed') {
      return true
    }

    // Strict mode: check if sufficient stock
    return currentQuantity >= requestedQuantity
  },

  /**
   * Validates a batch transfer operation.
   * Similar to validateDeduction but for batch-to-batch transfers.
   * 
   * @throws {InsufficientStockError} When strict mode and insufficient stock in source batch
   */
  validateBatchTransfer(
    sourceBatchId: string,
    sourceQuantity: number,
    transferQuantity: number,
    inventoryMode: InventoryMode,
    productName?: string
  ): void {
    this.validateDeduction(
      sourceBatchId,
      sourceQuantity,
      transferQuantity,
      inventoryMode,
      productName,
      sourceBatchId
    )
  },

  /**
   * Validates a production consumption operation.
   * Used when raw materials are consumed during production.
   * 
   * @throws {InsufficientStockError} When strict mode and insufficient raw materials
   */
  validateProductionConsumption(
    materialId: string,
    availableQuantity: number,
    requiredQuantity: number,
    inventoryMode: InventoryMode,
    materialName?: string
  ): void {
    this.validateDeduction(
      materialId,
      availableQuantity,
      requiredQuantity,
      inventoryMode,
      materialName
    )
  },

  /**
   * Validates a waste disposal operation.
   * Even in strict mode, waste disposal should be allowed (you can't un-spoil goods).
   * However, we validate to ensure the recorded quantity exists.
   * 
   * @throws {InsufficientStockError} When trying to dispose more than exists
   */
  validateWasteDisposal(
    variantId: string,
    availableQuantity: number,
    wasteQuantity: number,
    productName?: string
  ): void {
    // Waste disposal validation: ensure you're not disposing more than exists
    // This is independent of inventory mode - you can't dispose what doesn't exist
    if (wasteQuantity > availableQuantity) {
      throw new InsufficientStockError(
        `Cannot dispose ${wasteQuantity} when only ${availableQuantity} exists`,
        {
          variantId,
          available: availableQuantity,
          requested: wasteQuantity,
          productName,
        }
      )
    }
  },
}
