/**
 * usage-engine.test.ts
 *
 * Coverage:
 *  - computeRemaining: unlimited (-1), within allowance, at limit, over limit (clamped to 0)
 *  - isExhausted: unlimited → false, below limit → false, at/over limit → true
 *  - computeSummary: delegates to UsageSummary.of — spot-check shape
 *  - increment: normal path (within allowance), at-limit with overage enabled, at-limit with overage disabled, closed counter guard
 *  - increment: overage path increments both txCount and overageTxCount
 *  - buildNewCounter: correct sentinel id, zeroed counts, isClosed=false
 *  - closeCounter: marks isClosed=true, rejects already-closed counter
 */

import { describe, expect, it } from 'vitest'
import { UsageEngine } from '@/lib/billing/usage-engine'
import type { UsageCounterSnapshot } from '@/lib/billing/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERIOD_START = new Date('2026-06-01T00:00:00.000Z')
const PERIOD_END = new Date('2026-06-30T23:59:59.999Z')
const BIZ_ID = 'biz-001'

function makeCounter(overrides: Partial<UsageCounterSnapshot> = {}): UsageCounterSnapshot {
  return {
    id: 'counter-001',
    businessId: BIZ_ID,
    billingPeriodStart: PERIOD_START,
    billingPeriodEnd: PERIOD_END,
    txCount: 0,
    overageTxCount: 0,
    isClosed: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeRemaining
// ---------------------------------------------------------------------------

describe('UsageEngine.computeRemaining', () => {
  it('returns null for an unlimited plan (includedTxPerMonth = -1)', () => {
    expect(UsageEngine.computeRemaining(makeCounter({ txCount: 500 }), -1)).toBeNull()
  })

  it('returns remaining count when within allowance', () => {
    expect(UsageEngine.computeRemaining(makeCounter({ txCount: 300 }), 1000)).toBe(700)
  })

  it('returns 0 when txCount equals the allowance', () => {
    expect(UsageEngine.computeRemaining(makeCounter({ txCount: 1000 }), 1000)).toBe(0)
  })

  it('returns 0 (clamped) when txCount exceeds the allowance', () => {
    expect(UsageEngine.computeRemaining(makeCounter({ txCount: 1050 }), 1000)).toBe(0)
  })

  it('returns full allowance when txCount is 0', () => {
    expect(UsageEngine.computeRemaining(makeCounter({ txCount: 0 }), 500)).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// isExhausted
// ---------------------------------------------------------------------------

describe('UsageEngine.isExhausted', () => {
  it('returns false for unlimited plan regardless of txCount', () => {
    expect(UsageEngine.isExhausted(makeCounter({ txCount: 99999 }), -1)).toBe(false)
  })

  it('returns false when below the allowance', () => {
    expect(UsageEngine.isExhausted(makeCounter({ txCount: 999 }), 1000)).toBe(false)
  })

  it('returns true when txCount equals the allowance', () => {
    expect(UsageEngine.isExhausted(makeCounter({ txCount: 1000 }), 1000)).toBe(true)
  })

  it('returns true when txCount exceeds the allowance', () => {
    expect(UsageEngine.isExhausted(makeCounter({ txCount: 1050 }), 1000)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// computeSummary
// ---------------------------------------------------------------------------

describe('UsageEngine.computeSummary', () => {
  it('returns a UsageSummary with the correct txCount', () => {
    const s = UsageEngine.computeSummary(makeCounter({ txCount: 200 }), 1000)
    expect(s.txCount).toBe(200)
  })

  it('returns txRemaining derived from snapshot and allowance', () => {
    const s = UsageEngine.computeSummary(makeCounter({ txCount: 200 }), 1000)
    expect(s.txRemaining).toBe(800)
  })

  it('returns null txRemaining for unlimited plan', () => {
    const s = UsageEngine.computeSummary(makeCounter({ txCount: 0 }), -1)
    expect(s.txRemaining).toBeNull()
  })

  it('billingPeriodStart and billingPeriodEnd match snapshot', () => {
    const s = UsageEngine.computeSummary(makeCounter(), 1000)
    expect(s.billingPeriodStart).toBe(PERIOD_START)
    expect(s.billingPeriodEnd).toBe(PERIOD_END)
  })
})

// ---------------------------------------------------------------------------
// increment — normal path (within allowance)
// ---------------------------------------------------------------------------

describe('UsageEngine.increment — normal path', () => {
  it('returns ok with txCount incremented by 1', () => {
    const counter = makeCounter({ txCount: 50 })
    const result = UsageEngine.increment(counter, 1000, false)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.txCount).toBe(51)
    }
  })

  it('does not change overageTxCount on normal path', () => {
    const counter = makeCounter({ txCount: 50 })
    const result = UsageEngine.increment(counter, 1000, false)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.overageTxCount).toBe(0)
    }
  })

  it('all other snapshot fields are preserved', () => {
    const counter = makeCounter({ txCount: 10 })
    const result = UsageEngine.increment(counter, 1000, false)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.id).toBe('counter-001')
      expect(result.value.businessId).toBe(BIZ_ID)
      expect(result.value.isClosed).toBe(false)
    }
  })

  it('unlimited plan (-1): increments normally without overage logic', () => {
    const counter = makeCounter({ txCount: 9999 })
    const result = UsageEngine.increment(counter, -1, false)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.txCount).toBe(10000)
      expect(result.value.overageTxCount).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// increment — overage path
// ---------------------------------------------------------------------------

describe('UsageEngine.increment — overage billing enabled', () => {
  it('when exhausted and overageBillingEnabled=true, increments both txCount and overageTxCount', () => {
    const counter = makeCounter({ txCount: 1000, overageTxCount: 3 })
    const result = UsageEngine.increment(counter, 1000, true)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.txCount).toBe(1001)
      expect(result.value.overageTxCount).toBe(4)
    }
  })

  it('first overage tx: overageTxCount goes from 0 to 1', () => {
    const counter = makeCounter({ txCount: 1000, overageTxCount: 0 })
    const result = UsageEngine.increment(counter, 1000, true)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.overageTxCount).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// increment — allowance exhausted, overage disabled
// ---------------------------------------------------------------------------

describe('UsageEngine.increment — allowance exhausted, overage disabled', () => {
  it('returns opFail when txCount equals allowance and overageBillingEnabled=false', () => {
    const counter = makeCounter({ txCount: 1000 })
    const result = UsageEngine.increment(counter, 1000, false)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
      expect(result.reason).toMatch(/allowance exhausted/i)
    }
  })

  it('returns opFail when txCount exceeds allowance and overageBillingEnabled=false', () => {
    const counter = makeCounter({ txCount: 1005 })
    const result = UsageEngine.increment(counter, 1000, false)
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// increment — closed counter guard
// ---------------------------------------------------------------------------

describe('UsageEngine.increment — closed counter', () => {
  it('returns opFail when counter is already closed', () => {
    const counter = makeCounter({ isClosed: true })
    const result = UsageEngine.increment(counter, 1000, false)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
      expect(result.reason).toMatch(/closed/i)
    }
  })

  it('closed guard fires even if within allowance', () => {
    const counter = makeCounter({ txCount: 5, isClosed: true })
    const result = UsageEngine.increment(counter, 1000, true)
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildNewCounter
// ---------------------------------------------------------------------------

describe('UsageEngine.buildNewCounter', () => {
  it('returns a counter with sentinel id "__NEW__"', () => {
    const c = UsageEngine.buildNewCounter(BIZ_ID, PERIOD_START, PERIOD_END)
    expect(c.id).toBe('__NEW__')
  })

  it('sets businessId correctly', () => {
    const c = UsageEngine.buildNewCounter(BIZ_ID, PERIOD_START, PERIOD_END)
    expect(c.businessId).toBe(BIZ_ID)
  })

  it('txCount starts at 0', () => {
    const c = UsageEngine.buildNewCounter(BIZ_ID, PERIOD_START, PERIOD_END)
    expect(c.txCount).toBe(0)
  })

  it('overageTxCount starts at 0', () => {
    const c = UsageEngine.buildNewCounter(BIZ_ID, PERIOD_START, PERIOD_END)
    expect(c.overageTxCount).toBe(0)
  })

  it('isClosed is false', () => {
    const c = UsageEngine.buildNewCounter(BIZ_ID, PERIOD_START, PERIOD_END)
    expect(c.isClosed).toBe(false)
  })

  it('billingPeriodStart and billingPeriodEnd match inputs', () => {
    const c = UsageEngine.buildNewCounter(BIZ_ID, PERIOD_START, PERIOD_END)
    expect(c.billingPeriodStart).toBe(PERIOD_START)
    expect(c.billingPeriodEnd).toBe(PERIOD_END)
  })
})

// ---------------------------------------------------------------------------
// closeCounter
// ---------------------------------------------------------------------------

describe('UsageEngine.closeCounter', () => {
  it('returns ok with isClosed=true', () => {
    const counter = makeCounter({ isClosed: false })
    const result = UsageEngine.closeCounter(counter)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isClosed).toBe(true)
    }
  })

  it('preserves all other counter fields', () => {
    const counter = makeCounter({ txCount: 42, overageTxCount: 5 })
    const result = UsageEngine.closeCounter(counter)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.txCount).toBe(42)
      expect(result.value.overageTxCount).toBe(5)
      expect(result.value.id).toBe('counter-001')
    }
  })

  it('returns opFail when counter is already closed', () => {
    const counter = makeCounter({ isClosed: true })
    const result = UsageEngine.closeCounter(counter)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT')
      expect(result.reason).toMatch(/already closed/i)
    }
  })
})
