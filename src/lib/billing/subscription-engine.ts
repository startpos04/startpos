/**
 * subscription-engine.ts
 *
 * SubscriptionEngine — pure domain engine governing subscription lifecycle
 * state transitions. All transition rules live here.
 *
 * Architectural contract (ADR-001, ADR-002):
 *   - No Prisma imports, no collection reads, no HTTP calls.
 *   - Deterministic: same inputs → same output.
 *   - Returns OperationResult — callers act on the result, never catch exceptions.
 *   - All data arrives as DTOs via SubscriptionSnapshot from the Application Layer.
 *
 * State machine (from v1-master-plan.md §2.5):
 *
 *   TRIAL
 *     ↓ trial period ends
 *   EXPIRED  ←  GRACE_PERIOD (grace window expires)
 *     ↓ no reactivation after LONG_TERM_INACTIVE_DAYS
 *   LONG_TERM_INACTIVE
 *     ↑ business subscribes again
 *   ACTIVE  (all data immediately restored)
 *
 *   ACTIVE / TRIAL / GRACE_PERIOD
 *     ↓ manual admin action
 *   SUSPENDED
 *
 *   ACTIVE / TRIAL / GRACE_PERIOD / EXPIRED
 *     ↓ business cancels
 *   CANCELLED
 *
 * Usage:
 *   const result = SubscriptionEngine.canTransition(snapshot.status, targetStatus)
 *   if (!result.ok) return result
 *   const transition = SubscriptionEngine.buildTransitionRecord(snapshot, targetStatus, reason, triggeredBy)
 */

import { SubscriptionStatus } from '../entitlement/entitlement-types'
import { type OperationResult, opFail, opOk } from '../result'
import { SubscriptionPolicy } from './policies/subscription-policy'
import { type BillingModel, type LifecycleThresholds, type StatusTransitionRecord, type SubscriptionSnapshot, TransitionTrigger } from './types'

// ---------------------------------------------------------------------------
// Valid state machine edges
// Source state → set of allowed target states
// ---------------------------------------------------------------------------
const VALID_TRANSITIONS: Readonly<Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>>> = {
  [SubscriptionStatus.TRIAL]: new Set([
    SubscriptionStatus.ACTIVE, // Trial converted to paid subscription (free plan / direct)
    SubscriptionStatus.GRACE_PERIOD, // Trial user subscribes via Stripe checkout (awaiting payment)
    SubscriptionStatus.EXPIRED, // Trial period ended without payment
    SubscriptionStatus.CANCELLED, // Business cancelled during trial
    SubscriptionStatus.SUSPENDED, // Admin action
  ]),
  [SubscriptionStatus.ACTIVE]: new Set([
    SubscriptionStatus.GRACE_PERIOD, // Payment failed → enter grace window
    SubscriptionStatus.EXPIRED, // Grace period ended; no payment
    SubscriptionStatus.SUSPENDED, // Admin suspension
    SubscriptionStatus.CANCELLED, // Business cancellation
  ]),
  [SubscriptionStatus.GRACE_PERIOD]: new Set([
    SubscriptionStatus.ACTIVE, // Payment received during grace period
    SubscriptionStatus.EXPIRED, // Grace period ended without payment
    SubscriptionStatus.SUSPENDED, // Admin suspension
    SubscriptionStatus.CANCELLED, // Business cancellation during grace
  ]),
  [SubscriptionStatus.EXPIRED]: new Set([
    SubscriptionStatus.ACTIVE, // Reactivated after expiry
    SubscriptionStatus.LONG_TERM_INACTIVE, // Reached inactivity threshold
    SubscriptionStatus.CANCELLED, // Business explicitly cancels
  ]),
  [SubscriptionStatus.SUSPENDED]: new Set([
    SubscriptionStatus.ACTIVE, // Admin lifts suspension
    SubscriptionStatus.CANCELLED, // Admin cancels a suspended account
  ]),
  [SubscriptionStatus.LONG_TERM_INACTIVE]: new Set([
    SubscriptionStatus.ACTIVE, // Business reactivates
    SubscriptionStatus.CANCELLED, // Business cancels
  ]),
  [SubscriptionStatus.CANCELLED]: new Set([
    SubscriptionStatus.ACTIVE, // Business resubscribes after cancellation (free plan / direct activate)
    SubscriptionStatus.GRACE_PERIOD, // Business resubscribes via Stripe checkout (awaiting payment)
  ]),
}

// ---------------------------------------------------------------------------
// SubscriptionEngine
// ---------------------------------------------------------------------------

