/**
 * composable-features-strategy.ts
 *
 * ComposableFeaturesStrategy — SubscriptionEngine strategy for businesses
 * on the COMPOSABLE_FEATURES billing model.
 *
 * Responsibility (at checkout evaluation time):
 *   Determine whether the business's composable subscription allows a
 *   POS checkout to proceed. Unlike MONTHLY_SUBSCRIPTION (which checks a
 *   TX allowance) and PREPAID_CREDITS (which deducts credit units), the
 *   composable path checks that:
 *     1. The subscription is in an operational status
 *     2. COMPLETE_CHECKOUT is present in the business's
 *        BusinessSubscriptionFeature snapshot
 *
 * Note: This strategy is used by SubscriptionEngine for checkout-time
 * decisions. The full pricing calculation at quote time is done by
 * PricingEngine (a separate engine in billing/pricing/).
 *
 * Architectural contract:
 *   - Zero Prisma/collection/infrastructure imports.
 *   - Data arrives as plain DTOs.
 *   - Returns OperationResult — callers act on result, never catch exceptions.
 */

import type { CapabilityKey } from '@/lib/entitlement/capability-keys'
import { type OperationResult, opFail, opOk } from '@/lib/result'
import type { BillingModel } from '../types'

// ---------------------------------------------------------------------------
// ComposableSubscriptionSnapshot
// The data this strategy needs at checkout evaluation time.
// Assembled by the Application Layer from BusinessSubscriptionFeature rows.
// ---------------------------------------------------------------------------
export type ComposableSubscriptionSnapshot = {
  subscriptionId: string
  businessId: string
  billingModel: BillingModel
  /** All feature keys active on this composable subscription */
  activeFeatureKeys: CapabilityKey[]
}

// ---------------------------------------------------------------------------
// ComposableFeaturesStrategy
// ---------------------------------------------------------------------------
export const ComposableFeaturesStrategy = {
  /**
   * Check whether a given capability is active on a composable subscription.
   *
   * Unlike plan-based entitlements (which resolve from PlanEntitlement rows),
   * composable subscriptions resolve from BusinessSubscriptionFeature snapshots.
   *
   * @param capability - The capability being checked (e.g. COMPLETE_CHECKOUT)
   * @param snapshot   - Active features on the composable subscription
   */
  checkCapability(capability: CapabilityKey, snapshot: ComposableSubscriptionSnapshot): OperationResult<void> {
    if (snapshot.billingModel !== 'COMPOSABLE_FEATURES') {
      return opFail('PRECONDITION_FAILED', `ComposableFeaturesStrategy invoked for non-composable billing model: ${snapshot.billingModel}`)
    }

    const isActive = snapshot.activeFeatureKeys.includes(capability)
    if (!isActive) {
      return opFail(
        'PRECONDITION_FAILED',
        `Feature "${capability}" is not included in your composable subscription. Contact support or update your plan to add this feature.`,
      )
    }

    return opOk()
  },

  /**
   * Build the list of capability keys for EntitlementContext.planFeatures
   * from a composable subscription's active features.
   *
   * Called by the Application Layer (auth-server.ts) when assembling the
   * EntitlementContext for a COMPOSABLE_FEATURES business.
   *
   * @param snapshot - Active features on the composable subscription
   * @returns Array of CapabilityKey values to use as planFeatures
   */
  buildPlanFeatures(snapshot: ComposableSubscriptionSnapshot): CapabilityKey[] {
    return [...snapshot.activeFeatureKeys]
  },
}
