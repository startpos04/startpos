/**
 * inventory-policy.test.ts — Unit tests for InventoryPolicy validation
 * 
 * Coverage:
 *  - validateDeduction: none mode allows all, relaxed allows negative, strict blocks insufficient
 *  - canDeduct: returns correct boolean for each mode
 *  - validateBatchTransfer: delegates to validateDeduction correctly
 *  - validateProductionConsumption: delegates to validateDeduction correctly
 *  - validateWasteDisposal: always validates regardless of mode
 *  - InsufficientStockError: proper error details and user messages
 */

import { describe, expect, it } from 'vitest'
import { InsufficientStockError } from '@/lib/inventory/errors'
import { InventoryPolicy } from '@/lib/inventory/inventory-policy'

// ---------------------------------------------------------------------------
// validateDeduction — none mode
// ---------------------------------------------------------------------------

describe('InventoryPolicy.validateDeduction — none mode', () => {
  it('allows deduction when quantity is sufficient', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 10, 5, 'none')
    }).not.toThrow()
  })

  it('allows deduction when quantity is insufficient (no validation)', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 5, 10, 'none')
    }).not.toThrow()
  })

  it('allows deduction from zero stock', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 0, 10, 'none')
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// validateDeduction — relaxed mode
// ---------------------------------------------------------------------------

describe('InventoryPolicy.validateDeduction — relaxed mode', () => {
  it('allows deduction when quantity is sufficient', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 10, 5, 'relaxed')
    }).not.toThrow()
  })

  it('allows deduction when quantity is insufficient (negative allowed)', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 5, 10, 'relaxed')
    }).not.toThrow()
  })

  it('allows deduction from zero stock', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 0, 10, 'relaxed')
    }).not.toThrow()
  })

  it('allows exact deduction', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 10, 10, 'relaxed')
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// validateDeduction — strict mode
// ---------------------------------------------------------------------------

describe('InventoryPolicy.validateDeduction — strict mode', () => {
  it('allows deduction when quantity is sufficient', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 10, 5, 'strict')
    }).not.toThrow()
  })

  it('allows exact deduction (boundary)', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 10, 10, 'strict')
    }).not.toThrow()
  })

  it('throws InsufficientStockError when quantity is insufficient', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 5, 10, 'strict')
    }).toThrow(InsufficientStockError)
  })

  it('throws InsufficientStockError when deducting from zero stock', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 0, 1, 'strict')
    }).toThrow(InsufficientStockError)
  })

  it('throws with correct error details', () => {
    try {
      InventoryPolicy.validateDeduction('variant-123', 5, 10, 'strict', 'Coffee Beans')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockError)
      const err = error as InsufficientStockError
      expect(err.details.variantId).toBe('variant-123')
      expect(err.details.available).toBe(5)
      expect(err.details.requested).toBe(10)
      expect(err.details.productName).toBe('Coffee Beans')
    }
  })
})

// ---------------------------------------------------------------------------
// canDeduct
// ---------------------------------------------------------------------------

