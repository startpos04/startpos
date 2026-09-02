/**
 * subscription-engine-advance.test.ts
 *
 * Unit tests for SubscriptionEngine advance payment features
 *
 * Tests cover:
 * - hasActiveAdvanceCredits() - credit validity detection
 * - shouldSkipBillingPeriod() - billing skip logic
 * - getEffectiveExpirationDate() - expiration date calculation
 * - evaluateAdvancePaymentExpiring() - notification evaluation
 * - evaluateGracePeriodExpiry() - grace period with advance credits
 */

import { describe, it, expect } from 'vitest'
import { SubscriptionEngine } from '@/lib/billing/subscription-engine'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import type { SubscriptionSnapshot } from '@/lib/billing/types'

// ---------------------------------------------------------------------------
// Test Data Factory
// ---------------------------------------------------------------------------

function createMockSnapshot(overrides?: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    subscriptionId: 'sub-001',
    status: SubscriptionStatus.ACTIVE,
    billingModel: 'MONTHLY_SUBSCRIPTION',
    currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
    gracePeriodEndsAt: null,
    suspensionReason: null,
    suspendedAt: null,
    suspendedBy: null,
    cancelledAt: null,
    cancellationReason: null,
    reactivatedAt: null,
    advancePaymentCredits: 0,
    advancePaymentExpiresAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionEngine - Advance Payment Features', () => {
  // -------------------------------------------------------------------------
  // hasActiveAdvanceCredits()
  // -------------------------------------------------------------------------

  describe('hasActiveAdvanceCredits', () => {
    it('returns true when subscription has valid advance credits', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(true)
    })

    it('returns false when subscription has zero credits', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(false)
    })

    it('returns false when subscription has negative credits', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: -1,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(false)
    })

    it('returns false when expiration date is null', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: null,
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(false)
    })

    it('returns false when credits are expired (exact match)', () => {
      const expiryDate = new Date('2026-09-01T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: expiryDate,
      })
      const now = expiryDate

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(false)
    })

    it('returns false when credits expired in the past', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-08-01T00:00:00Z'),
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(false)
    })

    it('returns true when credits expire in 1 second', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: new Date('2026-09-01T00:00:01Z'),
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(true)
    })

    it('returns true on the last day before expiry', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: new Date('2026-09-02T00:00:00Z'),
      })
      const now = new Date('2026-09-01T23:59:59Z')

      const result = SubscriptionEngine.hasActiveAdvanceCredits(snapshot, now)

      expect(result).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // shouldSkipBillingPeriod()
  // -------------------------------------------------------------------------

  describe('shouldSkipBillingPeriod', () => {
    it('returns true when period starts before advance payment expires', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const periodStart = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.shouldSkipBillingPeriod(snapshot, periodStart)

      expect(result).toBe(true)
    })

    it('returns false when period starts after advance payment expires', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-11-01T00:00:00Z'),
      })
      const periodStart = new Date('2026-12-01T00:00:00Z')

      const result = SubscriptionEngine.shouldSkipBillingPeriod(snapshot, periodStart)

      expect(result).toBe(false)
    })

    it('returns false when period starts exactly at expiration', () => {
      const expiryDate = new Date('2026-11-01T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: expiryDate,
      })
      const periodStart = expiryDate

      const result = SubscriptionEngine.shouldSkipBillingPeriod(snapshot, periodStart)

      expect(result).toBe(false)
    })

    it('returns false when subscription has zero credits', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const periodStart = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.shouldSkipBillingPeriod(snapshot, periodStart)

      expect(result).toBe(false)
    })

    it('returns false when expiration date is null', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: null,
      })
      const periodStart = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.shouldSkipBillingPeriod(snapshot, periodStart)

      expect(result).toBe(false)
    })

    it('returns true for last covered period', () => {
      // Expiry is Dec 1, so Nov 1 period should still be skipped
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const periodStart = new Date('2026-11-01T00:00:00Z')

      const result = SubscriptionEngine.shouldSkipBillingPeriod(snapshot, periodStart)

      expect(result).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // getEffectiveExpirationDate()
  // -------------------------------------------------------------------------

  describe('getEffectiveExpirationDate', () => {
    it('returns advance payment expiration when credits exist', () => {
      const advanceExpiry = new Date('2026-12-01T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: advanceExpiry,
        currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      })

      const result = SubscriptionEngine.getEffectiveExpirationDate(snapshot)

      expect(result).toEqual(advanceExpiry)
    })

    it('returns current period end when no advance credits', () => {
      const periodEnd = new Date('2026-09-01T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
        currentPeriodEnd: periodEnd,
      })

      const result = SubscriptionEngine.getEffectiveExpirationDate(snapshot)

      expect(result).toEqual(periodEnd)
    })

    it('returns current period end when advance expiry is null', () => {
      const periodEnd = new Date('2026-09-01T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: null,
        currentPeriodEnd: periodEnd,
      })

      const result = SubscriptionEngine.getEffectiveExpirationDate(snapshot)

      expect(result).toEqual(periodEnd)
    })

    it('returns current period end when credits are zero', () => {
      const periodEnd = new Date('2026-09-01T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
        currentPeriodEnd: periodEnd,
      })

      const result = SubscriptionEngine.getEffectiveExpirationDate(snapshot)

      expect(result).toEqual(periodEnd)
    })

    it('prefers advance expiry even if it is earlier than period end', () => {
      const advanceExpiry = new Date('2026-10-01T00:00:00Z')
      const periodEnd = new Date('2026-12-01T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 2,
        advancePaymentExpiresAt: advanceExpiry,
        currentPeriodEnd: periodEnd,
      })

      const result = SubscriptionEngine.getEffectiveExpirationDate(snapshot)

      expect(result).toEqual(advanceExpiry)
    })
  })

  // -------------------------------------------------------------------------
  // evaluateAdvancePaymentExpiring()
  // -------------------------------------------------------------------------

  describe('evaluateAdvancePaymentExpiring', () => {
    it('returns notification details when expiring within grace period days', () => {
      const expiresAt = new Date('2026-09-08T00:00:00Z') // 7 days from now
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: expiresAt,
      })
      const thresholds = { gracePeriodDays: 7 }
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateAdvancePaymentExpiring(
        snapshot,
        thresholds as any,
        now
      )

      expect(result.shouldNotify).toBe(true)
      expect(result.daysRemaining).toBe(7)
      expect(result.expiresAt).toEqual(expiresAt)
    })

    it('returns notification details when expiring in 1 day', () => {
      const expiresAt = new Date('2026-09-02T00:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: expiresAt,
      })
      const thresholds = { gracePeriodDays: 7 }
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateAdvancePaymentExpiring(
        snapshot,
        thresholds as any,
        now
      )

      expect(result.shouldNotify).toBe(true)
      expect(result.daysRemaining).toBe(1)
      expect(result.expiresAt).toEqual(expiresAt)
    })

    it('does not notify when expiring beyond threshold', () => {
      const expiresAt = new Date('2026-09-15T00:00:00Z') // 14 days from now
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: expiresAt,
      })
      const thresholds = { gracePeriodDays: 7 }
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateAdvancePaymentExpiring(
        snapshot,
        thresholds as any,
        now
      )

      expect(result.shouldNotify).toBe(false)
      expect(result.daysRemaining).toBe(14)
      expect(result.expiresAt).toEqual(expiresAt)
    })

    it('does not notify when no advance credits', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
      })
      const thresholds = { gracePeriodDays: 7 }
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateAdvancePaymentExpiring(
        snapshot,
        thresholds as any,
        now
      )

      expect(result.shouldNotify).toBe(false)
      expect(result.daysRemaining).toBe(0)
      expect(result.expiresAt).toBe(null)
    })

    it('does not notify when expiration date is null', () => {
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: null,
      })
      const thresholds = { gracePeriodDays: 7 }
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateAdvancePaymentExpiring(
        snapshot,
        thresholds as any,
        now
      )

      expect(result.shouldNotify).toBe(false)
      expect(result.daysRemaining).toBe(0)
      expect(result.expiresAt).toBe(null)
    })

    it('does not notify when credits already expired', () => {
      const expiresAt = new Date('2026-08-25T00:00:00Z') // Past
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: expiresAt,
      })
      const thresholds = { gracePeriodDays: 7 }
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateAdvancePaymentExpiring(
        snapshot,
        thresholds as any,
        now
      )

      expect(result.shouldNotify).toBe(false)
      expect(result.daysRemaining).toBe(-7) // Negative indicates expired
      expect(result.expiresAt).toEqual(expiresAt)
    })

    it('rounds up fractional days correctly', () => {
      // 6.5 days until expiry should round up to 7 days
      const expiresAt = new Date('2026-09-07T12:00:00Z')
      const snapshot = createMockSnapshot({
        advancePaymentCredits: 2,
        advancePaymentExpiresAt: expiresAt,
      })
      const thresholds = { gracePeriodDays: 7 }
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateAdvancePaymentExpiring(
        snapshot,
        thresholds as any,
        now
      )

      expect(result.shouldNotify).toBe(true)
      expect(result.daysRemaining).toBe(7) // Math.ceil(6.5) = 7
    })
  })

  // -------------------------------------------------------------------------
  // evaluateGracePeriodExpiry() - Integration with advance credits
  // -------------------------------------------------------------------------

  describe('evaluateGracePeriodExpiry with advance credits', () => {
    it('does NOT expire subscription when advance credits are active', () => {
      const snapshot = createMockSnapshot({
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: new Date('2026-08-25T00:00:00Z'), // Grace period ended 7 days ago
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'), // Credits still valid
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, now)

      expect(result.ok).toBe(true)
      expect(result.val).toBe(null) // No transition needed
    })

    it('expires subscription when advance credits are expired', () => {
      const snapshot = createMockSnapshot({
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: new Date('2026-08-25T00:00:00Z'), // Grace period ended
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: new Date('2026-08-20T00:00:00Z'), // Credits expired
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, now)

      expect(result.ok).toBe(true)
      expect(result.val).not.toBe(null)
      expect(result.val?.targetStatus).toBe(SubscriptionStatus.EXPIRED)
    })

    it('expires subscription when no advance credits', () => {
      const snapshot = createMockSnapshot({
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: new Date('2026-08-25T00:00:00Z'),
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, now)

      expect(result.ok).toBe(true)
      expect(result.val).not.toBe(null)
      expect(result.val?.targetStatus).toBe(SubscriptionStatus.EXPIRED)
    })

    it('does not expire when grace period not yet ended', () => {
      const snapshot = createMockSnapshot({
        status: SubscriptionStatus.GRACE_PERIOD,
        gracePeriodEndsAt: new Date('2026-09-15T00:00:00Z'), // Future
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
      })
      const now = new Date('2026-09-01T00:00:00Z')

      const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, now)

      expect(result.ok).toBe(true)
      expect(result.val).toBe(null) // Still in grace period
    })
  })
})
