import { Unit } from 'prisma/generated/prisma/browser'

export type CostingStrategyType = 'FIFO' | 'MOVING_AVERAGE' | 'SPECIFIC'

export type CostingParams = {
  productId: string
  quantity: number
  unit: Unit
}

export type InventoryBatchDTO = {
  id: string
  quantity: number // BASE UNIT
  costPrice: number // PER BASE UNIT
}

export type CostingResult = {
  totalCost: number
  consumed?: {
    inventoryId: string
    quantity: number
    cost: number
  }[]
}
