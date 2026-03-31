import { Unit } from 'prisma/generated/prisma/browser'
import { UnitEngine } from './unit-engine'

export class InventoryEngine {
  static addStock(currentQty: number, currentUnit: Unit, addedQty: number, addedUnit: Unit): number {
    const currentBase = UnitEngine.toBase(currentQty, currentUnit)
    const addedBase = UnitEngine.toBase(addedQty, addedUnit)

    return UnitEngine.fromBase(currentBase + addedBase, currentUnit)
  }

  static subtractStock(currentQty: number, currentUnit: Unit, usedQty: number, usedUnit: Unit): number {
    const currentBase = UnitEngine.toBase(currentQty, currentUnit)
    const usedBase = UnitEngine.toBase(usedQty, usedUnit)

    if (usedBase > currentBase) {
      // Small epsilon check to avoid "0.0000000001" blocking a transaction
      if (Math.abs(usedBase - currentBase) > 0.0000001) {
        throw new Error('Insufficient stock')
      }
    }

    return UnitEngine.fromBase(currentBase - usedBase, currentUnit)
  }
}
