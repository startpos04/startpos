/**
 * usage-notification-engine.ts
 *
 * UsageNotificationEngine — pure domain engine that determines whether a
 * usage threshold notification should be sent, and what it should say.
 *
 * Architectural contract (ADR-001):
 *   - No Prisma imports, no collection reads, no HTTP calls, no side effects.
 *   - All data arrives as plain DTOs via UsageNotificationContext.
 *   - Returns a UsageNotificationResult — callers deliver the notification and
 *     persist the updated threshold state.
 *
 * Separation of concerns:
 *   UsageEngine          → measures usage, enforces limits
 *   UsageThresholdPolicy → pure threshold math + deduplication helpers
 *   UsageNotificationEngine → combines the above, produces notification content
 *   NotificationEngine   → delivers the notification to recipients
 *
 * Usage:
 *   // 1. After a TX or credit event, assemble context from existing data:
 *   const context: UsageNotificationContext = {
 *     resource: UsageResource.TRANSACTIONS,
 *     currentUsage: counter.txCount,          // from UsageCounter
 *     limit: plan.includedTxPerMonth,          // from SubscriptionPlan
 *     periodKind: UsagePeriodKind.TRIAL,
 *     periodKey: UsageThresholdPolicy.buildPeriodKey(...),
 *     alreadyNotifiedThresholds: loadedFromStorage,
 *   }
 *
 *   // 2. Evaluate:
 *   const result = UsageNotificationEngine.evaluate(context)
 *
 *   // 3. If shouldNotify, deliver and persist:
 *   if (result.shouldNotify) {
 *     await NotificationEngine.sendUsageThreshold(result)
 *     await persistNotifiedThresholds(result.updatedNotifiedThresholds)
 *   }
 */

import {
  THRESHOLD_SEVERITY_MAP,
  UsageNotificationAction,
  type UsageNotificationContext,
  type UsageNotificationPayload,
  type UsageNotificationResult,
  UsagePeriodKind,
  UsageResource,
  UsageThreshold,
} from './usage-notification-types'
import { UsageThresholdPolicy } from './usage-threshold-policy'

// ---------------------------------------------------------------------------
// UsageNotificationEngine
// ---------------------------------------------------------------------------

