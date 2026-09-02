/**
 * subscription-policy.ts
 *
 * SubscriptionPolicy — encodes the configurable business rules that govern
 * subscription lifecycle transitions.
 *
 * Receives LifecycleThresholds as a parameter (assembled from configuration by
 * the Application Layer) — never reads config directly. All thresholds are
 * expressed as days.
 *
 * Policy answers "should we?" questions:
 *   - Has the trial period ended for this subscription?
 *   - Has the grace period window expired?
 *   - Has the account been inactive long enough for LONG_TERM_INACTIVE?
 *
 * Engine answers "how do we?" questions (handled in subscription-engine.ts).
 */

import type { LifecycleThresholds } from '../types'

// ---------------------------------------------------------------------------
// SubscriptionPolicy
// ---------------------------------------------------------------------------

/**
 * Returns true if the trial has ended — trialEndsAt exists and is in the past.
 * @param trialEndsAt - The trial expiry timestamp; null = no trial set (treat as ended)
 * @param now - Current time, passed explicitly for determinism
 */
export function isTrialEnded(trialEndsAt: Date | null, now: Date): boolean {
  if (trialEndsAt === null) return true // No trial set → treat as already ended
  return now >= trialEndsAt
}

/**
 * Returns true if the grace period has expired — gracePeriodEndsAt exists and is in the past.
 * @param gracePeriodEndsAt - When the grace window closes; null = not in grace period
 * @param now - Current time
 */
export function isGracePeriodEnded(gracePeriodEndsAt: Date | null, now: Date): boolean {
  if (gracePeriodEndsAt === null) return false // Never in grace period
  return now >= gracePeriodEndsAt
}

/**
 * Returns true if the account should be transitioned to LONG_TERM_INACTIVE.
 * Condition: expiredAt exists AND (now - expiredAt) >= longTermInactiveDays.
 * @param expiredAt - When the subscription first lapsed
 * @param thresholds - Policy thresholds from configuration
 * @param now - Current time
 */
export function isLongTermInactiveThresholdReached(expiredAt: Date | null, thresholds: LifecycleThresholds, now: Date): boolean {
  if (expiredAt === null) return false
  const thresholdMs = thresholds.longTermInactiveDays * 24 * 60 * 60 * 1000
  return now.getTime() - expiredAt.getTime() >= thresholdMs
}

/**
 * Compute the grace period end date from an expiry point.
 * @param expiredAt - When the subscription first lapsed (transition to EXPIRED)
 * @param thresholds - Policy thresholds from configuration
 */
export function computeGracePeriodEndDate(expiredAt: Date, thresholds: LifecycleThresholds): Date {
  const gracePeriodMs = thresholds.gracePeriodDays * 24 * 60 * 60 * 1000
  return new Date(expiredAt.getTime() + gracePeriodMs)
}

/**
 * Compute the trial end date from the subscription creation date.
 * @param createdAt - When the BusinessSubscription was created
 * @param thresholds - Policy thresholds from configuration
 */
export function computeTrialEndDate(createdAt: Date, thresholds: LifecycleThresholds): Date {
  const trialMs = thresholds.trialDurationDays * 24 * 60 * 60 * 1000
  return new Date(createdAt.getTime() + trialMs)
}

/**
 * Returns the number of days remaining in the trial, or 0 if expired.
 * Returns null if trialEndsAt is not set.
 * @param trialEndsAt - The trial expiry timestamp
 * @param now - Current time
 */
export function trialDaysRemaining(trialEndsAt: Date | null, now: Date): number | null {
  if (trialEndsAt === null) return null
  const msRemaining = trialEndsAt.getTime() - now.getTime()
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))
}

/**
 * Returns true if the trial is within the warning window (last N days).
 * Used to show conversion prompts in the UI.
 * @param trialEndsAt - The trial expiry timestamp
 * @param warningDays - How many days before expiry to start showing the warning
 * @param now - Current time
 */
export function isTrialInWarningWindow(trialEndsAt: Date | null, warningDays: number, now: Date): boolean {
  const remaining = trialDaysRemaining(trialEndsAt, now)
  if (remaining === null) return false
  return remaining <= warningDays && remaining > 0
}

// Namespace export
export const SubscriptionPolicy = {
  isTrialEnded,
  isGracePeriodEnded,
  isLongTermInactiveThresholdReached,
  computeGracePeriodEndDate,
  computeTrialEndDate,
  trialDaysRemaining,
  isTrialInWarningWindow,
}
