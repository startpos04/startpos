import type { Unit } from 'prisma/generated/prisma/browser'

export const UnitEngine = {
  /** Clean up floating point noise (e.g., 1.4999999999 -> 1.5) */
  precision(value: number): number {
    return Number(value.toFixed(10))
  },

  assertSameType(from: Unit, to: Unit) {
    if (from.type !== to.type) {
      throw new Error(`Unit mismatch: ${from.name} (${from.type}) → ${to.name} (${to.type})`)
    }
  },

  toBase(quantity: number, unit: Unit): number {
    return this.precision(quantity * unit.conversionFactor)
  },

  fromBase(baseQuantity: number, unit: Unit): number {
    return this.precision(baseQuantity / unit.conversionFactor)
  },

  convert(quantity: number, from: Unit, to: Unit): number {
    if (from.id === to.id) return quantity
    this.assertSameType(from, to)
    const base = this.toBase(quantity, from)
    return this.fromBase(base, to)
  },
}
