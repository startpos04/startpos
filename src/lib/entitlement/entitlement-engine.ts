/**
 * entitlement-engine.ts
 *
 * Core entitlement evaluation engine. Pure business logic — no side effects,
 * no infrastructure dependencies, no framework imports.
 *
 * Follows the same architectural contract as TaxEngine and CostingEngine:
 *   Infrastructure fetches the data → Engine evaluates the rules → Infrastructure acts on the result.
 *
 * Evaluation order (per ADR-004 and master plan §2.10):
 *   1. SUSPENDED or LONG_TERM_INACTIVE?          → block all operational features
 *   2. EXPIRED (past grace period)?              → block all operational features
 *   3. EntitlementOverride for this business+key? → honor it (can grant or revoke)
 *   4. Plan includes this feature key?            → proceed if yes
 *   5. Per-feature usage limit?                   → check against currentUsage
 *   6. TX allowance exhausted?                    → check txRemaining for COMPLETE_CHECKOUT
 *   7. Prepaid credit balance zero?               → check creditBalance for COMPLETE_CHECKOUT
 *   8. → GRANTED
 *
 * Usage:
 *   const result = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
 *   if (!result.granted) throw new Error(result.reason)
 */

import { type CapabilityKey, OPERATIONAL_CAPABILITIES } from './capability-keys'
import { EntitlementCode, type EntitlementContext, type EntitlementResult, SubscriptionStatus } from './entitlement-types'

// ---------------------------------------------------------------------------
// EntitlementEngine
// ---------------------------------------------------------------------------

