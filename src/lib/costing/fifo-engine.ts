import { CostingResult, InventoryBatchDTO } from './types'

export class FIFOEngine {
  static consume(batches: InventoryBatchDTO[], requiredQty: number): CostingResult {
    let remaining = requiredQty
    let totalCost = 0
    const consumed: CostingResult['consumed'] = []

    for (const batch of batches) {
      if (remaining <= 0) break
      if (batch.quantity <= 0) continue

      const used = Math.min(batch.quantity, remaining)
      // costPrice is in cents, used is likely a float (kg/L)
      const cost = Math.round(used * batch.costPrice)

      totalCost += cost
      consumed.push({
        inventoryId: batch.id,
        quantity: used,
        cost,
      })

      remaining -= used
    }

    if (remaining > 0.000001) {
      // Precision check for float math
      throw new Error('Insufficient stock in inventory batches')
    }

    return { totalCost, consumed }
  }
}
