import type { Unit } from 'prisma/generated/prisma/browser'
import { UnitEngine } from './unit-engine'

/**
 * PriceEngine — pure math utilities for price/cost calculations.
 *
 * Note: format() is intentionally excluded here because it depends on
 * authStore (a web-app concern). It lives in apps/web/src/lib/conversion/price-engine.ts
 * which re-exports everything here and adds format() on top.
 */
export const PriceEngine = {
  /** Converts Dollars to Cents: 19.99 -> 1999 */
  toCents(amount: number): number {
    return Math.round(amount * 100)
  },

  /** Converts Cents to Dollars: 1999 -> 19.99 */
  toDollars(cents: number): number {
    return cents / 100
  },

  /** Cost per BASE unit (Result is a float-cent) */
  costPerBase(unitCostCents: number, unit: Unit): number {
    return unitCostCents / unit.conversionFactor
  },

  /** Price per BASE unit (Result is a float-cent) */
  pricePerBase(priceCents: number, unit: Unit): number {
    return priceCents / unit.conversionFactor
  },

  /**
   * Compute total for a line item.
   * Logic: (Qty * Conversion) * (Price / Conversion)
   * CRITICAL: We round at the very end to keep the Integer safe.
   */
  calculateLineTotal(quantity: number, unit: Unit, priceCents: number): number {
    const baseQty = UnitEngine.toBase(quantity, unit)
    const pPerBase = this.pricePerBase(priceCents, unit)
    return Math.round(baseQty * pPerBase)
  },

  /**
   * Apply a percentage (like Buffer or Tax)
   * Example: applyRate(1000, 20) -> 200 (20% of $10.00)
   */
  applyRate(cents: number, ratePercentage: number): number {
    return Math.round((cents * ratePercentage) / 100)
  },
}
