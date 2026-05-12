import type { CostingResult, InventoryBatchDTO } from './types'

export const SpecificEngine = {
  /**
   * For when the user selects the specific batch manually (e.g., Pharmacy/Electronics)
   */
  consume(batches: InventoryBatchDTO[], requiredQty: number): CostingResult {
    let totalCost = 0
    const consumed: CostingResult['consumed'] = []

    for (const b of batches) {
      const cost = Math.round(b.quantity * b.costPrice)
      totalCost += cost
      consumed.push({
        inventoryId: b.id,
        quantity: b.quantity,
        cost,
      })
    }

    // Validation: In Specific, the passed batches' quantities must sum to the requirement
    const totalSelected = batches.reduce((sum, b) => sum + b.quantity, 0)
    if (Math.abs(totalSelected - requiredQty) > 0.000001) {
      throw new Error('Specific batch quantities do not match the required amount')
    }

    return { totalCost, consumed }
  },
}
