import type { Unit } from 'prisma/generated/prisma/browser'
import { authStore } from '@/store/auth-store'
import { UnitEngine } from './unit-engine'

export const PriceEngine = {
  /** Converts Dollars to Cents: 19.99 -> 1999 */
  toCents(amount: number): number {
    return Math.round(amount * 100)
  },

  /** Converts Cents to Dollars: 1999 -> 19.99 */
  toDollars(cents: number): number {
    return cents / 100
  },

  /** Formats Cents for the UI: 1999 -> "$19.99" */
  format(cents: number): string {
    const { user } = authStore.state

    return new Intl.NumberFormat(user.configs.LOCALE, {
      style: 'currency',
      currency: user.configs.CURRENCY,
    }).format(this.toDollars(cents))
  },

  /** Cost per BASE unit (Result is a float-cent) */
  costPerBase(unitCostCents: number, unit: Unit): number {
    return unitCostCents / unit.conversionFactor
  },

  /** Price per BASE unit (Result is a float-cent) */
  pricePerBase(priceCents: number, unit: Unit): number {
    return priceCents / unit.conversionFactor
  },

  /** * Compute total for a line item.
   * Logic: (Qty * Conversion) * (Price / Conversion)
   * CRITICAL: We round at the very end to keep the Integer safe.
   */
  calculateLineTotal(quantity: number, unit: Unit, priceCents: number): number {
    const baseQty = UnitEngine.toBase(quantity, unit)
    const pPerBase = this.pricePerBase(priceCents, unit)
    return Math.round(baseQty * pPerBase)
  },

  /** * Apply a percentage (like Buffer or Tax)
   * Example: applyRate(1000, 20) -> 200 (20% of $10.00)
   */
  applyRate(cents: number, ratePercentage: number): number {
    return Math.round((cents * ratePercentage) / 100)
  },
}
