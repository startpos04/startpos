/**
 * entitlement-types.ts
 *
 * All shared types for the EntitlementEngine.
 * No infrastructure dependencies — safe to import from any layer.
 *
 * Note: TypeScript enums are avoided because the project uses
 * `erasableSyntaxOnly`. All enums are expressed as `const` objects
 * with a derived union type — the same pattern used in capability-keys.ts.
 */

import type { CapabilityKey } from './capability-keys'

// ---------------------------------------------------------------------------
// EntitlementCode
// Machine-readable denial reason. Used by the UI to branch on upgrade prompts,
// warning banners, and disabled-button states without parsing strings.
// ---------------------------------------------------------------------------
export const EntitlementCode = {
  GRANTED: 'GRANTED',

  // Subscription state denials
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_SUSPENDED: 'SUBSCRIPTION_SUSPENDED',
  LONG_TERM_INACTIVE: 'LONG_TERM_INACTIVE',

  // Plan & feature denials
  FEATURE_NOT_IN_PLAN: 'FEATURE_NOT_IN_PLAN',
  OVERRIDE_REVOKED: 'OVERRIDE_REVOKED',

  // Usage & quota denials
  USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',
  TX_ALLOWANCE_EXHAUSTED: 'TX_ALLOWANCE_EXHAUSTED',
  CREDIT_BALANCE_ZERO: 'CREDIT_BALANCE_ZERO',
} as const

export type EntitlementCode = (typeof EntitlementCode)[keyof typeof EntitlementCode]

// ---------------------------------------------------------------------------
// EntitlementResult
// The output of every EntitlementEngine.check() call.
// ---------------------------------------------------------------------------
export type EntitlementResult =
  | {
      granted: true
      code: typeof EntitlementCode.GRANTED
      /** Remaining uses for usage-limited features (null = unlimited). */
      remaining: number | null
    }
  | {
      granted: false
      code: Exclude<EntitlementCode, typeof EntitlementCode.GRANTED>
      /** Human-readable reason — shown in toasts and upgrade prompts. */
      reason: string
      remaining?: never
    }

// ---------------------------------------------------------------------------
// SubscriptionStatus
// Lightweight status values used in EntitlementContext.
// The full BusinessSubscription model (with all lifecycle fields) is Phase 3.
// Defined here so the engine can reason about status without importing from
// Prisma — keeping the domain layer infrastructure-free.
// ---------------------------------------------------------------------------
export const SubscriptionStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  GRACE_PERIOD: 'GRACE_PERIOD',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  LONG_TERM_INACTIVE: 'LONG_TERM_INACTIVE',
  CANCELLED: 'CANCELLED',
} as const

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus]

// ---------------------------------------------------------------------------
// EntitlementOverrideDTO
// Plain-object representation of an EntitlementOverride record.
// Infrastructure fetches these from the DB and passes them as DTOs —
// the engine never touches Prisma types directly.
// ---------------------------------------------------------------------------
export type EntitlementOverrideDTO = {
  featureKey: string
  /** false = explicitly revoked even if the plan includes it */
  granted: boolean
  /** null = no expiry */
  expiresAt: Date | null
}

// ---------------------------------------------------------------------------
// BillingModel (domain copy — mirrors Prisma enum, no infrastructure import)
// ---------------------------------------------------------------------------
export const BillingModelDomain = {
  MONTHLY_SUBSCRIPTION: 'MONTHLY_SUBSCRIPTION',
  YEARLY_SUBSCRIPTION: 'YEARLY_SUBSCRIPTION',
  PREPAID_CREDITS: 'PREPAID_CREDITS',
  HYBRID: 'HYBRID',
  COMPOSABLE_FEATURES: 'COMPOSABLE_FEATURES',
} as const
export type BillingModelDomain = (typeof BillingModelDomain)[keyof typeof BillingModelDomain]

// ---------------------------------------------------------------------------
// EntitlementContext
// The complete data snapshot the engine needs to evaluate a capability.
// Assembled by the Application Layer from DB/collection reads;
// passed into EntitlementEngine.check() as a plain object.
// ---------------------------------------------------------------------------
export type EntitlementContext = {
  /** Current subscription status. Defaults to ACTIVE if no subscription exists yet (dev/seed mode). */
  status: SubscriptionStatus

  /**
   * The billing model for this subscription.
   * Used by EntitlementEngine to select the correct check path for COMPLETE_CHECKOUT.
   * Defaults to MONTHLY_SUBSCRIPTION for backwards compatibility.
   */
  billingModel?: BillingModelDomain

  /**
   * All capability keys the business's current plan entitles them to.
   * For COMPOSABLE_FEATURES: derived from BusinessSubscriptionFeature records.
   * For other models: derived from PlanEntitlement records.
   * Empty array = no plan assigned (blocks all operational features).
   */
  planFeatures: CapabilityKey[]

  /**
   * Per-feature usage limits from PlanEntitlement.usageLimit.
   * Key = capability key, value = max allowed units (null = unlimited).
   * Only populated for features that have a non-null usageLimit.
   * Not used for COMPOSABLE_FEATURES (no usage limits in composable model).
   */
  usageLimits: Partial<Record<CapabilityKey, number>>

  /**
   * Current usage counts per feature, for the active billing period.
   * Key = capability key, value = current count.
   * e.g. { MANAGE_EMPLOYEES: 4 } means 4 employees currently exist.
   */
  currentUsage: Partial<Record<CapabilityKey, number>>

  /**
   * Remaining transactions in the current billing period.
   * null = unlimited (plan has includedTxPerMonth = -1, or COMPOSABLE_FEATURES model).
   * 0    = exhausted; engine will deny COMPLETE_CHECKOUT for non-composable models.
   */
  txRemaining: number | null

  /**
   * Per-business feature overrides (grants or revocations).
   * Applied after plan lookup — can both add and remove features.
   */
  overrides: EntitlementOverrideDTO[]

  /**
   * Current credit balance in units (not cents).
   * null = not a prepaid plan; skip credit checks.
   * 0    = exhausted; engine will deny COMPLETE_CHECKOUT.
   */
  creditBalance: number | null
}

// ---------------------------------------------------------------------------
// EntitlementSummary
// Lightweight snapshot embedded in the auth session (authStore).
// Computed once at session load; refreshed on subscription change events.
// Used by the UI for display-time gating — full engine runs server-side.
// ---------------------------------------------------------------------------
export type EntitlementSummary = {
  status: SubscriptionStatus
  /** Granted capability keys for this session. Used for UI-level button/route gating. */
  capabilities: CapabilityKey[]
  /** null = unlimited */
  txRemaining: number | null
  /** null = not a prepaid plan */
  creditBalance: number | null
  /** ISO string of trial end date — used by SubscriptionBanner countdown. null if not in trial. */
  trialEndsAt: string | null
  /** ISO string of billing period end — used by /billing usage display. null if no active period. */
  currentPeriodEnd: string | null
  /** Active billing model — determines which payment card to show on /billing. */
  billingModel: BillingModelDomain | null
}
