/**
 * price-engine.test.ts
 *
 * Covers PriceEngine:
 *   - toCents / toDollars (conversion helpers)
 *   - format             (locale-aware currency string — requires authStore)
 *   - costPerBase        (unit-normalised cost)
 *   - pricePerBase       (unit-normalised price)
 *   - calculateLineTotal (quantity × price with unit conversion, rounded)
 *   - applyRate          (percentage application, rounded)
 *
 * Run with: pnpm test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { baseUnit, dozenUnit, kiloUnit, makeUnit, resetMockUser, seedMockUser } from '#tests/helpers'
import { PriceEngine } from '@/lib/conversion/price-engine'

// ---------------------------------------------------------------------------
// toCents
// ---------------------------------------------------------------------------

describe('PriceEngine.toCents', () => {
  it('converts whole-dollar amount to cents', () => {
    expect(PriceEngine.toCents(100)).toBe(10000)
  })

  it('converts decimal amount and rounds correctly (19.99 → 1999)', () => {
    expect(PriceEngine.toCents(19.99)).toBe(1999)
  })

  it('converts zero to zero', () => {
    expect(PriceEngine.toCents(0)).toBe(0)
  })

  it('rounds half-centavo up (0.005 → 1)', () => {
    expect(PriceEngine.toCents(0.005)).toBe(1)
  })

  it('handles large amounts without overflow', () => {
    expect(PriceEngine.toCents(9999.99)).toBe(999999)
  })
})

// ---------------------------------------------------------------------------
// toDollars
// ---------------------------------------------------------------------------

describe('PriceEngine.toDollars', () => {
  it('converts cents to dollars (1999 → 19.99)', () => {
    expect(PriceEngine.toDollars(1999)).toBe(19.99)
  })

  it('converts zero cents to 0', () => {
    expect(PriceEngine.toDollars(0)).toBe(0)
  })

  it('converts whole-dollar cents (10000 → 100)', () => {
    expect(PriceEngine.toDollars(10000)).toBe(100)
  })

  it('roundtrip: toCents(toDollars(x)) === x', () => {
    const cents = 4567
    expect(PriceEngine.toCents(PriceEngine.toDollars(cents))).toBe(cents)
  })
})

// ---------------------------------------------------------------------------
// format (requires authStore to be seeded)
// ---------------------------------------------------------------------------

describe('PriceEngine.format', () => {
  beforeEach(() => {
    seedMockUser() // LOCALE: 'en-PH', CURRENCY: 'PHP'
  })

  afterEach(() => {
    resetMockUser()
  })

  it('formats cents as PHP currency string (₱)', () => {
    const formatted = PriceEngine.format(10000)
    expect(formatted).toBe('₱100.00')
  })

  it('formats zero cents as ₱0.00', () => {
    expect(PriceEngine.format(0)).toBe('₱0.00')
  })

  it('formats fractional cents correctly (1999 → ₱19.99)', () => {
    const formatted = PriceEngine.format(1999)
    expect(formatted).toContain('19.99')
    expect(formatted).toContain('₱')
  })

  it('uses locale from authStore — different locale produces different format', () => {
    // Override with USD locale
    seedMockUser({
      configs: { LOCALE: 'en-US', CURRENCY: 'USD' } as any,
    })
    const formatted = PriceEngine.format(10000)
    expect(formatted).toContain('$')
    expect(formatted).toContain('100')
  })

  it('formats large amounts correctly (₱9,999.99)', () => {
    const formatted = PriceEngine.format(999999)
    expect(formatted).toContain('9,999.99')
  })
})

// ---------------------------------------------------------------------------
// costPerBase
// ---------------------------------------------------------------------------

describe('PriceEngine.costPerBase', () => {
  it('base unit (factor=1): cost per base equals cost per unit', () => {
    expect(PriceEngine.costPerBase(500, baseUnit)).toBe(500)
  })

  it('dozen unit (factor=12): cost per base = cost / 12', () => {
    // If a dozen costs 1200¢, each piece costs 100¢
    expect(PriceEngine.costPerBase(1200, dozenUnit)).toBe(100)
  })

  it('kilo unit (factor=1000): cost per base = cost / 1000', () => {
    // If 1 kg costs 5000¢, per gram = 5¢
    expect(PriceEngine.costPerBase(5000, kiloUnit)).toBe(5)
  })

  it('returns a float for non-integer result', () => {
    // 100¢ / 3 — not a whole number
    const threeUnit = makeUnit({ conversionFactor: 3 })
    const result = PriceEngine.costPerBase(100, threeUnit)
    expect(result).toBeCloseTo(33.33, 2)
  })
})

// ---------------------------------------------------------------------------
// pricePerBase
// ---------------------------------------------------------------------------

describe('PriceEngine.pricePerBase', () => {
  it('base unit: price per base equals price', () => {
    expect(PriceEngine.pricePerBase(1200, baseUnit)).toBe(1200)
  })

  it('dozen unit: price per base = price / 12', () => {
    expect(PriceEngine.pricePerBase(1200, dozenUnit)).toBe(100)
  })

  it('kilo unit: price per base = price / 1000', () => {
    expect(PriceEngine.pricePerBase(10000, kiloUnit)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// calculateLineTotal
// ---------------------------------------------------------------------------

describe('PriceEngine.calculateLineTotal', () => {
  it('base unit: total = quantity × price (no conversion needed)', () => {
    // 3 units × 500¢ = 1500¢
    expect(PriceEngine.calculateLineTotal(3, baseUnit, 500)).toBe(1500)
  })

  it('dozen unit: 1 dozen × 1200¢/dozen = 1200¢', () => {
    expect(PriceEngine.calculateLineTotal(1, dozenUnit, 1200)).toBe(1200)
  })

  it('dozen unit: 2 dozens × 1200¢/dozen = 2400¢', () => {
    expect(PriceEngine.calculateLineTotal(2, dozenUnit, 1200)).toBe(2400)
  })

  it('kilo unit: 0.5 kg × 10000¢/kg = 5000¢', () => {
    expect(PriceEngine.calculateLineTotal(0.5, kiloUnit, 10000)).toBe(5000)
  })

  it('returns 0 for zero quantity', () => {
    expect(PriceEngine.calculateLineTotal(0, baseUnit, 500)).toBe(0)
  })

  it('result is always a rounded integer (no floating-point cents)', () => {
    // 3 pieces × 333.33¢ — result must be integer
    const threeUnit = makeUnit({ conversionFactor: 3 })
    const result = PriceEngine.calculateLineTotal(1, threeUnit, 1000)
    expect(Number.isInteger(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyRate
// ---------------------------------------------------------------------------

describe('PriceEngine.applyRate', () => {
  it('applies 20% rate to 1000¢ → 200¢', () => {
    expect(PriceEngine.applyRate(1000, 20)).toBe(200)
  })

  it('applies 12% VAT rate to 10000¢ → 1200¢', () => {
    expect(PriceEngine.applyRate(10000, 12)).toBe(1200)
  })

  it('applies 0% rate → always returns 0', () => {
    expect(PriceEngine.applyRate(5000, 0)).toBe(0)
  })

  it('applies 100% rate → returns the full amount', () => {
    expect(PriceEngine.applyRate(2500, 100)).toBe(2500)
  })

  it('result is always rounded to nearest integer', () => {
    // 1000¢ × 33.33% = 333.3 → rounds to 333
    const result = PriceEngine.applyRate(1000, 33.33)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(333)
  })

  it('applies fractional rate correctly', () => {
    // 10000¢ × 12.5% = 1250¢
    expect(PriceEngine.applyRate(10000, 12.5)).toBe(1250)
  })
})
