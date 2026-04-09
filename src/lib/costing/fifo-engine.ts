import { CostingResult, InventoryBatchDTO } from './types'
export class FIFOEngine {
  static consume(batches: InventoryBatchDTO[], requiredQty: number): CostingResult {
    let remaining = requiredQty
    let totalCost = 0
    const consumed: CostingResult['consumed'] = []

    // Sort by createdAt or expiry in your query before passing here if needed
    for (const batch of batches) {
      if (remaining <= 0) break
      if (batch.quantity <= 0) continue

      const used = Math.min(batch.quantity, remaining)
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
      throw new Error('Insufficient stock across available batches for FIFO consumption')
    }

    return { totalCost, consumed }
  }
}
