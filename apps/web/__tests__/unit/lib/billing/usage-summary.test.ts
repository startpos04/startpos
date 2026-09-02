/**
 * usage-summary.test.ts
 *
 * Coverage:
 *  UsageSummary.of:
 *   - unlimited plan (-1): txRemaining=null, isExhausted=false, hasOverage=false, percentUsed=null, includedTxPerMonth=null
 *   - within allowance: correct txRemaining, percentUsed, isExhausted=false, hasOverage=false
 *   - at limit exactly: isExhausted=true, txRemaining=0
 *   - over limit: txRemaining clamped to 0
 *   - with overageTxCount > 0: hasOverage=true
 *   - percentUsed rounds correctly and clamps to 100 when over
 *   - billingPeriodStart/End passed through
 *  UsageSummary.empty: zero-state summary
 *  UsageSummary.formatLabel: unlimited vs capped variants
 *  UsageSummary.formatRemaining: unlimited, exhausted, normal
 *
 *  BillingPeriod.of:
 *   - valid start < end
 *   - throws when start >= end
 *  BillingPeriod.contains: inclusive boundaries, before/after period
 *  BillingPeriod.next: advances by same duration
 *  BillingPeriod.overlaps: overlapping and non-overlapping pairs
 *  BillingPeriod.currentMonth: anchor day in past vs future within month
 *  BillingPeriod.duration: ms, minutes, hours, days
 *  BillingPeriod.toISOStrings: returns correct ISO strings
 */

import { describe, expect, it } from 'vitest'
import * as BillingPeriod from '@/lib/billing/value-objects/billing-period'
import * as UsageSummary from '@/lib/billing/value-objects/usage-summary'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERIOD_START = new Date('2026-06-01T00:00:00.000Z')
const PERIOD_END = new Date('2026-06-30T23:59:59.999Z')

// ---------------------------------------------------------------------------
// UsageSummary.of
// ---------------------------------------------------------------------------

describe('UsageSummary.of — unlimited plan (includedTxPerMonth = -1)', () => {
  it('txRemaining is null', () => {
    const s = UsageSummary.of(100, 0, -1, PERIOD_START, PERIOD_END)
    expect(s.txRemaining).toBeNull()
  })

  it('includedTxPerMonth is null (sentinel converted)', () => {
    const s = UsageSummary.of(50, 0, -1, PERIOD_START, PERIOD_END)
    expect(s.includedTxPerMonth).toBeNull()
  })

  it('isExhausted is false regardless of txCount', () => {
    const s = UsageSummary.of(99999, 0, -1, PERIOD_START, PERIOD_END)
    expect(s.isExhausted).toBe(false)
  })

  it('hasOverage is false', () => {
    const s = UsageSummary.of(5000, 100, -1, PERIOD_START, PERIOD_END)
    expect(s.hasOverage).toBe(false)
  })

  it('percentUsed is null', () => {
    const s = UsageSummary.of(200, 0, -1, PERIOD_START, PERIOD_END)
    expect(s.percentUsed).toBeNull()
  })
})

describe('UsageSummary.of — capped plan, within allowance', () => {
  it('txRemaining = includedTxPerMonth - txCount', () => {
    const s = UsageSummary.of(300, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.txRemaining).toBe(700)
  })

  it('includedTxPerMonth echoed back', () => {
    const s = UsageSummary.of(300, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.includedTxPerMonth).toBe(1000)
  })

  it('isExhausted is false', () => {
    const s = UsageSummary.of(999, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.isExhausted).toBe(false)
  })

  it('hasOverage is false when no overage tx', () => {
    const s = UsageSummary.of(500, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.hasOverage).toBe(false)
  })

  it('percentUsed rounds correctly (30%)', () => {
    const s = UsageSummary.of(300, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.percentUsed).toBe(30)
  })
})

