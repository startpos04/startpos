/**
 * costing-engine.test.ts
 *
 * Covers all three costing strategies individually and through the
 * CostingEngine facade:
 *   - FIFOEngine.consume
 *   - MovingAverageEngine.consume
 *   - SpecificEngine.consume
 *   - CostingEngine.prepareConsumption (strategy dispatch + unit conversion)
 *   - UnitEngine (toBase / fromBase / convert / assertSameType)
 *
 * Run with: pnpm test
 */

import { describe, expect, it } from 'vitest'
import { baseUnit, dozenUnit, gramUnit, kiloUnit, makeId, makeInventoryBatch, makeInventoryRecord } from '@/lib/__tests__/helpers'
import { UnitEngine } from '@/lib/conversion/unit-engine'
import { FIFOEngine } from '@/lib/costing/fifo-engine'
import { CostingEngine } from '@/lib/costing'
import { MovingAverageEngine } from '@/lib/costing/moving-average-engine'
import { SpecificEngine } from '@/lib/costing/specific-engine'
import type { InventoryBatchDTO } from '@/lib/costing/types'

// ---------------------------------------------------------------------------
// UnitEngine
// ---------------------------------------------------------------------------

describe('UnitEngine', () => {
  describe('toBase', () => {
    it('base unit (factor 1) keeps quantity unchanged', () => {
      expect(UnitEngine.toBase(5, baseUnit)).toBe(5)
    })

    it('dozen unit converts to base pieces (×12)', () => {
      expect(UnitEngine.toBase(2, dozenUnit)).toBe(24)
    })

    it('kilogram converts to grams (×1000)', () => {
      expect(UnitEngine.toBase(1.5, kiloUnit)).toBe(1500)
    })

    it('fractional quantities convert accurately', () => {
      expect(UnitEngine.toBase(0.5, kiloUnit)).toBe(500)
    })
  })

  describe('fromBase', () => {
    it('converts base grams back to kilograms', () => {
      expect(UnitEngine.fromBase(1000, kiloUnit)).toBe(1)
    })

    it('converts base pieces back to dozens', () => {
      expect(UnitEngine.fromBase(24, dozenUnit)).toBe(2)
    })

    it('roundtrip: fromBase(toBase(x)) === x', () => {
      const original = 3.5
      const base = UnitEngine.toBase(original, dozenUnit)
      const back = UnitEngine.fromBase(base, dozenUnit)
      expect(back).toBeCloseTo(original, 8)
    })
  })

  describe('convert', () => {
    it('same unit returns quantity unchanged', () => {
      expect(UnitEngine.convert(5, baseUnit, baseUnit)).toBe(5)
    })

    it('converts grams to kilograms', () => {
      expect(UnitEngine.convert(500, gramUnit, kiloUnit)).toBe(0.5)
    })

    it('converts kilograms to grams', () => {
      expect(UnitEngine.convert(2, kiloUnit, gramUnit)).toBe(2000)
    })

    it('throws when unit types are incompatible (QUANTITY vs WEIGHT)', () => {
      expect(() => UnitEngine.convert(1, baseUnit, gramUnit)).toThrow('Unit mismatch')
    })
  })

  describe('assertSameType', () => {
    it('does not throw for same type units', () => {
      expect(() => UnitEngine.assertSameType(gramUnit, kiloUnit)).not.toThrow()
    })

    it('throws for different unit types', () => {
      expect(() => UnitEngine.assertSameType(baseUnit, kiloUnit)).toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// FIFOEngine
// ---------------------------------------------------------------------------

describe('FIFOEngine.consume', () => {
  it('consumes entire single batch when quantity matches exactly', () => {
    const batch: InventoryBatchDTO = { id: 'b1', quantity: 10, costPrice: 500 }
    const result = FIFOEngine.consume([batch], 10)

    expect(result.totalCost).toBe(5000)
    expect(result.consumed).toHaveLength(1)
    expect(result.consumed![0]).toMatchObject({ inventoryId: 'b1', quantity: 10, cost: 5000 })
  })

  it('consumes from oldest batch first, leaving newer batch untouched', () => {
    const batches: InventoryBatchDTO[] = [
      { id: 'old', quantity: 5, costPrice: 200 },
      { id: 'new', quantity: 10, costPrice: 300 },
    ]
    const result = FIFOEngine.consume(batches, 5)

    expect(result.consumed).toHaveLength(1)
    expect(result.consumed![0]!.inventoryId).toBe('old')
    expect(result.totalCost).toBe(1000) // 5 × 200
  })

  it('spans multiple batches when first batch is insufficient', () => {
    const batches: InventoryBatchDTO[] = [
      { id: 'b1', quantity: 3, costPrice: 100 },
      { id: 'b2', quantity: 7, costPrice: 200 },
    ]
    const result = FIFOEngine.consume(batches, 8)

    expect(result.consumed).toHaveLength(2)
    expect(result.consumed![0]).toMatchObject({ inventoryId: 'b1', quantity: 3, cost: 300 })
    expect(result.consumed![1]).toMatchObject({ inventoryId: 'b2', quantity: 5, cost: 1000 })
    expect(result.totalCost).toBe(1300)
  })

  it('skips batches with zero quantity', () => {
    const batches: InventoryBatchDTO[] = [
      { id: 'empty', quantity: 0, costPrice: 999 },
      { id: 'valid', quantity: 10, costPrice: 100 },
    ]
    const result = FIFOEngine.consume(batches, 5)

    expect(result.consumed).toHaveLength(1)
    expect(result.consumed![0]!.inventoryId).toBe('valid')
  })

  it('throws when total stock is insufficient', () => {
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 3, costPrice: 100 }]
    expect(() => FIFOEngine.consume(batches, 10)).toThrow('Insufficient stock')
  })

  it('throws on empty batches array', () => {
    expect(() => FIFOEngine.consume([], 1)).toThrow('Insufficient stock')
  })

  it('consumed costs are always rounded integers (no float cents)', () => {
    // 3 units × 333.33… cost → must round to integer
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 3, costPrice: 333.33 }]
    const result = FIFOEngine.consume(batches, 3)
    expect(Number.isInteger(result.totalCost)).toBe(true)
    result.consumed!.forEach(c => expect(Number.isInteger(c.cost)).toBe(true))
  })
})

// ---------------------------------------------------------------------------
// MovingAverageEngine
// ---------------------------------------------------------------------------

describe('MovingAverageEngine.consume', () => {
  it('single batch: totalCost = quantity × costPrice', () => {
    const batch: InventoryBatchDTO = { id: 'b1', quantity: 10, costPrice: 500 }
    const result = MovingAverageEngine.consume([batch], 5)

    expect(result.totalCost).toBe(2500) // avg=500, 5×500
    expect(result.consumed).toHaveLength(1)
  })

  it('two batches: weighted average distributes cost correctly', () => {
    // Batch A: 10 units @ 100¢ = 1000 total value
    // Batch B: 10 units @ 300¢ = 3000 total value
    // Total: 20 units, 4000¢ value → avg = 200¢
    const batches: InventoryBatchDTO[] = [
      { id: 'bA', quantity: 10, costPrice: 100 },
      { id: 'bB', quantity: 10, costPrice: 300 },
    ]
    const result = MovingAverageEngine.consume(batches, 10)

    expect(result.totalCost).toBe(2000) // 10 × avg 200
  })

  it('consumes all batches proportionally', () => {
    const batches: InventoryBatchDTO[] = [
      { id: 'b1', quantity: 20, costPrice: 100 },
      { id: 'b2', quantity: 80, costPrice: 200 },
    ]
    // avg = (20*100 + 80*200) / 100 = (2000+16000)/100 = 180
    const result = MovingAverageEngine.consume(batches, 100)

    expect(result.totalCost).toBe(18000)
    expect(result.consumed).toHaveLength(2)
    // Each batch contributes proportionally: b1 → 20% of 100 = 20, b2 → 80
    expect(result.consumed![0]!.quantity).toBeCloseTo(20, 5)
    expect(result.consumed![1]!.quantity).toBeCloseTo(80, 5)
  })

  it('throws when no stock available (empty batches)', () => {
    expect(() => MovingAverageEngine.consume([], 5)).toThrow('No stock available')
  })

  it('throws when zero-quantity batches only', () => {
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 0, costPrice: 100 }]
    expect(() => MovingAverageEngine.consume(batches, 5)).toThrow('No stock available')
  })

  it('throws when required exceeds total available', () => {
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 5, costPrice: 100 }]
    expect(() => MovingAverageEngine.consume(batches, 10)).toThrow('Insufficient stock')
  })

  it('consuming exact total stock succeeds', () => {
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 5, costPrice: 200 }]
    const result = MovingAverageEngine.consume(batches, 5)
    expect(result.totalCost).toBe(1000)
  })

  it('totalCost is a rounded integer', () => {
    const batches: InventoryBatchDTO[] = [
      { id: 'b1', quantity: 3, costPrice: 100 },
      { id: 'b2', quantity: 3, costPrice: 200 },
    ]
    const result = MovingAverageEngine.consume(batches, 4)
    expect(Number.isInteger(result.totalCost)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SpecificEngine
// ---------------------------------------------------------------------------

describe('SpecificEngine.consume', () => {
  it('consumes exactly the provided batches and sums cost', () => {
    const batches: InventoryBatchDTO[] = [
      { id: 'b1', quantity: 3, costPrice: 100 },
      { id: 'b2', quantity: 2, costPrice: 200 },
    ]
    const result = SpecificEngine.consume(batches, 5)

    expect(result.totalCost).toBe(700) // 3×100 + 2×200
    expect(result.consumed).toHaveLength(2)
    expect(result.consumed![0]).toMatchObject({ inventoryId: 'b1', quantity: 3, cost: 300 })
    expect(result.consumed![1]).toMatchObject({ inventoryId: 'b2', quantity: 2, cost: 400 })
  })

  it('single batch exact match succeeds', () => {
    const batch: InventoryBatchDTO = { id: 'b1', quantity: 5, costPrice: 150 }
    const result = SpecificEngine.consume([batch], 5)
    expect(result.totalCost).toBe(750)
  })

  it('throws when batch quantities do not match required amount', () => {
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 3, costPrice: 100 }]
    // Required 5 but only 3 provided
    expect(() => SpecificEngine.consume(batches, 5)).toThrow('do not match')
  })

  it('throws when over-specified (batches sum > required)', () => {
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 10, costPrice: 100 }]
    expect(() => SpecificEngine.consume(batches, 5)).toThrow('do not match')
  })

  it('costs are rounded integers', () => {
    const batches: InventoryBatchDTO[] = [{ id: 'b1', quantity: 3, costPrice: 333.33 }]
    const result = SpecificEngine.consume(batches, 3)
    expect(Number.isInteger(result.totalCost)).toBe(true)
    result.consumed!.forEach(c => expect(Number.isInteger(c.cost)).toBe(true))
  })
})

