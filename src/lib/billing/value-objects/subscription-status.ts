/**
 * subscription-status.ts
 *
 * SubscriptionStatusVO — thin value-object wrapper around the SubscriptionStatus
 * const that adds domain capability methods: isOperationallyBlocked, canReactivate,
 * isInGracePeriod, etc.
 *
 * The underlying status values are defined in entitlement-types.ts to keep them
 * accessible to the EntitlementEngine without importing from Billing. This VO
 * is for Billing-domain callers that need richer status reasoning.
 */

import { SubscriptionStatus } from '../../entitlement/entitlement-types'

// Re-export so callers can import both the status values and this VO from one place.
export { SubscriptionStatus }

// ---------------------------------------------------------------------------
// Status capability methods
// All functions accept a SubscriptionStatus value and return a boolean.
// ---------------------------------------------------------------------------

/**
 * Returns true if the status hard-blocks all operational features.
 * EXPIRED, SUSPENDED, LONG_TERM_INACTIVE, and CANCELLED are hard blocks.
 * TRIAL, ACTIVE, and GRACE_PERIOD still allow operations.
 */
export function isOperationallyBlocked(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.EXPIRED ||
    status === SubscriptionStatus.SUSPENDED ||
    status === SubscriptionStatus.LONG_TERM_INACTIVE ||
    status === SubscriptionStatus.CANCELLED
  )
}

/**
 * Returns true if the business is in an active billing state
 * (TRIAL, ACTIVE, or GRACE_PERIOD — operational features still accessible).
 */
export function isOperationallyActive(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.TRIAL || status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.GRACE_PERIOD
}

/**
 * Returns true if the status is one from which a self-service reactivation
 * is possible. EXPIRED, LONG_TERM_INACTIVE, and CANCELLED can self-reactivate.
 * SUSPENDED requires admin action.
 */
export function canReactivate(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.EXPIRED || status === SubscriptionStatus.LONG_TERM_INACTIVE || status === SubscriptionStatus.CANCELLED
}

/**
 * Returns true if the subscription is still in the trial window.
 */
export function isTrial(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.TRIAL
}

/**
 * Returns true if the subscription is within the grace period after a lapse.
 */
export function isInGracePeriod(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.GRACE_PERIOD
}

/**
 * Returns true if the account has crossed the long-term inactivity threshold.
 */
export function isLongTermInactive(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.LONG_TERM_INACTIVE
}

/**
 * Returns a human-readable label for the status — used in banners and admin UI.
 */
export function toLabel(status: SubscriptionStatus): string {
  switch (status) {
    case SubscriptionStatus.TRIAL:
      return 'Free Trial'
    case SubscriptionStatus.ACTIVE:
      return 'Active'
    case SubscriptionStatus.GRACE_PERIOD:
      return 'Grace Period'
    case SubscriptionStatus.EXPIRED:
      return 'Expired'
    case SubscriptionStatus.SUSPENDED:
      return 'Suspended'
    case SubscriptionStatus.LONG_TERM_INACTIVE:
      return 'Inactive'
    case SubscriptionStatus.CANCELLED:
      return 'Cancelled'
  }
}

/**
 * Returns a severity level for UI banner rendering.
 * 'none' = no banner needed, 'warning' = soft warning, 'error' = hard block.
 */
export function toBannerSeverity(status: SubscriptionStatus): 'none' | 'warning' | 'error' {
  switch (status) {
    case SubscriptionStatus.TRIAL:
    case SubscriptionStatus.ACTIVE:
      return 'none'
    case SubscriptionStatus.GRACE_PERIOD:
      return 'warning'
    case SubscriptionStatus.EXPIRED:
    case SubscriptionStatus.SUSPENDED:
    case SubscriptionStatus.LONG_TERM_INACTIVE:
    case SubscriptionStatus.CANCELLED:
      return 'error'
  }
}

// Namespace export for dot-notation access
export const SubscriptionStatusVO = {
  isOperationallyBlocked,
  isOperationallyActive,
  canReactivate,
  isTrial,
  isInGracePeriod,
  isLongTermInactive,
  toLabel,
  toBannerSeverity,
}