describe('UsageSummary.of — at the exact limit', () => {
  it('isExhausted is true', () => {
    const s = UsageSummary.of(1000, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.isExhausted).toBe(true)
  })

  it('txRemaining is 0', () => {
    const s = UsageSummary.of(1000, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.txRemaining).toBe(0)
  })

  it('percentUsed is 100', () => {
    const s = UsageSummary.of(1000, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.percentUsed).toBe(100)
  })
})

describe('UsageSummary.of — over limit (overage)', () => {
  it('txRemaining is clamped to 0 (never negative)', () => {
    const s = UsageSummary.of(1050, 50, 1000, PERIOD_START, PERIOD_END)
    expect(s.txRemaining).toBe(0)
  })

  it('hasOverage is true when overageTxCount > 0 and exhausted', () => {
    const s = UsageSummary.of(1050, 50, 1000, PERIOD_START, PERIOD_END)
    expect(s.hasOverage).toBe(true)
  })

  it('hasOverage is false when exhausted but overageTxCount = 0', () => {
    // Edge: exhausted but overage tracking not yet started
    const s = UsageSummary.of(1000, 0, 1000, PERIOD_START, PERIOD_END)
    expect(s.hasOverage).toBe(false)
  })

  it('percentUsed clamps to 100 (never exceeds)', () => {
    const s = UsageSummary.of(1500, 500, 1000, PERIOD_START, PERIOD_END)
    expect(s.percentUsed).toBe(100)
  })
})

