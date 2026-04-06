import { FIFOEngine } from './fifo-engine'
import { MovingAverageEngine } from './moving-average-engine'
import { CostingParams, CostingStrategyType } from './types'

import { ConversionService } from '../conversion'
import { mapUnitToDTO } from '../conversion/types'
import { prisma } from '../prisma-client'

export class CostingService {
  // 🔥 MAIN ENTRY
  static async consume(strategy: CostingStrategyType, params: CostingParams) {
    switch (strategy) {
      case 'FIFO':
        return this.consumeFIFO(params)

      case 'MOVING_AVERAGE':
        return this.consumeMovingAverage(params)

      case 'SPECIFIC':
        throw new Error('Use consumeSpecific() for batch-based costing')

      default:
        throw new Error('Invalid costing strategy')
    }
  }

  // =========================
  // FIFO
  // =========================
  static async consumeFIFO(params: CostingParams) {
    const { productId, quantity, unit } = params

    return prisma.$transaction(async tx => {
      const unitDTO = mapUnitToDTO(unit)
      const requiredBaseQty = ConversionService.normalize(quantity, unitDTO)

      const inventory = await tx.inventory.findMany({
        where: { productId },
        orderBy: { createdAt: 'asc' },
      })

      const batches = inventory.map(i => ({
        id: i.id,
        quantity: Number(i.quantity),
        costPrice: Number(i.costPrice),
        createdAt: i.lastRestocked,
      }))

      const result = FIFOEngine.consume(batches, requiredBaseQty)

      // Apply updates
      for (const c of result.consumed!) {
        const batch = inventory.find(b => b.id === c.batchId)!

        await tx.inventory.update({
          where: { id: c.batchId },
          data: {
            quantity: Number(batch.quantity) - c.quantity,
          },
        })
      }

      return result
    })
  }

  // =========================
  // MOVING AVERAGE
  // =========================
  static async consumeMovingAverage(params: CostingParams) {
    const { productId, quantity, unit } = params

    return prisma.$transaction(async tx => {
      const unitDTO = mapUnitToDTO(unit)
      const requiredBaseQty = ConversionService.normalize(quantity, unitDTO)

      const inventory = await tx.inventory.findMany({
        where: { productId },
      })

      const totalQty = inventory.reduce((sum, i) => sum + Number(i.quantity), 0)

      const totalValue = inventory.reduce((sum, i) => sum + Number(i.quantity) * Number(i.costPrice), 0)

      const avgCost = MovingAverageEngine.computeAverage(totalQty, totalValue)

      const result = MovingAverageEngine.consume(totalQty, avgCost, requiredBaseQty)

      // Deduct stock (FIFO style deduction)
      let remaining = requiredBaseQty

      const batches = await tx.inventory.findMany({
        where: { productId },
        orderBy: { createdAt: 'asc' },
      })

      for (const b of batches) {
        if (remaining <= 0) break

        const available = Number(b.quantity)
        const used = Math.min(available, remaining)

        await tx.inventory.update({
          where: { id: b.id },
          data: { quantity: available - used },
        })

        remaining -= used
      }

      return {
        totalCost: result.totalCost,
      }
    })
  }

  // =========================
  // SPECIFIC
  // =========================
  static async consumeSpecific(
    selectedBatches: {
      batchId: string
      quantity: number
    }[],
  ) {
    return prisma.$transaction(async tx => {
      let totalCost = 0

      for (const s of selectedBatches) {
        const batch = await tx.inventory.findUnique({
          where: { id: s.batchId },
        })

        if (!batch) {
          throw new Error('Batch not found')
        }

        if (Number(batch.quantity) < s.quantity) {
          throw new Error('Insufficient stock in selected batch')
        }

        const cost = s.quantity * Number(batch.costPrice)

        totalCost += cost

        await tx.inventory.update({
          where: { id: s.batchId },
          data: {
            quantity: Number(batch.quantity) - s.quantity,
          },
        })
      }

      return { totalCost }
    })
  }
}
