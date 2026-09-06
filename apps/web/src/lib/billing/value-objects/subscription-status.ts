/**
 * subscription-status.ts — App-layer re-export
 *
 * SubscriptionStatusVO has moved to the platform package so that platform
 * components (app-sidebar, feature gates, etc.) can use it without importing
 * from the app layer.
 *
 * All existing app imports continue to work unchanged.
 */

export {
  canReactivate,
  isInGracePeriod,
  isLongTermInactive,
  isOperationallyActive,
  isOperationallyBlocked,
  isTrial,
  SubscriptionStatus,
  SubscriptionStatusVO,
  toBannerSeverity,
  toLabel,
} from '@platform/lib/entitlement/subscription-status-vo'
