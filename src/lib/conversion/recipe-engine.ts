// recipe-engine.ts
import { Unit } from 'prisma/generated/prisma/browser'
import { UnitEngine } from './unit-engine'

export class RecipeEngine {
  /** * Computes how much raw material is used.
   * Example: 2 Burgers (orderQty) * 0.25 kg beef (ingredientQty) = 0.5 kg
   */
  static computeMaterialUsage(orderQty: number, orderUnit: Unit, ingredientQty: number, ingredientUnit: Unit): number {
    const orderBase = UnitEngine.toBase(orderQty, orderUnit)
    const ingredientBase = UnitEngine.toBase(ingredientQty, ingredientUnit)

    // Result is the quantity needed in the BASE UNIT of the ingredient
    return UnitEngine.precision(orderBase * ingredientBase)
  }
}
