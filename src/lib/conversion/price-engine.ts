import { authStore } from '@/store/auth-store'
import { Unit } from 'prisma/generated/prisma/browser'
import { UnitEngine } from './unit-engine'

export class PriceEngine {
  // --- 1. THE "MONEY UTILS" (Now internal to the Engine) ---

  /** Converts Dollars to Cents: 19.99 -> 1999 */
  static toCents(amount: number): number {
    return Math.round(amount * 100)
  }

  /** Converts Cents to Dollars: 1999 -> 19.99 */
  static toDollars(cents: number): number {
    return cents / 100
  }

  /** Formats Cents for the UI: 1999 -> "$19.99" */
  static format(cents: number): string {
    const { user } = authStore.state

    return new Intl.NumberFormat(user.branch?.locale || 'en-PH', {
      style: 'currency',
      currency: user.branch?.currency || 'PHP',
    }).format(this.toDollars(cents))
  }

  // --- 2. THE "UNIT MATH" (Business Logic) ---

  /** Cost per BASE unit (Result is a float-cent) */
  static costPerBase(unitCostCents: number, unit: Unit): number {
    return unitCostCents / unit.conversionFactor
  }

  /** Price per BASE unit (Result is a float-cent) */
  static pricePerBase(priceCents: number, unit: Unit): number {
    return priceCents / unit.conversionFactor
  }

  /** * Compute total for a line item.
   * Logic: (Qty * Conversion) * (Price / Conversion)
   * CRITICAL: We round at the very end to keep the Integer safe.
   */
  static calculateLineTotal(quantity: number, unit: Unit, priceCents: number): number {
    const baseQty = UnitEngine.toBase(quantity, unit)
    const pPerBase = this.pricePerBase(priceCents, unit)
    return Math.round(baseQty * pPerBase)
  }

  /** * Apply a percentage (like Buffer or Tax)
   * Example: applyRate(1000, 20) -> 200 (20% of $10.00)
   */
  static applyRate(cents: number, ratePercentage: number): number {
    return Math.round((cents * ratePercentage) / 100)
  }
}
