import type { CostingResult, InventoryBatchDTO } from './types'

export const MovingAverageEngine = {
  /**
   * Consumes quantity using the weighted average cost.
   * In a multi-batch system, we distribute the requirement across all batches
   * based on their share of the total stock to keep the math clean.
   */
  consume(batches: InventoryBatchDTO[], requiredQty: number): CostingResult {
    const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0)
    const totalValue = batches.reduce((sum, b) => sum + b.quantity * b.costPrice, 0)

    // 1. Validation
    if (totalQty === 0) {
      throw new Error('MOVING_AVERAGE_ERROR: No stock available to calculate average.')
    }

    if (requiredQty > totalQty + 0.000001) {
      throw new Error(`MOVING_AVERAGE_ERROR: Insufficient stock. Required: ${requiredQty}, Available: ${totalQty}`)
    }

    // 2. Calculate the Average Cost per Base Unit
    const avgCost = totalValue / totalQty
    const totalCost = Math.round(requiredQty * avgCost)

    // 3. Distribute consumption across batches
    // We consume a proportional "slice" from every batch currently in stock
    const consumed = batches.map(batch => {
      const shareOfTotal = batch.quantity / totalQty
      const consumedFromThisBatch = shareOfTotal * requiredQty
      const costForThisBatch = Math.round(consumedFromThisBatch * avgCost)

      return {
        inventoryId: batch.id,
        quantity: consumedFromThisBatch,
        cost: costForThisBatch,
      }
    })

    return {
      totalCost,
      consumed,
    }
  },
}