describe('UsageSummary.of — period dates passed through', () => {
  it('billingPeriodStart matches input', () => {
    const s = UsageSummary.of(0, 0, 500, PERIOD_START, PERIOD_END)
    expect(s.billingPeriodStart).toBe(PERIOD_START)
  })

  it('billingPeriodEnd matches input', () => {
    const s = UsageSummary.of(0, 0, 500, PERIOD_START, PERIOD_END)
    expect(s.billingPeriodEnd).toBe(PERIOD_END)
  })

  it('txCount and overageTxCount echoed back', () => {
    const s = UsageSummary.of(42, 7, 500, PERIOD_START, PERIOD_END)
    expect(s.txCount).toBe(42)
    expect(s.overageTxCount).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// UsageSummary.empty
// ---------------------------------------------------------------------------

describe('UsageSummary.empty', () => {
  it('txCount is 0', () => {
    const s = UsageSummary.empty(500, PERIOD_START, PERIOD_END)
    expect(s.txCount).toBe(0)
  })

  it('overageTxCount is 0', () => {
    const s = UsageSummary.empty(500, PERIOD_START, PERIOD_END)
    expect(s.overageTxCount).toBe(0)
  })

  it('txRemaining equals includedTxPerMonth', () => {
    const s = UsageSummary.empty(500, PERIOD_START, PERIOD_END)
    expect(s.txRemaining).toBe(500)
  })

  it('isExhausted is false', () => {
    const s = UsageSummary.empty(500, PERIOD_START, PERIOD_END)
    expect(s.isExhausted).toBe(false)
  })

  it('percentUsed is 0', () => {
    const s = UsageSummary.empty(500, PERIOD_START, PERIOD_END)
    expect(s.percentUsed).toBe(0)
  })

  it('unlimited empty: txRemaining is null', () => {
    const s = UsageSummary.empty(-1, PERIOD_START, PERIOD_END)
    expect(s.txRemaining).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// UsageSummary.formatLabel
// ---------------------------------------------------------------------------

describe('UsageSummary.formatLabel', () => {
  it('unlimited plan — shows tx count + "(unlimited)"', () => {
    const s = UsageSummary.of(1234, 0, -1, PERIOD_START, PERIOD_END)
    expect(UsageSummary.formatLabel(s)).toBe('1,234 transactions (unlimited)')
  })

  it('capped plan — shows "N / M transactions used"', () => {
    const s = UsageSummary.of(300, 0, 1000, PERIOD_START, PERIOD_END)
    expect(UsageSummary.formatLabel(s)).toBe('300 / 1,000 transactions used')
  })

  it('zero usage — shows "0 / M transactions used"', () => {
    const s = UsageSummary.empty(500, PERIOD_START, PERIOD_END)
    expect(UsageSummary.formatLabel(s)).toBe('0 / 500 transactions used')
  })
})

// ---------------------------------------------------------------------------
// UsageSummary.formatRemaining
// ---------------------------------------------------------------------------

describe('UsageSummary.formatRemaining', () => {
  it('unlimited → "Unlimited"', () => {
    const s = UsageSummary.of(0, 0, -1, PERIOD_START, PERIOD_END)
    expect(UsageSummary.formatRemaining(s)).toBe('Unlimited')
  })

  it('exhausted → "None remaining"', () => {
    const s = UsageSummary.of(1000, 0, 1000, PERIOD_START, PERIOD_END)
    expect(UsageSummary.formatRemaining(s)).toBe('None remaining')
  })

  it('normal → "N remaining"', () => {
    const s = UsageSummary.of(300, 0, 1000, PERIOD_START, PERIOD_END)
    expect(UsageSummary.formatRemaining(s)).toBe('700 remaining')
  })
})

// ===========================================================================
// BillingPeriod
// ===========================================================================

// ---------------------------------------------------------------------------
// BillingPeriod.of
// ---------------------------------------------------------------------------

describe('BillingPeriod.of', () => {
  it('returns a period with the given start and end', () => {
    const p = BillingPeriod.of(PERIOD_START, PERIOD_END)
    expect(p.start).toBe(PERIOD_START)
    expect(p.end).toBe(PERIOD_END)
  })

  it('throws when start equals end', () => {
    const d = new Date('2026-06-01')
    expect(() => BillingPeriod.of(d, d)).toThrow(/start.*must be before end/)
  })

  it('throws when start is after end', () => {
    expect(() => BillingPeriod.of(PERIOD_END, PERIOD_START)).toThrow(/start.*must be before end/)
  })
})

// ---------------------------------------------------------------------------
// BillingPeriod.contains
// ---------------------------------------------------------------------------

describe('BillingPeriod.contains', () => {
  const period = BillingPeriod.of(
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-30T23:59:59.999Z'),
  )

  it('returns true for a date exactly at the start boundary', () => {
    expect(BillingPeriod.contains(period, new Date('2026-06-01T00:00:00.000Z'))).toBe(true)
  })

  it('returns true for a date exactly at the end boundary', () => {
    expect(BillingPeriod.contains(period, new Date('2026-06-30T23:59:59.999Z'))).toBe(true)
  })

  it('returns true for a date in the middle of the period', () => {
    expect(BillingPeriod.contains(period, new Date('2026-06-15T12:00:00.000Z'))).toBe(true)
  })

  it('returns false for a date before the period', () => {
    expect(BillingPeriod.contains(period, new Date('2026-05-31T23:59:59.999Z'))).toBe(false)
  })

  it('returns false for a date after the period', () => {
    expect(BillingPeriod.contains(period, new Date('2026-07-01T00:00:00.000Z'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BillingPeriod.next
// ---------------------------------------------------------------------------

describe('BillingPeriod.next', () => {
  it('next period starts 1ms after the current end', () => {
    const p = BillingPeriod.of(
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T23:59:59.999Z'),
    )
    const n = BillingPeriod.next(p)
    expect(n.start.getTime()).toBe(p.end.getTime() + 1)
  })

  it('next period has the same duration as the current period', () => {
    const p = BillingPeriod.of(
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T23:59:59.999Z'),
    )
    const n = BillingPeriod.next(p)
    const currentDuration = p.end.getTime() - p.start.getTime()
    const nextDuration = n.end.getTime() - n.start.getTime()
    expect(nextDuration).toBe(currentDuration)
  })

  it('chaining next() twice advances by two durations', () => {
    const p = BillingPeriod.of(
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T23:59:59.999Z'),
    )
    const p2 = BillingPeriod.next(p)
    const p3 = BillingPeriod.next(p2)
    expect(p3.start.getTime()).toBeGreaterThan(p2.end.getTime())
  })
})

// ---------------------------------------------------------------------------
// BillingPeriod.overlaps
// ---------------------------------------------------------------------------

describe('BillingPeriod.overlaps', () => {
  const june = BillingPeriod.of(
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-30T23:59:59.999Z'),
  )
  const midJune = BillingPeriod.of(
    new Date('2026-06-15T00:00:00.000Z'),
    new Date('2026-07-14T23:59:59.999Z'),
  )
  const july = BillingPeriod.of(
    new Date('2026-07-01T00:00:00.000Z'),
    new Date('2026-07-31T23:59:59.999Z'),
  )

  it('overlapping periods → true', () => {
    expect(BillingPeriod.overlaps(june, midJune)).toBe(true)
  })

  it('overlap is symmetric', () => {
    expect(BillingPeriod.overlaps(midJune, june)).toBe(true)
  })

  it('non-overlapping periods → false', () => {
    expect(BillingPeriod.overlaps(june, july)).toBe(false)
  })

  it('a period overlaps itself', () => {
    expect(BillingPeriod.overlaps(june, june)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BillingPeriod.currentMonth
// ---------------------------------------------------------------------------

describe('BillingPeriod.currentMonth', () => {
  it('when today is on or after anchor day — period started this month', () => {
    // anchorDay = 1, today = June 15 → period: June 1 – June 30 (last day before next anchor)
    const now = new Date('2026-06-15T12:00:00.000Z')
    const p = BillingPeriod.currentMonth(now, 1)
    expect(p.start.getFullYear()).toBe(2026)
    expect(p.start.getMonth()).toBe(5) // June = 5
    expect(p.start.getDate()).toBe(1)
  })

  it('when today is before anchor day — period started last month', () => {
    // anchorDay = 20, today = June 5 → period started May 20
    const now = new Date('2026-06-05T12:00:00.000Z')
    const p = BillingPeriod.currentMonth(now, 20)
    expect(p.start.getMonth()).toBe(4) // May = 4
    expect(p.start.getDate()).toBe(20)
  })

  it('period end is one day before anchor in the following month', () => {
    // anchorDay = 15, today = June 20 → period: June 15 – July 14
    const now = new Date('2026-06-20T00:00:00.000Z')
    const p = BillingPeriod.currentMonth(now, 15)
    expect(p.end.getMonth()).toBe(6) // July = 6
    expect(p.end.getDate()).toBe(14)
  })

  it('start is before end (valid period)', () => {
    const now = new Date('2026-06-15T00:00:00.000Z')
    const p = BillingPeriod.currentMonth(now, 1)
    expect(p.start < p.end).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BillingPeriod.duration
// ---------------------------------------------------------------------------

describe('BillingPeriod.duration', () => {
  // Exactly 1 day = 86400000 ms
  const oneDayPeriod = BillingPeriod.of(
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-02T00:00:00.000Z'),
  )

  it('"ms" returns duration in milliseconds', () => {
    expect(BillingPeriod.duration(oneDayPeriod, 'ms')).toBe(86400000)
  })

  it('"minutes" returns duration in minutes', () => {
    expect(BillingPeriod.duration(oneDayPeriod, 'minutes')).toBe(1440)
  })

  it('"hours" returns duration in hours', () => {
    expect(BillingPeriod.duration(oneDayPeriod, 'hours')).toBe(24)
  })

  it('"days" returns duration in days', () => {
    expect(BillingPeriod.duration(oneDayPeriod, 'days')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// BillingPeriod.toISOStrings
// ---------------------------------------------------------------------------

describe('BillingPeriod.toISOStrings', () => {
  it('returns start as ISO string', () => {
    const p = BillingPeriod.of(PERIOD_START, PERIOD_END)
    const { start } = BillingPeriod.toISOStrings(p)
    expect(start).toBe(PERIOD_START.toISOString())
  })

  it('returns end as ISO string', () => {
    const p = BillingPeriod.of(PERIOD_START, PERIOD_END)
    const { end } = BillingPeriod.toISOStrings(p)
    expect(end).toBe(PERIOD_END.toISOString())
  })
})
