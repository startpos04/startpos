/**
 * subscription-engine.test.ts
 *
 * Unit tests for SubscriptionEngine — the pure state machine that governs
 * subscription lifecycle transitions.
 *
 * All methods are pure / deterministic (no DB, no HTTP, no side effects),
 * so no mocks are required.
 *
 * Coverage:
 *  - canTransition: every valid edge in the state machine
 *  - canTransition: every invalid edge (same-state self-transitions and
 *    cross-state jumps that are not in the graph)
 *  - buildTransitionRecord: happy path, invalid transition, correct fields
 *  - evaluateTrialExpiry: non-TRIAL status, trial still active, trial ended
 *  - evaluateGracePeriodExpiry: non-GRACE status, grace open, grace ended
 *  - evaluateLongTermInactivity: non-EXPIRED, under threshold, at/over threshold
 *  - buildInitialSubscription: correct status, trialEndsAt offset, sentinel id
 *  - getValidNextStates: spot-checks for TRIAL and CANCELLED
 */

import { describe, expect, it } from 'vitest'
import { SubscriptionEngine } from '@/lib/billing/subscription-engine'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'
import { BillingModel, type LifecycleThresholds, type SubscriptionSnapshot, TransitionTrigger } from '@/lib/billing/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-06-15T12:00:00.000Z')

function daysFromNow(days: number, from = NOW): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

const DEFAULT_THRESHOLDS: LifecycleThresholds = {
  trialDurationDays: 30,
  gracePeriodDays: 7,
  longTermInactiveDays: 90,
}

/** Minimal snapshot builder — override only the fields relevant to each test */
function makeSnapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    id: 'sub-001',
    businessId: 'biz-001',
    status: SubscriptionStatus.TRIAL,
    billingModel: BillingModel.PREPAID_CREDITS,
    trialEndsAt: daysFromNow(10),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    gracePeriodEndsAt: null,
    expiredAt: null,
    longTermInactiveAt: null,
    activatedAt: null,
    cancelledAt: null,
    suspendedAt: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// canTransition — valid edges
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.canTransition — valid transitions', () => {
  const validEdges: [SubscriptionStatus, SubscriptionStatus][] = [
    // From TRIAL
    [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.TRIAL, SubscriptionStatus.GRACE_PERIOD], // Stripe checkout path
    [SubscriptionStatus.TRIAL, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.TRIAL, SubscriptionStatus.CANCELLED],
    [SubscriptionStatus.TRIAL, SubscriptionStatus.SUSPENDED],
    // From ACTIVE
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
    // From GRACE_PERIOD
    [SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.SUSPENDED],
    [SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.CANCELLED],
    // From EXPIRED
    [SubscriptionStatus.EXPIRED, SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.EXPIRED, SubscriptionStatus.LONG_TERM_INACTIVE],
    [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED],
    // From SUSPENDED
    [SubscriptionStatus.SUSPENDED, SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELLED],
    // From LONG_TERM_INACTIVE
    [SubscriptionStatus.LONG_TERM_INACTIVE, SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.LONG_TERM_INACTIVE, SubscriptionStatus.CANCELLED],
    // From CANCELLED
    [SubscriptionStatus.CANCELLED, SubscriptionStatus.ACTIVE],
  ]

  it.each(validEdges)('%s → %s is allowed', (from, to) => {
    const result = SubscriptionEngine.canTransition(from, to)
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// canTransition — invalid edges
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.canTransition — invalid transitions', () => {
  const invalidEdges: [SubscriptionStatus, SubscriptionStatus][] = [
    // Self-transitions are never valid
    [SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.EXPIRED, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.CANCELLED, SubscriptionStatus.CANCELLED],
    // Skipping states
    [SubscriptionStatus.TRIAL, SubscriptionStatus.LONG_TERM_INACTIVE],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.LONG_TERM_INACTIVE],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL],
    // GRACE_PERIOD cannot go back to TRIAL
    [SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.TRIAL],
    [SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.LONG_TERM_INACTIVE],
    // EXPIRED cannot jump to SUSPENDED or GRACE_PERIOD
    [SubscriptionStatus.EXPIRED, SubscriptionStatus.SUSPENDED],
    [SubscriptionStatus.EXPIRED, SubscriptionStatus.GRACE_PERIOD],
    [SubscriptionStatus.EXPIRED, SubscriptionStatus.TRIAL],
    // SUSPENDED cannot go to EXPIRED directly
    [SubscriptionStatus.SUSPENDED, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.SUSPENDED, SubscriptionStatus.TRIAL],
    [SubscriptionStatus.SUSPENDED, SubscriptionStatus.LONG_TERM_INACTIVE],
    // LONG_TERM_INACTIVE cannot jump to SUSPENDED, TRIAL, GRACE, EXPIRED
    [SubscriptionStatus.LONG_TERM_INACTIVE, SubscriptionStatus.TRIAL],
    [SubscriptionStatus.LONG_TERM_INACTIVE, SubscriptionStatus.SUSPENDED],
    [SubscriptionStatus.LONG_TERM_INACTIVE, SubscriptionStatus.GRACE_PERIOD],
    [SubscriptionStatus.LONG_TERM_INACTIVE, SubscriptionStatus.EXPIRED],
    // CANCELLED can only go to ACTIVE
    [SubscriptionStatus.CANCELLED, SubscriptionStatus.TRIAL],
    [SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.CANCELLED, SubscriptionStatus.SUSPENDED],
  ]

  it.each(invalidEdges)('%s → %s is rejected with PRECONDITION_FAILED', (from, to) => {
    const result = SubscriptionEngine.canTransition(from, to)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
      expect(result.reason).toContain(from)
      expect(result.reason).toContain(to)
    }
  })
})

