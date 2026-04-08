import { CostingResult, InventoryBatchDTO } from './types'

export class FIFOEngine {
  static consume(batches: InventoryBatchDTO[], requiredQty: number): CostingResult {
    let remaining = requiredQty
    let totalCost = 0

    const consumed: CostingResult['consumed'] = []

    for (const batch of batches) {
      if (remaining <= 0) break

      const available = batch.quantity
      if (available <= 0) continue

      const used = Math.min(available, remaining)
      const cost = used * batch.costPrice

      totalCost += cost

      consumed.push({
        inventoryId: batch.id,
        quantity: used,
        cost,
      })

      remaining -= used
    }

    if (remaining > 0) {
      throw new Error('Insufficient stock')
    }

    return { totalCost, consumed }
  }
}
