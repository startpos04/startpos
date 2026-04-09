import { Inventory } from 'prisma/generated/prisma/browser'
import { UnitEngine } from '../conversion/unit-engine'
import { FIFOEngine } from './fifo-engine'
import { MovingAverageEngine } from './moving-average-engine'
import { SpecificEngine } from './specific-engine'
import { CostingParams, CostingResult, CostingStrategyType, InventoryBatchDTO } from './types'

export class CostingService {
  /**
   * pure function: prepares the consumption plan based on provided inventory.
   * does not execute prisma queries.
   */
  static prepareConsumption(strategy: CostingStrategyType, params: CostingParams, inventory: Inventory[]): CostingResult {
    const { quantity, unit } = params
    const requiredBaseQty = UnitEngine.toBase(quantity, unit)

    const batches: InventoryBatchDTO[] = inventory.map(i => ({
      id: i.id,
      quantity: Number(i.quantity),
      costPrice: Number(i.costPrice),
    }))

    switch (strategy) {
      case 'FIFO':
        return FIFOEngine.consume(batches, requiredBaseQty)

      case 'MOVING_AVERAGE': {
        // Calculate average from the provided inventory first
        const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0)
        const totalValue = batches.reduce((sum, b) => sum + b.quantity * b.costPrice, 0)
        const avgCost = MovingAverageEngine.computeAverage(totalQty, totalValue)

        // Wrap the engine result in the standard CostingResult format
        const result = MovingAverageEngine.consume(totalQty, avgCost, requiredBaseQty)
        return {
          totalCost: result.totalCost,
          consumed: batches.map(b => ({
            inventoryId: b.id,
            quantity: (b.quantity / totalQty) * requiredBaseQty, // Pro-rata deduction
            cost: (b.quantity / totalQty) * requiredBaseQty * avgCost,
          })),
        }
      }

      case 'SPECIFIC':
        // Specific engine logic usually expects the user-selected batches
        return SpecificEngine.consume(batches)

      default:
        throw new Error(`Strategy ${strategy} not implemented for preparation`)
    }
  }
}