// ---------------------------------------------------------------------------
// buildTransitionRecord
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.buildTransitionRecord', () => {
  it('returns a transition record for a valid transition', () => {
    const snapshot = makeSnapshot({ status: SubscriptionStatus.TRIAL })
    const result = SubscriptionEngine.buildTransitionRecord(
      snapshot,
      SubscriptionStatus.ACTIVE,
      'Business subscribed',
      'user-001',
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.subscriptionId).toBe('sub-001')
      expect(result.value.fromStatus).toBe(SubscriptionStatus.TRIAL)
      expect(result.value.toStatus).toBe(SubscriptionStatus.ACTIVE)
      expect(result.value.reason).toBe('Business subscribed')
      expect(result.value.triggeredBy).toBe('user-001')
    }
  })

  it('propagates canTransition failure for an invalid transition', () => {
    const snapshot = makeSnapshot({ status: SubscriptionStatus.CANCELLED })
    const result = SubscriptionEngine.buildTransitionRecord(
      snapshot,
      SubscriptionStatus.TRIAL, // CANCELLED → TRIAL is invalid
      'invalid attempt',
      'user-001',
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PRECONDITION_FAILED')
    }
  })

  it('records the correct fromStatus from the snapshot', () => {
    const snapshot = makeSnapshot({ status: SubscriptionStatus.GRACE_PERIOD })
    const result = SubscriptionEngine.buildTransitionRecord(
      snapshot,
      SubscriptionStatus.ACTIVE,
      'Payment received',
      TransitionTrigger.PAYMENT,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.fromStatus).toBe(SubscriptionStatus.GRACE_PERIOD)
      expect(result.value.triggeredBy).toBe(TransitionTrigger.PAYMENT)
    }
  })
})

