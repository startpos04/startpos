import { UnitEngine } from '@platform/lib/conversion/unit-engine'
import type { Inventory } from 'prisma/generated/prisma/client'
import { FIFOEngine } from './fifo-engine'
import { MovingAverageEngine } from './moving-average-engine'
import { SpecificEngine } from './specific-engine'
import type { CostingParams, CostingResult, CostingStrategyType, InventoryBatchDTO } from './types'

export const CostingEngine = {
  /**
   * Prepares the consumption of inventory based on selected strategy.
   */
  prepareConsumption(strategy: CostingStrategyType, params: CostingParams, inventory: Inventory[]): CostingResult {
    const { quantity, unit } = params

    // 1. Convert to Base Unit
    const requiredBaseQty = UnitEngine.toBase(quantity, unit)

    // 2. Map Prisma Inventory to DTO
    const batches: InventoryBatchDTO[] = inventory.map(i => ({
      id: i.id,
      quantity: i.quantity,
      costPrice: i.costPrice,
    }))

    switch (strategy) {
      case 'FIFO':
        return FIFOEngine.consume(batches, requiredBaseQty)
      case 'MOVING_AVERAGE':
        return MovingAverageEngine.consume(batches, requiredBaseQty)
      case 'SPECIFIC':
        return SpecificEngine.consume(batches, requiredBaseQty)
      default:
        throw new Error(`Strategy ${strategy} not implemented`)
    }
  },
}
