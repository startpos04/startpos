/**
 * unit-engine.test.ts
 *
 * Coverage:
 *  - UnitEngine.precision: floating-point noise from float arithmetic
 *  - UnitEngine.toBase: quantity × conversionFactor
 *  - UnitEngine.fromBase: baseQuantity / conversionFactor
 *  - UnitEngine.assertSameType: throws on type mismatch, silent on match
 *  - UnitEngine.convert: identity (same unit), normal conversion, type mismatch throws
 */

import { describe, expect, it } from 'vitest'
import { UnitEngine } from '@/lib/conversion/unit-engine'
import type { Unit } from 'prisma/generated/prisma/browser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnit(overrides: Partial<Unit>): Unit {
  return {
    id: 'unit-001',
    name: 'Unit',
    abbreviation: 'u',
    type: 'WEIGHT',
    conversionFactor: 1,
    isBaseUnit: false,
    businessId: 'biz-001',
    branchId: 'branch-001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const GRAM = makeUnit({ id: 'unit-g', name: 'Gram', abbreviation: 'g', type: 'WEIGHT', conversionFactor: 1, isBaseUnit: true })
const KILOGRAM = makeUnit({ id: 'unit-kg', name: 'Kilogram', abbreviation: 'kg', type: 'WEIGHT', conversionFactor: 1000 })
const MILLIGRAM = makeUnit({ id: 'unit-mg', name: 'Milligram', abbreviation: 'mg', type: 'WEIGHT', conversionFactor: 0.001 })

const MILLILITER = makeUnit({ id: 'unit-ml', name: 'Milliliter', abbreviation: 'ml', type: 'VOLUME', conversionFactor: 1, isBaseUnit: true })
const LITER = makeUnit({ id: 'unit-l', name: 'Liter', abbreviation: 'l', type: 'VOLUME', conversionFactor: 1000 })

// ---------------------------------------------------------------------------
// precision
// ---------------------------------------------------------------------------

describe('UnitEngine.precision', () => {
  it('returns an exact value unchanged', () => {
    expect(UnitEngine.precision(1.5)).toBe(1.5)
  })

  it('cleans up floating-point noise from float arithmetic (0.1 + 0.2)', () => {
    // Quantities come from float multiplication/division (e.g. 2.5 × 0.001 × 1000).
    // The docstring example "1.4999999999 → 1.5" is misleading — toFixed(10) preserves
    // exactly 10 decimal digits so that specific value is NOT rounded. The real-world
    // noise case is IEEE 754 addition like 0.1 + 0.2 = 0.30000000000000004.
    const noisy = 0.1 + 0.2 // 0.30000000000000004 in IEEE 754
    expect(UnitEngine.precision(noisy)).toBe(0.3)
  })

  it('cleans up floating-point noise (0.1 + 0.2)', () => {
    const noisy = 0.1 + 0.2 // 0.30000000000000004
    expect(UnitEngine.precision(noisy)).toBe(0.3)
  })

  it('handles zero', () => {
    expect(UnitEngine.precision(0)).toBe(0)
  })

  it('handles large integers', () => {
    expect(UnitEngine.precision(1000000)).toBe(1000000)
  })
})

// ---------------------------------------------------------------------------
// toBase
// ---------------------------------------------------------------------------

describe('UnitEngine.toBase', () => {
  it('converts kilograms to grams (base unit)', () => {
    expect(UnitEngine.toBase(2, KILOGRAM)).toBe(2000)
  })

  it('converts milligrams to grams (factor < 1)', () => {
    expect(UnitEngine.toBase(500, MILLIGRAM)).toBe(0.5)
  })

  it('converts base unit to base unit (factor = 1)', () => {
    expect(UnitEngine.toBase(10, GRAM)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// fromBase
// ---------------------------------------------------------------------------

describe('UnitEngine.fromBase', () => {
  it('converts grams back to kilograms', () => {
    expect(UnitEngine.fromBase(2000, KILOGRAM)).toBe(2)
  })

  it('converts grams back to milligrams', () => {
    expect(UnitEngine.fromBase(0.5, MILLIGRAM)).toBe(500)
  })

  it('converts base-to-base (factor = 1)', () => {
    expect(UnitEngine.fromBase(10, GRAM)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// assertSameType
// ---------------------------------------------------------------------------

describe('UnitEngine.assertSameType', () => {
  it('does not throw when both units are the same type', () => {
    expect(() => UnitEngine.assertSameType(GRAM, KILOGRAM)).not.toThrow()
  })

  it('throws when unit types differ', () => {
    expect(() => UnitEngine.assertSameType(GRAM, LITER)).toThrow(/Unit mismatch/)
  })

  it('error message includes both unit names and types', () => {
    expect(() => UnitEngine.assertSameType(GRAM, LITER)).toThrow('Gram (WEIGHT)')
  })
})

// ---------------------------------------------------------------------------
// convert
// ---------------------------------------------------------------------------

describe('UnitEngine.convert', () => {
  it('returns the same quantity when from and to are the same unit (identity)', () => {
    expect(UnitEngine.convert(5, KILOGRAM, KILOGRAM)).toBe(5)
  })

  it('converts kg to g (2 kg = 2000 g)', () => {
    expect(UnitEngine.convert(2, KILOGRAM, GRAM)).toBe(2000)
  })

  it('converts g to kg (500 g = 0.5 kg)', () => {
    expect(UnitEngine.convert(500, GRAM, KILOGRAM)).toBe(0.5)
  })

  it('converts g to mg (1 g = 1000 mg)', () => {
    expect(UnitEngine.convert(1, GRAM, MILLIGRAM)).toBe(1000)
  })

  it('converts ml to L (1000 ml = 1 L)', () => {
    expect(UnitEngine.convert(1000, MILLILITER, LITER)).toBe(1)
  })

  it('converts L to ml (2.5 L = 2500 ml)', () => {
    expect(UnitEngine.convert(2.5, LITER, MILLILITER)).toBe(2500)
  })

  it('handles precision: 1.5 kg → 1500 g (no floating-point noise)', () => {
    expect(UnitEngine.convert(1.5, KILOGRAM, GRAM)).toBe(1500)
  })

  it('throws when from and to have different types', () => {
    expect(() => UnitEngine.convert(1, GRAM, LITER)).toThrow(/Unit mismatch/)
  })
})