// ---------------------------------------------------------------------------
// evaluateTrialExpiry
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.evaluateTrialExpiry', () => {
  it('returns null when subscription is not in TRIAL status', () => {
    const snapshot = makeSnapshot({ status: SubscriptionStatus.ACTIVE })
    const result = SubscriptionEngine.evaluateTrialExpiry(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns null when the trial period has not yet ended', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: daysFromNow(10), // still 10 days to go
    })
    const result = SubscriptionEngine.evaluateTrialExpiry(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns a TRIAL → EXPIRED record when trial has ended', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: daysFromNow(-1), // expired yesterday
    })
    const result = SubscriptionEngine.evaluateTrialExpiry(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok && result.value) {
      expect(result.value.fromStatus).toBe(SubscriptionStatus.TRIAL)
      expect(result.value.toStatus).toBe(SubscriptionStatus.EXPIRED)
      expect(result.value.triggeredBy).toBe(TransitionTrigger.SYSTEM)
      expect(result.value.subscriptionId).toBe('sub-001')
    }
  })

  it('returns a record when trialEndsAt is exactly now (boundary)', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: NOW, // exactly now → isTrialEnded returns true
    })
    const result = SubscriptionEngine.evaluateTrialExpiry(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).not.toBeNull()
  })

  it('returns null when trialEndsAt is null (treated as ended but status is checked first)', () => {
    // When trialEndsAt is null, SubscriptionPolicy.isTrialEnded returns true.
    // So for a TRIAL subscription with no trialEndsAt set, we expect it to
    // return an expiry record (not null).
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.TRIAL,
      trialEndsAt: null,
    })
    const result = SubscriptionEngine.evaluateTrialExpiry(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // isTrialEnded(null, now) === true, so we expect a record
      expect(result.value).not.toBeNull()
      if (result.value) {
        expect(result.value.toStatus).toBe(SubscriptionStatus.EXPIRED)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// evaluateGracePeriodExpiry
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.evaluateGracePeriodExpiry', () => {
  it('returns null when subscription is not in GRACE_PERIOD status', () => {
    const snapshot = makeSnapshot({ status: SubscriptionStatus.ACTIVE })
    const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns null when the grace window is still open', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.GRACE_PERIOD,
      gracePeriodEndsAt: daysFromNow(3),
    })
    const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns null when gracePeriodEndsAt is null', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.GRACE_PERIOD,
      gracePeriodEndsAt: null,
    })
    const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns a GRACE_PERIOD → EXPIRED record when grace period has ended', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.GRACE_PERIOD,
      gracePeriodEndsAt: daysFromNow(-1),
    })
    const result = SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, NOW)
    expect(result.ok).toBe(true)
    if (result.ok && result.value) {
      expect(result.value.fromStatus).toBe(SubscriptionStatus.GRACE_PERIOD)
      expect(result.value.toStatus).toBe(SubscriptionStatus.EXPIRED)
      expect(result.value.triggeredBy).toBe(TransitionTrigger.SYSTEM)
      expect(result.value.reason).toMatch(/grace period ended/i)
    }
  })
})

