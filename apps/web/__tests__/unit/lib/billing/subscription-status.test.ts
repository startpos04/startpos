/**
 * subscription-status.test.ts
 *
 * Coverage:
 *  - isOperationallyBlocked: EXPIRED, SUSPENDED, LONG_TERM_INACTIVE, CANCELLED → true; TRIAL, ACTIVE, GRACE_PERIOD → false
 *  - isOperationallyActive: TRIAL, ACTIVE, GRACE_PERIOD → true; rest → false
 *  - canReactivate: EXPIRED, LONG_TERM_INACTIVE, CANCELLED → true; SUSPENDED, TRIAL, ACTIVE, GRACE_PERIOD → false
 *  - isTrial: TRIAL → true; all others → false
 *  - isInGracePeriod: GRACE_PERIOD → true; all others → false
 *  - isLongTermInactive: LONG_TERM_INACTIVE → true; all others → false
 *  - toLabel: correct label string for every status
 *  - toBannerSeverity: 'none' for TRIAL/ACTIVE, 'warning' for GRACE_PERIOD, 'error' for rest
 */

import { describe, expect, it } from 'vitest'
import {
  SubscriptionStatus,
  SubscriptionStatusVO,
  canReactivate,
  isInGracePeriod,
  isLongTermInactive,
  isOperationallyActive,
  isOperationallyBlocked,
  isTrial,
  toBannerSeverity,
  toLabel,
} from '@/lib/billing/value-objects/subscription-status'

// ---------------------------------------------------------------------------
// isOperationallyBlocked
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.isOperationallyBlocked', () => {
  it.each([
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
    SubscriptionStatus.CANCELLED,
  ])('%s → true (hard block)', status => {
    expect(isOperationallyBlocked(status)).toBe(true)
  })

  it.each([
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.GRACE_PERIOD,
  ])('%s → false (operations still allowed)', status => {
    expect(isOperationallyBlocked(status)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isOperationallyActive
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.isOperationallyActive', () => {
  it.each([
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.GRACE_PERIOD,
  ])('%s → true', status => {
    expect(isOperationallyActive(status)).toBe(true)
  })

  it.each([
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
    SubscriptionStatus.CANCELLED,
  ])('%s → false', status => {
    expect(isOperationallyActive(status)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// canReactivate
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.canReactivate', () => {
  it.each([
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
    SubscriptionStatus.CANCELLED,
  ])('%s → true (self-service reactivation allowed)', status => {
    expect(canReactivate(status)).toBe(true)
  })

  it('SUSPENDED → false (requires admin action, not self-service)', () => {
    expect(canReactivate(SubscriptionStatus.SUSPENDED)).toBe(false)
  })

  it.each([
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.GRACE_PERIOD,
  ])('%s → false (already operational)', status => {
    expect(canReactivate(status)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isTrial
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.isTrial', () => {
  it('TRIAL → true', () => {
    expect(isTrial(SubscriptionStatus.TRIAL)).toBe(true)
  })

  it.each([
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.GRACE_PERIOD,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
    SubscriptionStatus.CANCELLED,
  ])('%s → false', status => {
    expect(isTrial(status)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isInGracePeriod
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.isInGracePeriod', () => {
  it('GRACE_PERIOD → true', () => {
    expect(isInGracePeriod(SubscriptionStatus.GRACE_PERIOD)).toBe(true)
  })

  it.each([
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
    SubscriptionStatus.CANCELLED,
  ])('%s → false', status => {
    expect(isInGracePeriod(status)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isLongTermInactive
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.isLongTermInactive', () => {
  it('LONG_TERM_INACTIVE → true', () => {
    expect(isLongTermInactive(SubscriptionStatus.LONG_TERM_INACTIVE)).toBe(true)
  })

  it.each([
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.GRACE_PERIOD,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.CANCELLED,
  ])('%s → false', status => {
    expect(isLongTermInactive(status)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// toLabel
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.toLabel', () => {
  const cases: [SubscriptionStatus, string][] = [
    [SubscriptionStatus.TRIAL, 'Free Trial'],
    [SubscriptionStatus.ACTIVE, 'Active'],
    [SubscriptionStatus.GRACE_PERIOD, 'Grace Period'],
    [SubscriptionStatus.EXPIRED, 'Expired'],
    [SubscriptionStatus.SUSPENDED, 'Suspended'],
    [SubscriptionStatus.LONG_TERM_INACTIVE, 'Inactive'],
    [SubscriptionStatus.CANCELLED, 'Cancelled'],
  ]

  it.each(cases)('%s → "%s"', (status, label) => {
    expect(toLabel(status)).toBe(label)
  })
})

// ---------------------------------------------------------------------------
// toBannerSeverity
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO.toBannerSeverity', () => {
  it.each([
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.ACTIVE,
  ])('%s → "none" (no banner needed)', status => {
    expect(toBannerSeverity(status)).toBe('none')
  })

  it('GRACE_PERIOD → "warning"', () => {
    expect(toBannerSeverity(SubscriptionStatus.GRACE_PERIOD)).toBe('warning')
  })

  it.each([
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.LONG_TERM_INACTIVE,
    SubscriptionStatus.CANCELLED,
  ])('%s → "error" (hard block banner)', status => {
    expect(toBannerSeverity(status)).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Namespace export (SubscriptionStatusVO dot-notation)
// ---------------------------------------------------------------------------

describe('SubscriptionStatusVO namespace re-exports all functions', () => {
  it('SubscriptionStatusVO.isOperationallyBlocked works', () => {
    expect(SubscriptionStatusVO.isOperationallyBlocked(SubscriptionStatus.EXPIRED)).toBe(true)
  })

  it('SubscriptionStatusVO.toLabel works', () => {
    expect(SubscriptionStatusVO.toLabel(SubscriptionStatus.ACTIVE)).toBe('Active')
  })

  it('SubscriptionStatusVO.toBannerSeverity works', () => {
    expect(SubscriptionStatusVO.toBannerSeverity(SubscriptionStatus.GRACE_PERIOD)).toBe('warning')
  })
})