export const SubscriptionEngine = {
  // -------------------------------------------------------------------------
  // canTransition
  // Validates that a transition from fromStatus → toStatus is defined in the
  // state machine. Returns opFail with PRECONDITION_FAILED if invalid.
  // -------------------------------------------------------------------------
  canTransition(fromStatus: SubscriptionStatus, toStatus: SubscriptionStatus): OperationResult<void> {
    const allowed = VALID_TRANSITIONS[fromStatus]
    if (!allowed.has(toStatus)) {
      return opFail(
        'PRECONDITION_FAILED',
        `Invalid subscription transition: ${fromStatus} → ${toStatus}. ` + `Allowed from ${fromStatus}: [${[...allowed].join(', ')}]`,
      )
    }
    return opOk()
  },

  // -------------------------------------------------------------------------
  // buildTransitionRecord
  // Builds the StatusTransitionRecord to be persisted by the Application Layer.
  // Does not write to the database — returns the record to the caller.
  // -------------------------------------------------------------------------
  buildTransitionRecord(
    snapshot: SubscriptionSnapshot,
    toStatus: SubscriptionStatus,
    reason: string,
    triggeredBy: string,
  ): OperationResult<StatusTransitionRecord> {
    const canResult = SubscriptionEngine.canTransition(snapshot.status, toStatus)
    if (!canResult.ok) return canResult

    return opOk({
      subscriptionId: snapshot.id,
      fromStatus: snapshot.status,
      toStatus,
      reason,
      triggeredBy,
    })
  },

  // -------------------------------------------------------------------------
  // evaluateTrialExpiry
  // Given a snapshot and the current time, returns the target status if the
  // trial should be transitioned. Returns null if no transition is needed.
  //
  // Called by the subscription-lifecycle background job.
  // -------------------------------------------------------------------------
  evaluateTrialExpiry(snapshot: SubscriptionSnapshot, _thresholds: LifecycleThresholds, now: Date): OperationResult<StatusTransitionRecord | null> {
    if (snapshot.status !== SubscriptionStatus.TRIAL) {
      return opOk(null) // Not in trial — nothing to do
    }

    if (!SubscriptionPolicy.isTrialEnded(snapshot.trialEndsAt, now)) {
      return opOk(null) // Trial still active
    }

    const record: StatusTransitionRecord = {
      subscriptionId: snapshot.id,
      fromStatus: SubscriptionStatus.TRIAL,
      toStatus: SubscriptionStatus.EXPIRED,
      reason: 'Trial period ended.',
      triggeredBy: TransitionTrigger.SYSTEM,
    }

    return opOk(record)
  },

  // -------------------------------------------------------------------------
  // evaluateGracePeriodExpiry
  // Returns a transition record if the grace period has ended and the
  // subscription should move from GRACE_PERIOD → EXPIRED.
  // -------------------------------------------------------------------------
  evaluateGracePeriodExpiry(snapshot: SubscriptionSnapshot, now: Date): OperationResult<StatusTransitionRecord | null> {
    if (snapshot.status !== SubscriptionStatus.GRACE_PERIOD) {
      return opOk(null)
    }

    if (!SubscriptionPolicy.isGracePeriodEnded(snapshot.gracePeriodEndsAt, now)) {
      return opOk(null)
    }

    const record: StatusTransitionRecord = {
      subscriptionId: snapshot.id,
      fromStatus: SubscriptionStatus.GRACE_PERIOD,
      toStatus: SubscriptionStatus.EXPIRED,
      reason: 'Grace period ended without payment.',
      triggeredBy: TransitionTrigger.SYSTEM,
    }

    return opOk(record)
  },

  // -------------------------------------------------------------------------
  // evaluateLongTermInactivity
  // Returns a transition record if an EXPIRED subscription has crossed the
  // long-term inactivity threshold.
  // -------------------------------------------------------------------------
  evaluateLongTermInactivity(snapshot: SubscriptionSnapshot, thresholds: LifecycleThresholds, now: Date): OperationResult<StatusTransitionRecord | null> {
    if (snapshot.status !== SubscriptionStatus.EXPIRED) {
      return opOk(null)
    }

    if (!SubscriptionPolicy.isLongTermInactiveThresholdReached(snapshot.expiredAt, thresholds, now)) {
      return opOk(null)
    }

    const record: StatusTransitionRecord = {
      subscriptionId: snapshot.id,
      fromStatus: SubscriptionStatus.EXPIRED,
      toStatus: SubscriptionStatus.LONG_TERM_INACTIVE,
      reason: `No reactivation after ${thresholds.longTermInactiveDays} days.`,
      triggeredBy: TransitionTrigger.SYSTEM,
    }

    return opOk(record)
  },

  // -------------------------------------------------------------------------
  // buildInitialSubscription
  // Returns the data shape for a new TRIAL BusinessSubscription record.
  // Called by trial auto-provisioning in the Application Layer.
  // Does not write to the DB — returns the creation data to the caller.
  // -------------------------------------------------------------------------
  buildInitialSubscription(
    businessId: string,
    planId: string,
    billingModel: BillingModel,
    thresholds: LifecycleThresholds,
    now: Date,
  ): {
    businessId: string
    planId: string
    billingModel: BillingModel
    status: SubscriptionStatus
    trialEndsAt: Date
    transitionRecord: StatusTransitionRecord
  } {
    const trialEndsAt = SubscriptionPolicy.computeTrialEndDate(now, thresholds)

    // We don't have the subscription id yet (generated by the DB),
    // so we use a sentinel. The Application Layer must replace this with
    // the actual id after the BusinessSubscription row is created.
    const transitionRecord: StatusTransitionRecord = {
      subscriptionId: '__PENDING__', // Replaced by Application Layer after insert
      fromStatus: null,
      toStatus: SubscriptionStatus.TRIAL,
      reason: 'Initial trial subscription created.',
      triggeredBy: TransitionTrigger.SYSTEM,
    }

    return {
      businessId,
      planId,
      billingModel,
      status: SubscriptionStatus.TRIAL,
      trialEndsAt,
      transitionRecord,
    }
  },

  // -------------------------------------------------------------------------
  // getValidNextStates
  // Returns the set of valid target states from a given status.
  // Useful for admin UI dropdowns and validation.
  // -------------------------------------------------------------------------
  getValidNextStates(fromStatus: SubscriptionStatus): SubscriptionStatus[] {
    return [...VALID_TRANSITIONS[fromStatus]]
  },
}