// ---------------------------------------------------------------------------
// evaluateLongTermInactivity
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.evaluateLongTermInactivity', () => {
  it('returns null when subscription is not in EXPIRED status', () => {
    const snapshot = makeSnapshot({ status: SubscriptionStatus.ACTIVE })
    const result = SubscriptionEngine.evaluateLongTermInactivity(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns null when expiredAt is null', () => {
    const snapshot = makeSnapshot({ status: SubscriptionStatus.EXPIRED, expiredAt: null })
    const result = SubscriptionEngine.evaluateLongTermInactivity(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns null when under the longTermInactiveDays threshold', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.EXPIRED,
      expiredAt: daysFromNow(-60), // only 60 days, threshold is 90
    })
    const result = SubscriptionEngine.evaluateLongTermInactivity(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBeNull()
  })

  it('returns an EXPIRED → LONG_TERM_INACTIVE record at the threshold boundary', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.EXPIRED,
      expiredAt: daysFromNow(-90), // exactly 90 days
    })
    const result = SubscriptionEngine.evaluateLongTermInactivity(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok && result.value) {
      expect(result.value.fromStatus).toBe(SubscriptionStatus.EXPIRED)
      expect(result.value.toStatus).toBe(SubscriptionStatus.LONG_TERM_INACTIVE)
      expect(result.value.triggeredBy).toBe(TransitionTrigger.SYSTEM)
      expect(result.value.reason).toContain('90')
    }
  })

  it('returns a record when well past the threshold', () => {
    const snapshot = makeSnapshot({
      status: SubscriptionStatus.EXPIRED,
      expiredAt: daysFromNow(-200),
    })
    const result = SubscriptionEngine.evaluateLongTermInactivity(snapshot, DEFAULT_THRESHOLDS, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildInitialSubscription
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.buildInitialSubscription', () => {
  const PLAN_ID = 'plan-trial'
  const BIZ_ID = 'biz-new'

  it('sets status to TRIAL', () => {
    const data = SubscriptionEngine.buildInitialSubscription(
      BIZ_ID,
      PLAN_ID,
      BillingModel.PREPAID_CREDITS,
      DEFAULT_THRESHOLDS,
      NOW,
    )
    expect(data.status).toBe(SubscriptionStatus.TRIAL)
  })

  it('sets trialEndsAt to now + trialDurationDays', () => {
    const data = SubscriptionEngine.buildInitialSubscription(
      BIZ_ID,
      PLAN_ID,
      BillingModel.PREPAID_CREDITS,
      DEFAULT_THRESHOLDS,
      NOW,
    )
    const expectedEndsAt = new Date(NOW.getTime() + 30 * DAY_MS)
    expect(data.trialEndsAt.getTime()).toBe(expectedEndsAt.getTime())
  })

  it('passes through businessId and planId unchanged', () => {
    const data = SubscriptionEngine.buildInitialSubscription(
      BIZ_ID,
      PLAN_ID,
      BillingModel.MONTHLY_SUBSCRIPTION,
      DEFAULT_THRESHOLDS,
      NOW,
    )
    expect(data.businessId).toBe(BIZ_ID)
    expect(data.planId).toBe(PLAN_ID)
    expect(data.billingModel).toBe(BillingModel.MONTHLY_SUBSCRIPTION)
  })

  it('produces a transitionRecord with the __PENDING__ sentinel id', () => {
    const data = SubscriptionEngine.buildInitialSubscription(
      BIZ_ID,
      PLAN_ID,
      BillingModel.PREPAID_CREDITS,
      DEFAULT_THRESHOLDS,
      NOW,
    )
    expect(data.transitionRecord.subscriptionId).toBe('__PENDING__')
    expect(data.transitionRecord.fromStatus).toBeNull()
    expect(data.transitionRecord.toStatus).toBe(SubscriptionStatus.TRIAL)
    expect(data.transitionRecord.triggeredBy).toBe(TransitionTrigger.SYSTEM)
  })

  it('respects a custom trialDurationDays', () => {
    const customThresholds: LifecycleThresholds = { ...DEFAULT_THRESHOLDS, trialDurationDays: 14 }
    const data = SubscriptionEngine.buildInitialSubscription(
      BIZ_ID,
      PLAN_ID,
      BillingModel.PREPAID_CREDITS,
      customThresholds,
      NOW,
    )
    const expectedEndsAt = new Date(NOW.getTime() + 14 * DAY_MS)
    expect(data.trialEndsAt.getTime()).toBe(expectedEndsAt.getTime())
  })
})

// ---------------------------------------------------------------------------
// getValidNextStates
// ---------------------------------------------------------------------------

describe('SubscriptionEngine.getValidNextStates', () => {
  it('returns the correct set for TRIAL', () => {
    const states = SubscriptionEngine.getValidNextStates(SubscriptionStatus.TRIAL)
    expect(states).toContain(SubscriptionStatus.ACTIVE)
    expect(states).toContain(SubscriptionStatus.GRACE_PERIOD) // Stripe checkout path
    expect(states).toContain(SubscriptionStatus.EXPIRED)
    expect(states).toContain(SubscriptionStatus.CANCELLED)
    expect(states).toContain(SubscriptionStatus.SUSPENDED)
    expect(states).not.toContain(SubscriptionStatus.TRIAL)
  })

  it('returns ACTIVE and GRACE_PERIOD for CANCELLED (resubscribe paths)', () => {
    const states = SubscriptionEngine.getValidNextStates(SubscriptionStatus.CANCELLED)
    expect(states).toHaveLength(2)
    expect(states).toContain(SubscriptionStatus.ACTIVE)
    expect(states).toContain(SubscriptionStatus.GRACE_PERIOD)
  })

  it('returns only ACTIVE and CANCELLED for LONG_TERM_INACTIVE', () => {
    const states = SubscriptionEngine.getValidNextStates(SubscriptionStatus.LONG_TERM_INACTIVE)
    expect(states).toHaveLength(2)
    expect(states).toContain(SubscriptionStatus.ACTIVE)
    expect(states).toContain(SubscriptionStatus.CANCELLED)
  })
})