describe('InventoryPolicy.canDeduct', () => {
  it('none mode: always returns true', () => {
    expect(InventoryPolicy.canDeduct(0, 10, 'none')).toBe(true)
    expect(InventoryPolicy.canDeduct(5, 10, 'none')).toBe(true)
    expect(InventoryPolicy.canDeduct(10, 10, 'none')).toBe(true)
  })

  it('relaxed mode: always returns true', () => {
    expect(InventoryPolicy.canDeduct(0, 10, 'relaxed')).toBe(true)
    expect(InventoryPolicy.canDeduct(5, 10, 'relaxed')).toBe(true)
    expect(InventoryPolicy.canDeduct(10, 10, 'relaxed')).toBe(true)
  })

  it('strict mode: returns true only when sufficient', () => {
    expect(InventoryPolicy.canDeduct(10, 5, 'strict')).toBe(true)
    expect(InventoryPolicy.canDeduct(10, 10, 'strict')).toBe(true)
  })

  it('strict mode: returns false when insufficient', () => {
    expect(InventoryPolicy.canDeduct(5, 10, 'strict')).toBe(false)
    expect(InventoryPolicy.canDeduct(0, 1, 'strict')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateBatchTransfer
// ---------------------------------------------------------------------------

describe('InventoryPolicy.validateBatchTransfer', () => {
  it('delegates to validateDeduction with correct parameters', () => {
    expect(() => {
      InventoryPolicy.validateBatchTransfer('batch-1', 10, 5, 'strict', 'Coffee')
    }).not.toThrow()
  })

  it('throws when insufficient stock in strict mode', () => {
    expect(() => {
      InventoryPolicy.validateBatchTransfer('batch-1', 5, 10, 'strict', 'Coffee')
    }).toThrow(InsufficientStockError)
  })
})

// ---------------------------------------------------------------------------
// validateProductionConsumption
// ---------------------------------------------------------------------------

describe('InventoryPolicy.validateProductionConsumption', () => {
  it('allows consumption when sufficient materials in strict mode', () => {
    expect(() => {
      InventoryPolicy.validateProductionConsumption('material-1', 100, 50, 'strict', 'Flour')
    }).not.toThrow()
  })

  it('throws when insufficient materials in strict mode', () => {
    expect(() => {
      InventoryPolicy.validateProductionConsumption('material-1', 50, 100, 'strict', 'Flour')
    }).toThrow(InsufficientStockError)
  })

  it('allows consumption even when insufficient in relaxed mode', () => {
    expect(() => {
      InventoryPolicy.validateProductionConsumption('material-1', 50, 100, 'relaxed', 'Flour')
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// validateWasteDisposal
// ---------------------------------------------------------------------------

describe('InventoryPolicy.validateWasteDisposal', () => {
  it('allows disposal when quantity exists', () => {
    expect(() => {
      InventoryPolicy.validateWasteDisposal('v1', 10, 5, 'Coffee')
    }).not.toThrow()
  })

  it('allows exact disposal', () => {
    expect(() => {
      InventoryPolicy.validateWasteDisposal('v1', 10, 10, 'Coffee')
    }).not.toThrow()
  })

  it('throws when trying to dispose more than exists', () => {
    expect(() => {
      InventoryPolicy.validateWasteDisposal('v1', 5, 10, 'Coffee')
    }).toThrow(InsufficientStockError)
  })

  it('validates even when stock is zero', () => {
    expect(() => {
      InventoryPolicy.validateWasteDisposal('v1', 0, 1, 'Coffee')
    }).toThrow(InsufficientStockError)
  })
})

// ---------------------------------------------------------------------------
// InsufficientStockError
// ---------------------------------------------------------------------------

describe('InsufficientStockError', () => {
  it('creates error with correct details', () => {
    const error = new InsufficientStockError('Test message', {
      variantId: 'v1',
      available: 5,
      requested: 10,
      productName: 'Coffee',
    })

    expect(error.name).toBe('InsufficientStockError')
    expect(error.message).toBe('Test message')
    expect(error.details.variantId).toBe('v1')
    expect(error.details.available).toBe(5)
    expect(error.details.requested).toBe(10)
    expect(error.details.productName).toBe('Coffee')
  })

  it('generates user-friendly message when stock is zero', () => {
    const error = new InsufficientStockError('Test', {
      variantId: 'v1',
      available: 0,
      requested: 10,
      productName: 'Coffee',
    })

    expect(error.toUserMessage()).toBe('Coffee is out of stock')
  })

  it('generates user-friendly message with shortfall', () => {
    const error = new InsufficientStockError('Test', {
      variantId: 'v1',
      available: 5,
      requested: 10,
      productName: 'Coffee Beans',
    })

    const message = error.toUserMessage()
    expect(message).toContain('Coffee Beans')
    expect(message).toContain('10')
    expect(message).toContain('5')
    expect(message).toContain('5 short')
  })

  it('uses generic name when productName not provided', () => {
    const error = new InsufficientStockError('Test', {
      variantId: 'v1',
      available: 0,
      requested: 10,
    })

    expect(error.toUserMessage()).toBe('this item is out of stock')
  })

  it('type guard correctly identifies InsufficientStockError', () => {
    const error = new InsufficientStockError('Test', {
      variantId: 'v1',
      available: 0,
      requested: 10,
    })

    expect(InsufficientStockError.isInsufficientStockError(error)).toBe(true)
    expect(InsufficientStockError.isInsufficientStockError(new Error('test'))).toBe(false)
    expect(InsufficientStockError.isInsufficientStockError('not an error')).toBe(false)
    expect(InsufficientStockError.isInsufficientStockError(null)).toBe(false)
  })
})
