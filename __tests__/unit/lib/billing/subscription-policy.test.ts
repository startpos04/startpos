/**
 * subscription-policy.test.ts
 *
 * Unit tests for SubscriptionPolicy — the pure business rule layer that
 * answers lifecycle "should we?" questions based on dates and thresholds.
 *
 * All functions are deterministic: time is passed as an explicit `now`
 * parameter, so there are no Date.now() calls to mock.
 *
 * Coverage:
 *  - isTrialEnded: null trialEndsAt, future date, exact boundary, past date
 *  - isGracePeriodEnded: null gracePeriodEndsAt, future, exact boundary, past
 *  - isLongTermInactiveThresholdReached: null expiredAt, under threshold, exact, over
 *  - computeGracePeriodEndDate: correct offset from expiredAt
 *  - computeTrialEndDate: correct offset from createdAt
 *  - trialDaysRemaining: null, future, exact day, past (clamped to 0)
 *  - isTrialInWarningWindow: outside, exactly at boundary, inside, expired
 */

import { describe, expect, it } from 'vitest'
import { SubscriptionPolicy } from '@/lib/billing/policies/subscription-policy'
import type { LifecycleThresholds } from '@/lib/billing/types'

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: LifecycleThresholds = {
  trialDurationDays: 30,
  gracePeriodDays: 7,
  longTermInactiveDays: 90,
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysFromNow(days: number, from: Date): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

// A fixed "now" to use across tests so results are stable
const NOW = new Date('2026-06-15T12:00:00.000Z')

// ---------------------------------------------------------------------------
// isTrialEnded
// ---------------------------------------------------------------------------

describe('SubscriptionPolicy.isTrialEnded', () => {
  it('returns true when trialEndsAt is null (no trial set)', () => {
    expect(SubscriptionPolicy.isTrialEnded(null, NOW)).toBe(true)
  })

  it('returns false when trialEndsAt is in the future', () => {
    const future = daysFromNow(5, NOW)
    expect(SubscriptionPolicy.isTrialEnded(future, NOW)).toBe(false)
  })

  it('returns true at the exact moment trialEndsAt === now', () => {
    expect(SubscriptionPolicy.isTrialEnded(NOW, NOW)).toBe(true)
  })

  it('returns true when trialEndsAt is in the past', () => {
    const past = daysFromNow(-1, NOW)
    expect(SubscriptionPolicy.isTrialEnded(past, NOW)).toBe(true)
  })

  it('returns false when trialEndsAt is 1 ms in the future', () => {
    const almostNow = new Date(NOW.getTime() + 1)
    expect(SubscriptionPolicy.isTrialEnded(almostNow, NOW)).toBe(false)
  })

  it('returns true when trialEndsAt is 1 ms in the past', () => {
    const justPast = new Date(NOW.getTime() - 1)
    expect(SubscriptionPolicy.isTrialEnded(justPast, NOW)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isGracePeriodEnded
// ---------------------------------------------------------------------------

describe('SubscriptionPolicy.isGracePeriodEnded', () => {
  it('returns false when gracePeriodEndsAt is null (not in grace period)', () => {
    expect(SubscriptionPolicy.isGracePeriodEnded(null, NOW)).toBe(false)
  })

  it('returns false when grace window is still open', () => {
    const future = daysFromNow(3, NOW)
    expect(SubscriptionPolicy.isGracePeriodEnded(future, NOW)).toBe(false)
  })

  it('returns true at the exact moment grace period ends', () => {
    expect(SubscriptionPolicy.isGracePeriodEnded(NOW, NOW)).toBe(true)
  })

  it('returns true after the grace period has passed', () => {
    const past = daysFromNow(-1, NOW)
    expect(SubscriptionPolicy.isGracePeriodEnded(past, NOW)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isLongTermInactiveThresholdReached
// ---------------------------------------------------------------------------

describe('SubscriptionPolicy.isLongTermInactiveThresholdReached', () => {
  it('returns false when expiredAt is null', () => {
    expect(SubscriptionPolicy.isLongTermInactiveThresholdReached(null, DEFAULT_THRESHOLDS, NOW)).toBe(false)
  })

  it('returns false when the elapsed time is less than longTermInactiveDays', () => {
    const expiredAt = daysFromNow(-89, NOW) // 89 days ago, threshold is 90
    expect(SubscriptionPolicy.isLongTermInactiveThresholdReached(expiredAt, DEFAULT_THRESHOLDS, NOW)).toBe(false)
  })

  it('returns true exactly at the longTermInactiveDays boundary', () => {
    const expiredAt = daysFromNow(-90, NOW) // exactly 90 days ago
    expect(SubscriptionPolicy.isLongTermInactiveThresholdReached(expiredAt, DEFAULT_THRESHOLDS, NOW)).toBe(true)
  })

  it('returns true when elapsed time exceeds longTermInactiveDays', () => {
    const expiredAt = daysFromNow(-120, NOW)
    expect(SubscriptionPolicy.isLongTermInactiveThresholdReached(expiredAt, DEFAULT_THRESHOLDS, NOW)).toBe(true)
  })

  it('respects a custom threshold override', () => {
    const customThresholds: LifecycleThresholds = { ...DEFAULT_THRESHOLDS, longTermInactiveDays: 30 }
    const expiredAt = daysFromNow(-29, NOW) // 29 days, threshold is 30
    expect(SubscriptionPolicy.isLongTermInactiveThresholdReached(expiredAt, customThresholds, NOW)).toBe(false)

    const expiredAtBoundary = daysFromNow(-30, NOW)
    expect(SubscriptionPolicy.isLongTermInactiveThresholdReached(expiredAtBoundary, customThresholds, NOW)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// computeGracePeriodEndDate
// ---------------------------------------------------------------------------

describe('SubscriptionPolicy.computeGracePeriodEndDate', () => {
  it('adds gracePeriodDays to the expiry date', () => {
    const expiredAt = new Date('2026-06-01T00:00:00.000Z')
    const result = SubscriptionPolicy.computeGracePeriodEndDate(expiredAt, DEFAULT_THRESHOLDS)
    const expected = new Date('2026-06-08T00:00:00.000Z') // +7 days
    expect(result.getTime()).toBe(expected.getTime())
  })

  it('uses the custom gracePeriodDays from thresholds', () => {
    const expiredAt = new Date('2026-06-01T00:00:00.000Z')
    const thresholds: LifecycleThresholds = { ...DEFAULT_THRESHOLDS, gracePeriodDays: 14 }
    const result = SubscriptionPolicy.computeGracePeriodEndDate(expiredAt, thresholds)
    const expected = new Date('2026-06-15T00:00:00.000Z') // +14 days
    expect(result.getTime()).toBe(expected.getTime())
  })
})

// ---------------------------------------------------------------------------
// computeTrialEndDate
// ---------------------------------------------------------------------------

describe('SubscriptionPolicy.computeTrialEndDate', () => {
  it('adds trialDurationDays to the creation date', () => {
    const createdAt = new Date('2026-06-01T00:00:00.000Z')
    const result = SubscriptionPolicy.computeTrialEndDate(createdAt, DEFAULT_THRESHOLDS)
    const expected = new Date('2026-07-01T00:00:00.000Z') // +30 days
    expect(result.getTime()).toBe(expected.getTime())
  })

  it('uses a custom trialDurationDays', () => {
    const createdAt = new Date('2026-06-01T00:00:00.000Z')
    const thresholds: LifecycleThresholds = { ...DEFAULT_THRESHOLDS, trialDurationDays: 14 }
    const result = SubscriptionPolicy.computeTrialEndDate(createdAt, thresholds)
    const expected = new Date('2026-06-15T00:00:00.000Z') // +14 days
    expect(result.getTime()).toBe(expected.getTime())
  })
})

// ---------------------------------------------------------------------------
// trialDaysRemaining
// ---------------------------------------------------------------------------

describe('SubscriptionPolicy.trialDaysRemaining', () => {
  it('returns null when trialEndsAt is null', () => {
    expect(SubscriptionPolicy.trialDaysRemaining(null, NOW)).toBeNull()
  })

  it('returns the correct number of days remaining', () => {
    const endsAt = daysFromNow(10, NOW)
    expect(SubscriptionPolicy.trialDaysRemaining(endsAt, NOW)).toBe(10)
  })

  it('returns 1 when less than 24 hours remain (ceiled)', () => {
    const endsAt = new Date(NOW.getTime() + 1) // 1 ms from now → ceil to 1 day
    expect(SubscriptionPolicy.trialDaysRemaining(endsAt, NOW)).toBe(1)
  })

  it('returns 0 when trialEndsAt has passed (clamped)', () => {
    const past = daysFromNow(-5, NOW)
    expect(SubscriptionPolicy.trialDaysRemaining(past, NOW)).toBe(0)
  })

  it('returns 0 when trialEndsAt equals now (exactly expired)', () => {
    expect(SubscriptionPolicy.trialDaysRemaining(NOW, NOW)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// isTrialInWarningWindow
// ---------------------------------------------------------------------------

describe('SubscriptionPolicy.isTrialInWarningWindow', () => {
  const WARNING_DAYS = 7

  it('returns false when trialEndsAt is null', () => {
    expect(SubscriptionPolicy.isTrialInWarningWindow(null, WARNING_DAYS, NOW)).toBe(false)
  })

  it('returns false when trial has more than warningDays remaining', () => {
    const endsAt = daysFromNow(15, NOW) // 15 days left, warning at 7
    expect(SubscriptionPolicy.isTrialInWarningWindow(endsAt, WARNING_DAYS, NOW)).toBe(false)
  })

  it('returns true when exactly at the warning boundary (7 days remaining)', () => {
    const endsAt = daysFromNow(7, NOW)
    // 7 days from now → trialDaysRemaining returns 7 → 7 <= 7 && 7 > 0 → true
    expect(SubscriptionPolicy.isTrialInWarningWindow(endsAt, WARNING_DAYS, NOW)).toBe(true)
  })

  it('returns true when inside the warning window', () => {
    const endsAt = daysFromNow(3, NOW)
    expect(SubscriptionPolicy.isTrialInWarningWindow(endsAt, WARNING_DAYS, NOW)).toBe(true)
  })

  it('returns false when trial has already expired (0 days remaining)', () => {
    const past = daysFromNow(-1, NOW)
    expect(SubscriptionPolicy.isTrialInWarningWindow(past, WARNING_DAYS, NOW)).toBe(false)
  })
})
