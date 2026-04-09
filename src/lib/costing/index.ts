import { Inventory } from 'prisma/generated/prisma/browser'
import { UnitEngine } from '../conversion/unit-engine'
import { FIFOEngine } from './fifo-engine'
import { MovingAverageEngine } from './moving-average-engine'
import { SpecificEngine } from './specific-engine'
import { CostingParams, CostingResult, CostingStrategyType, InventoryBatchDTO } from './types'

export class CostingService {
  static prepareConsumption(strategy: CostingStrategyType, params: CostingParams, inventory: Inventory[]): CostingResult {
    const { quantity, unit } = params

    // 1. Always convert to the Base Unit defined in your UnitEngine
    const requiredBaseQty = UnitEngine.toBase(quantity, unit)

    // 2. Map Prisma Inventory to DTO
    const batches: InventoryBatchDTO[] = inventory.map(i => ({
      id: i.id,
      quantity: i.quantity, // Float in schema
      costPrice: i.costPrice, // Int in schema (cents)
    }))

    switch (strategy) {
      case 'FIFO':
        return FIFOEngine.consume(batches, requiredBaseQty)

      case 'MOVING_AVERAGE': {
        const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0)
        const totalValue = batches.reduce((sum, b) => sum + b.quantity * b.costPrice, 0)

        if (totalQty === 0) throw new Error('No inventory available for average calculation')

        const avgCost = totalValue / totalQty

        const result = MovingAverageEngine.consume(totalQty, avgCost, requiredBaseQty)

        return {
          totalCost: Math.round(result.totalCost), // Ensure cents are rounded
          consumed: batches.map(b => {
            const share = b.quantity / totalQty
            const consumedQty = share * requiredBaseQty
            return {
              inventoryId: b.id,
              quantity: consumedQty,
              cost: Math.round(consumedQty * avgCost),
            }
          }),
        }
      }

      case 'SPECIFIC':
        return SpecificEngine.consume(batches)

      default:
        throw new Error(`Strategy ${strategy} not implemented`)
    }
  }
}