export const UsageNotificationEngine = {
  /**
   * Evaluate whether a usage threshold notification should be sent.
   *
   * Returns { shouldNotify: false } when:
   *   - The plan is unlimited (limit = -1)
   *   - No new threshold has been crossed
   *   - All crossed thresholds have already been notified this period
   *
   * Returns { shouldNotify: true, ... } with full content when a previously
   * unnotified threshold has been reached.
   *
   * Deduplication: a threshold fires at most once per periodKey. The caller
   * loads alreadyNotifiedThresholds from storage before calling evaluate(),
   * and persists result.updatedNotifiedThresholds afterwards.
   */
  evaluate(context: UsageNotificationContext): UsageNotificationResult {
    const { resource, currentUsage, limit, periodKind, periodKey, alreadyNotifiedThresholds } = context

    // Unlimited plans never generate usage notifications
    if (limit === -1) return { shouldNotify: false }

    const percentUsed = UsageThresholdPolicy.computePercent(currentUsage, limit)
    if (percentUsed === null) return { shouldNotify: false }

    // Find the lowest threshold that has been reached but not yet notified.
    // We use lowest-first so that if a user jumped from 0 → 100 in one step,
    // they see the 50% notification first (the next evaluate() call catches 80%,
    // then 90%, then 100% as the caller re-evaluates on each subsequent event).
    const threshold = UsageThresholdPolicy.findFirstUnnotifiedThreshold(percentUsed, alreadyNotifiedThresholds)

    if (threshold === null) return { shouldNotify: false }

    const severity = THRESHOLD_SEVERITY_MAP[threshold]
    const { title, message } = UsageNotificationEngine._buildContent(resource, periodKind, currentUsage, limit, percentUsed, threshold)
    const actions = UsageNotificationEngine._buildActions(resource, periodKind, threshold)

    const payload: UsageNotificationPayload = {
      resource,
      currentUsage,
      limit,
      percentUsed,
      threshold,
      severity,
      periodKind,
      periodKey,
      actions,
    }

    const updatedNotifiedThresholds = new Set(alreadyNotifiedThresholds)
    updatedNotifiedThresholds.add(threshold)

    return {
      shouldNotify: true,
      threshold,
      severity,
      percentUsed,
      title,
      message,
      payload,
      updatedNotifiedThresholds,
    }
  },

  // ---------------------------------------------------------------------------
  // _buildContent
  // Produces context-appropriate title + message copy.
  // Trial messaging explicitly calls out the transaction count condition.
  // Paid / credit messaging uses generic billing language.
  // ---------------------------------------------------------------------------
  _buildContent(
    resource: UsageResource,
    periodKind: UsagePeriodKind,
    currentUsage: number,
    limit: number,
    percentUsed: number,
    threshold: UsageThreshold,
  ): { title: string; message: string } {
    if (resource === UsageResource.TRANSACTIONS) {
      return UsageNotificationEngine._buildTxContent(periodKind, currentUsage, limit, percentUsed, threshold)
    }
    if (resource === UsageResource.CREDITS) {
      return UsageNotificationEngine._buildCreditContent(periodKind, currentUsage, limit, percentUsed, threshold)
    }
    // Fallback for future resources — generic copy
    return UsageNotificationEngine._buildGenericContent(resource, percentUsed, threshold)
  },

  _buildTxContent(
    periodKind: UsagePeriodKind,
    currentUsage: number,
    limit: number,
    _percentUsed: number,
    threshold: UsageThreshold,
  ): { title: string; message: string } {
    const used = currentUsage.toLocaleString()
    const total = limit.toLocaleString()

    if (periodKind === UsagePeriodKind.TRIAL) {
      switch (threshold) {
        case UsageThreshold.FIFTY:
          return {
            title: 'Halfway through your trial',
            message: `You're halfway through your trial usage. You've used ${used} of your ${total} included transactions.`,
          }
        case UsageThreshold.EIGHTY:
          return {
            title: 'Getting close to your trial limit',
            message: `You're getting close to your trial limit. You've used ${used} of your ${total} included transactions.`,
          }
        case UsageThreshold.NINETY:
          return {
            title: 'Trial almost complete',
            message: `Your trial is almost complete. You've used ${used} of your ${total} included transactions.`,
          }
        default:
          // UsageThreshold.HUNDRED
          return {
            title: "You've completed your StartPOS trial",
            message: `You've processed ${used} transactions and experienced StartPOS. Choose a plan to continue using StartPOS.`,
          }
      }
    }

    // MONTHLY (paid subscription)
    switch (threshold) {
      case UsageThreshold.FIFTY:
        return {
          title: 'Halfway through your monthly transactions',
          message: `You've used ${used} of your ${total} included transactions this billing period.`,
        }
      case UsageThreshold.EIGHTY:
        return {
          title: 'Approaching your monthly transaction allowance',
          message: `You're approaching your monthly transaction allowance. You've used ${used} of ${total} transactions.`,
        }
      case UsageThreshold.NINETY:
        return {
          title: 'Close to your monthly transaction allowance',
          message: `You're close to your monthly transaction allowance. You've used ${used} of ${total} transactions.`,
        }
      default:
        // UsageThreshold.HUNDRED
        return {
          title: 'Monthly transaction allowance reached',
          message: `You've used all ${total} transactions included in your plan for this billing period. Upgrade your plan or add a transaction top-up to continue.`,
        }
    }
  },
  _buildCreditContent(
    periodKind: UsagePeriodKind,
    currentUsage: number,
    limit: number,
    percentUsed: number,
    threshold: UsageThreshold,
  ): { title: string; message: string } {
    const remaining = Math.max(0, limit - currentUsage).toLocaleString()
    const total = limit.toLocaleString()
    const pct = percentUsed

    const periodLabel = periodKind === UsagePeriodKind.MONTHLY ? ' monthly' : ''

    switch (threshold) {
      case UsageThreshold.FIFTY:
        return {
          title: `${pct}% of your credits used`,
          message: `You've used ${pct}% of your${periodLabel} credits. ${remaining} credits remaining.`,
        }
      case UsageThreshold.EIGHTY:
        return {
          title: 'Running low on credits',
          message: `You've used 80% of your${periodLabel} credits. Consider purchasing additional credits or upgrading your plan.`,
        }
      case UsageThreshold.NINETY:
        return {
          title: 'Credits almost exhausted',
          message: `You've used 90% of your${periodLabel} credits. Only ${remaining} credits remain — top up soon to avoid checkout interruptions.`,
        }
      default:
        // UsageThreshold.HUNDRED
        return {
          title: 'Credits exhausted',
          message: `You've used all ${total} of your${periodLabel} credits. Purchase more credits to continue processing transactions.`,
        }
    }
  },
  _buildGenericContent(resource: UsageResource, percentUsed: number, threshold: UsageThreshold): { title: string; message: string } {
    const label = resource.toLowerCase().replace('_', ' ')
    return {
      title: `${percentUsed}% of your ${label} used`,
      message:
        threshold === UsageThreshold.HUNDRED
          ? `You've reached the limit for ${label} this period.`
          : `You've used ${percentUsed}% of your ${label} allowance for this period.`,
    }
  },

  // ---------------------------------------------------------------------------
  // _buildActions
  // Returns the appropriate CTA slugs for the threshold + context combination.
  // ---------------------------------------------------------------------------
  _buildActions(resource: UsageResource, periodKind: UsagePeriodKind, threshold: UsageThreshold): UsageNotificationAction[] {
    // Trial — conversion-oriented CTAs
    if (periodKind === UsagePeriodKind.TRIAL) {
      if (threshold === UsageThreshold.FIFTY || threshold === UsageThreshold.EIGHTY) {
        return [UsageNotificationAction.VIEW_PLANS, UsageNotificationAction.TALK_TO_US]
      }
      // 90% and 100% — more urgent conversion
      return [UsageNotificationAction.CHOOSE_PLAN, UsageNotificationAction.TALK_TO_US]
    }

    // Paid TX — upsell / top-up
    if (resource === UsageResource.TRANSACTIONS) {
      if (threshold === UsageThreshold.HUNDRED) {
        return [UsageNotificationAction.UPGRADE_PLAN, UsageNotificationAction.BUY_TX_TOPUP]
      }
      return [UsageNotificationAction.UPGRADE_PLAN]
    }

    // Credits
    if (resource === UsageResource.CREDITS) {
      return [UsageNotificationAction.BUY_CREDITS]
    }

    return []
  },
}