export const EntitlementEngine = {
  /**
   * Evaluates whether the business described by `context` is allowed to
   * exercise the given `capability`.
   *
   * @param capability  - A CapabilityKey constant (e.g. Capabilities.COMPLETE_CHECKOUT)
   * @param context     - Assembled by the Application Layer from DB / collection reads
   * @returns EntitlementResult — check `result.granted` before proceeding
   *
   * @example
   * const result = EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
   * if (!result.granted) {
   *   throw new EntitlementError(result.code, result.reason)
   * }
   */
  check(capability: CapabilityKey, context: EntitlementContext): EntitlementResult {
    const isOperational = OPERATIONAL_CAPABILITIES.has(capability)

    // ------------------------------------------------------------------
    // Step 1: Hard blocks — SUSPENDED and LONG_TERM_INACTIVE stop everything
    // operational. Management features remain accessible.
    // ------------------------------------------------------------------
    if (context.status === SubscriptionStatus.SUSPENDED || context.status === SubscriptionStatus.LONG_TERM_INACTIVE) {
      if (isOperational) {
        const label = context.status === SubscriptionStatus.SUSPENDED ? 'Your account has been suspended.' : 'Your account is inactive.'
        return {
          granted: false,
          code: context.status === SubscriptionStatus.SUSPENDED ? EntitlementCode.SUBSCRIPTION_SUSPENDED : EntitlementCode.LONG_TERM_INACTIVE,
          reason: `${label} Please contact support or reactivate your subscription to continue.`,
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 2: EXPIRED (hard-expired, past grace period) blocks operational
    // features. Management features remain accessible in read-only mode.
    // ------------------------------------------------------------------
    if (context.status === SubscriptionStatus.EXPIRED) {
      if (isOperational) {
        return {
          granted: false,
          code: EntitlementCode.SUBSCRIPTION_EXPIRED,
          reason: 'Your subscription has expired. Upgrade your plan to continue processing transactions.',
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 3: Per-business EntitlementOverride — evaluated before plan lookup.
    // An override can both GRANT a feature not in the plan, and REVOKE one
    // that is in the plan.
    // ------------------------------------------------------------------
    const now = new Date()
    const override = context.overrides.find(o => o.featureKey === capability)

    if (override) {
      const isExpired = override.expiresAt !== null && override.expiresAt < now

      if (!isExpired) {
        if (!override.granted) {
          // Explicitly revoked by an admin override
          return {
            granted: false,
            code: EntitlementCode.OVERRIDE_REVOKED,
            reason: 'Access to this feature has been restricted on your account.',
          }
        }
        // Explicitly granted by override — skip plan check and jump to usage checks
        return EntitlementEngine._checkUsageAndQuota(capability, context)
      }
      // Expired override — fall through to plan check
    }

    // ------------------------------------------------------------------
    // Step 4: Plan feature check — does the current plan include this capability?
    // ------------------------------------------------------------------
    if (!context.planFeatures.includes(capability)) {
      return {
        granted: false,
        code: EntitlementCode.FEATURE_NOT_IN_PLAN,
        reason: 'This feature is not included in your current plan. Upgrade to access it.',
      }
    }

    // ------------------------------------------------------------------
    // Steps 5-7: Usage, quota, and credit checks
    // ------------------------------------------------------------------
    return EntitlementEngine._checkUsageAndQuota(capability, context)
  },

  // ---------------------------------------------------------------------------
  // Private: usage limit, TX allowance, and credit balance checks (Steps 5–7).
  // Extracted so the override grant path can reuse it without repeating logic.
  // ---------------------------------------------------------------------------
  _checkUsageAndQuota(capability: CapabilityKey, context: EntitlementContext): EntitlementResult {
    // ------------------------------------------------------------------
    // Step 5: Per-feature usage limit (e.g. max 5 employees on Starter)
    // Not applicable for COMPOSABLE_FEATURES (no usage limits in that model).
    // ------------------------------------------------------------------
    const usageLimit = context.usageLimits[capability] ?? null
    if (usageLimit !== null) {
      const currentCount = context.currentUsage[capability] ?? 0
      if (currentCount >= usageLimit) {
        return {
          granted: false,
          code: EntitlementCode.USAGE_LIMIT_REACHED,
          reason: `You have reached the limit of ${usageLimit} for this feature on your current plan. Upgrade to add more.`,
        }
      }
      // Grant with remaining count
      return {
        granted: true,
        code: EntitlementCode.GRANTED,
        remaining: usageLimit - currentCount,
      }
    }

    // ------------------------------------------------------------------
    // Step 6: Transaction allowance — only checked for COMPLETE_CHECKOUT
    // on MONTHLY_SUBSCRIPTION and HYBRID billing models.
    // COMPOSABLE_FEATURES subscriptions do not use TX allowance enforcement.
    // ------------------------------------------------------------------
    const isComposable = context.billingModel === 'COMPOSABLE_FEATURES'
    if (capability === 'COMPLETE_CHECKOUT' && context.txRemaining !== null && !isComposable) {
      if (context.txRemaining <= 0) {
        return {
          granted: false,
          code: EntitlementCode.TX_ALLOWANCE_EXHAUSTED,
          reason: 'You have used all transactions included in your plan for this billing period. Upgrade your plan or wait for the next period.',
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 7: Prepaid credit balance — only checked for COMPLETE_CHECKOUT
    // on PREPAID_CREDITS and HYBRID billing models.
    // ------------------------------------------------------------------
    if (capability === 'COMPLETE_CHECKOUT' && context.creditBalance !== null) {
      if (context.creditBalance <= 0) {
        return {
          granted: false,
          code: EntitlementCode.CREDIT_BALANCE_ZERO,
          reason: 'Your prepaid credit balance is zero. Purchase more credits to continue processing transactions.',
        }
      }
    }

    // ------------------------------------------------------------------
    // Step 8: GRANTED — all checks passed
    // ------------------------------------------------------------------
    return {
      granted: true,
      code: EntitlementCode.GRANTED,
      remaining: null,
    }
  },

  // ---------------------------------------------------------------------------
  // Derive the EntitlementSummary that gets embedded in the auth session.
  // Called once at session load; consumers read from authStore rather than
  // calling check() on every render.
  //
  // Logic: run check() for every known capability and collect the granted ones.
  // This is O(n) on the capability list — fine for a one-time session computation.
  // ---------------------------------------------------------------------------
  buildSummary(
    allCapabilities: CapabilityKey[],
    context: EntitlementContext,
    meta?: {
      trialEndsAt?: Date | null
      currentPeriodEnd?: Date | null
      billingModel?: import('./entitlement-types').BillingModelDomain | null
    },
  ): {
    status: EntitlementContext['status']
    capabilities: CapabilityKey[]
    txRemaining: number | null
    creditBalance: number | null
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    billingModel: import('./entitlement-types').BillingModelDomain | null
  } {
    const granted: CapabilityKey[] = []

    for (const cap of allCapabilities) {
      const result = EntitlementEngine.check(cap, context)
      if (result.granted) {
        granted.push(cap)
      }
    }

    return {
      status: context.status,
      capabilities: granted,
      txRemaining: context.txRemaining,
      creditBalance: context.creditBalance,
      trialEndsAt: meta?.trialEndsAt ? meta.trialEndsAt.toISOString() : null,
      currentPeriodEnd: meta?.currentPeriodEnd ? meta.currentPeriodEnd.toISOString() : null,
      billingModel: meta?.billingModel ?? null,
    }
  },

  // ---------------------------------------------------------------------------
  // Helper: builds a permissive context for businesses that have no subscription
  // record yet (development, seeding, or first-time onboarding before Phase 3).
  // All features granted, no usage limits, ACTIVE status.
  // ---------------------------------------------------------------------------
  buildOpenContext(planFeatures: CapabilityKey[]): EntitlementContext {
    return {
      status: SubscriptionStatus.ACTIVE,
      billingModel: 'MONTHLY_SUBSCRIPTION',
      planFeatures,
      usageLimits: {},
      currentUsage: {},
      txRemaining: null,
      overrides: [],
      creditBalance: null,
    }
  },
}
