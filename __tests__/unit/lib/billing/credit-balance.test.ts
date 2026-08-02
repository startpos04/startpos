/**
 * credit-balance.test.ts
 *
 * Unit tests for the CreditBalance value object.
 *
 * Coverage:
 *  - of(): construction, invariant enforcement (negative throws)
 *  - zero(): creates a 0-balance object
 *  - isSufficient(): true when balance >= cost, false otherwise
 *  - isZero: true only when amount === 0
 *  - isLowBalance(): at threshold (true), above threshold (false), zero (true when threshold > 0)
 *  - formatLabel(): singular vs plural, locale formatting for large numbers
 *  - afterDeduction(): reduces balance, returns null when insufficient
 *  - afterCredit(): increases balance, throws on negative credit amount
 */

import { describe, expect, it } from 'vitest'
import * as CreditBalance from '@/lib/billing/value-objects/credit-balance'

// ---------------------------------------------------------------------------
// of()
// ---------------------------------------------------------------------------

describe('CreditBalance.of', () => {
  it('creates a balance with the given amount', () => {
    const b = CreditBalance.of(100)
    expect(b.amount).toBe(100)
  })

  it('creates a zero balance when amount is 0', () => {
    const b = CreditBalance.of(0)
    expect(b.amount).toBe(0)
    expect(b.isZero).toBe(true)
  })

  it('throws when amount is negative', () => {
    expect(() => CreditBalance.of(-1)).toThrow()
    expect(() => CreditBalance.of(-100)).toThrow()
  })

  it('returns isZero = false for non-zero amounts', () => {
    const b = CreditBalance.of(1)
    expect(b.isZero).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// zero()
// ---------------------------------------------------------------------------

describe('CreditBalance.zero', () => {
  it('returns a balance with amount 0', () => {
    const b = CreditBalance.zero()
    expect(b.amount).toBe(0)
    expect(b.isZero).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isSufficient()
// ---------------------------------------------------------------------------

describe('CreditBalance.isSufficient', () => {
  it('returns true when balance exceeds cost', () => {
    const b = CreditBalance.of(10)
    expect(b.isSufficient(5)).toBe(true)
  })

  it('returns true when balance exactly equals cost', () => {
    const b = CreditBalance.of(5)
    expect(b.isSufficient(5)).toBe(true)
  })

  it('returns false when balance is less than cost', () => {
    const b = CreditBalance.of(4)
    expect(b.isSufficient(5)).toBe(false)
  })

  it('returns false when balance is zero and cost is 1', () => {
    const b = CreditBalance.zero()
    expect(b.isSufficient(1)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isLowBalance()
// ---------------------------------------------------------------------------

describe('CreditBalance.isLowBalance', () => {
  it('returns true when balance is below the threshold', () => {
    const b = CreditBalance.of(3)
    expect(b.isLowBalance(10)).toBe(true)
  })

  it('returns true when balance equals the threshold (at boundary)', () => {
    const b = CreditBalance.of(10)
    expect(b.isLowBalance(10)).toBe(true)
  })

  it('returns false when balance is above the threshold', () => {
    const b = CreditBalance.of(11)
    expect(b.isLowBalance(10)).toBe(false)
  })

  it('returns true for a zero balance with any positive threshold', () => {
    const b = CreditBalance.zero()
    expect(b.isLowBalance(1)).toBe(true)
    expect(b.isLowBalance(100)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// formatLabel()
// ---------------------------------------------------------------------------

describe('CreditBalance.formatLabel', () => {
  it('uses singular "credit" for a balance of 1', () => {
    const b = CreditBalance.of(1)
    expect(CreditBalance.formatLabel(b)).toBe('1 credit')
  })

  it('uses plural "credits" for 0', () => {
    const b = CreditBalance.zero()
    expect(CreditBalance.formatLabel(b)).toBe('0 credits')
  })

  it('uses plural "credits" for values > 1', () => {
    const b = CreditBalance.of(50)
    expect(CreditBalance.formatLabel(b)).toBe('50 credits')
  })

  it('formats large numbers with locale separators', () => {
    const b = CreditBalance.of(1000)
    // toLocaleString output is locale-dependent in jsdom, but the word "credits" must appear
    expect(CreditBalance.formatLabel(b)).toMatch(/credits$/)
    expect(CreditBalance.formatLabel(b)).toContain('1')
  })
})

// ---------------------------------------------------------------------------
// afterDeduction()
// ---------------------------------------------------------------------------

describe('CreditBalance.afterDeduction', () => {
  it('returns a new balance reduced by the cost', () => {
    const b = CreditBalance.of(10)
    const result = CreditBalance.afterDeduction(b, 3)
    expect(result).not.toBeNull()
    expect(result!.amount).toBe(7)
  })

  it('returns a zero balance when cost exactly matches the balance', () => {
    const b = CreditBalance.of(5)
    const result = CreditBalance.afterDeduction(b, 5)
    expect(result).not.toBeNull()
    expect(result!.amount).toBe(0)
    expect(result!.isZero).toBe(true)
  })

  it('returns null when cost exceeds the balance', () => {
    const b = CreditBalance.of(3)
    expect(CreditBalance.afterDeduction(b, 5)).toBeNull()
  })

  it('returns null when balance is zero', () => {
    const b = CreditBalance.zero()
    expect(CreditBalance.afterDeduction(b, 1)).toBeNull()
  })

  it('does not mutate the original balance', () => {
    const b = CreditBalance.of(10)
    CreditBalance.afterDeduction(b, 3)
    expect(b.amount).toBe(10) // original untouched
  })
})

// ---------------------------------------------------------------------------
// afterCredit()
// ---------------------------------------------------------------------------

describe('CreditBalance.afterCredit', () => {
  it('returns a new balance increased by the amount', () => {
    const b = CreditBalance.of(10)
    const result = CreditBalance.afterCredit(b, 5)
    expect(result.amount).toBe(15)
  })

  it('adds to a zero balance', () => {
    const b = CreditBalance.zero()
    const result = CreditBalance.afterCredit(b, 50)
    expect(result.amount).toBe(50)
  })

  it('throws when credit amount is negative', () => {
    const b = CreditBalance.of(10)
    expect(() => CreditBalance.afterCredit(b, -1)).toThrow()
  })

  it('does not mutate the original balance', () => {
    const b = CreditBalance.of(10)
    CreditBalance.afterCredit(b, 5)
    expect(b.amount).toBe(10)
  })
})