// ---------------------------------------------------------------------------
// CostingEngine.prepareConsumption (facade + unit conversion)
// ---------------------------------------------------------------------------

describe('CostingEngine.prepareConsumption', () => {
  it('FIFO strategy: dispatches to FIFOEngine and converts units', () => {
    // Selling 1 dozen → needs 12 base units
    const inventory = [makeInventoryRecord({ id: 'inv-1', quantity: 20, costPrice: 50 })]
    const result = CostingEngine.prepareConsumption('FIFO', { variantId: makeId(), quantity: 1, unit: dozenUnit }, inventory)

    // 12 base units × 50¢ = 600¢
    expect(result.totalCost).toBe(600)
    expect(result.consumed![0]!.quantity).toBe(12)
  })

  it('MOVING_AVERAGE strategy: dispatches to MovingAverageEngine', () => {
    const inventory = [makeInventoryRecord({ id: 'inv-1', quantity: 10, costPrice: 100 }), makeInventoryRecord({ id: 'inv-2', quantity: 10, costPrice: 200 })]
    const result = CostingEngine.prepareConsumption('MOVING_AVERAGE', { variantId: makeId(), quantity: 10, unit: baseUnit }, inventory)

    expect(result.totalCost).toBe(1500) // avg 150¢ × 10
  })

  it('SPECIFIC strategy: dispatches to SpecificEngine', () => {
    // For SPECIFIC, only pass the exact batches you want consumed
    const inventory = [makeInventoryRecord({ id: 'inv-1', quantity: 5, costPrice: 200 })]
    const result = CostingEngine.prepareConsumption('SPECIFIC', { variantId: makeId(), quantity: 5, unit: baseUnit }, inventory)

    expect(result.totalCost).toBe(1000) // 5 × 200
  })

  it('unit conversion: kg → grams before consuming', () => {
    // 0.5 kg → 500g base units
    const inventory = [makeInventoryRecord({ id: 'inv-1', quantity: 1000, costPrice: 1, unitId: gramUnit.id })]
    const result = CostingEngine.prepareConsumption('FIFO', { variantId: makeId(), quantity: 0.5, unit: kiloUnit }, inventory)

    expect(result.consumed![0]!.quantity).toBe(500)
  })

  it('base unit (factor=1) does not alter quantity before consuming', () => {
    const inventory = [makeInventoryRecord({ id: 'inv-1', quantity: 10, costPrice: 100 })]
    const result = CostingEngine.prepareConsumption('FIFO', { variantId: makeId(), quantity: 5, unit: baseUnit }, inventory)
    expect(result.consumed![0]!.quantity).toBe(5)
  })

  it('throws for unknown strategy', () => {
    const inventory = [makeInventoryRecord()]
    expect(() => CostingEngine.prepareConsumption('UNKNOWN' as any, { variantId: makeId(), quantity: 1, unit: baseUnit }, inventory)).toThrow('not implemented')
  })

  it('propagates insufficient-stock error from underlying engine', () => {
    const inventory = [makeInventoryRecord({ quantity: 2 })]
    expect(() => CostingEngine.prepareConsumption('FIFO', { variantId: makeId(), quantity: 99, unit: baseUnit }, inventory)).toThrow()
  })
})
