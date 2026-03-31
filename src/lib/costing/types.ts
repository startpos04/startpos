import { UnitDTO } from '../conversion/types'

export type CostingStrategyType = 'FIFO' | 'MOVING_AVERAGE' | 'SPECIFIC'

export type CostingParams = {
  productId: string
  quantity: number
  unit: UnitDTO
}

export type InventoryBatchDTO = {
  id: string
  quantity: number // BASE UNIT
  costPrice: number // PER BASE UNIT
  createdAt: Date
}

export type CostingResult = {
  totalCost: number
  consumed?: {
    batchId: string
    quantity: number
    cost: number
  }[]
}
