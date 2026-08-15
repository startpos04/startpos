/**
 * usage-notification-types.ts
 *
 * Shared plain-object types for the usage notification domain.
 * No infrastructure dependencies — safe to import from any layer.
 *
 * Design principle:
 *   The same types power Trial TX notifications, paid subscription TX
 *   notifications, credit notifications, and any future metered resource.
 *   Nothing here is coupled to trial logic, subscription logic, or payment
 *   provider logic.
 */

// ---------------------------------------------------------------------------
// UsageResource
// Identifies what is being measured. Add new metered resources here as the
// platform grows — the notification engine never branches on plan type.
// ---------------------------------------------------------------------------
export const UsageResource = {
  TRANSACTIONS: 'TRANSACTIONS',
  CREDITS: 'CREDITS',
} as const

export type UsageResource = (typeof UsageResource)[keyof typeof UsageResource]

// ---------------------------------------------------------------------------
// UsageThreshold
// The four standard notification percentages.
// Represented as a const-object so callers can reference them by name rather
// than scattering magic numbers through the codebase.
// ---------------------------------------------------------------------------
export const UsageThreshold = {
  FIFTY: 50,
  EIGHTY: 80,
  NINETY: 90,
  HUNDRED: 100,
} as const

export type UsageThreshold = (typeof UsageThreshold)[keyof typeof UsageThreshold]

/** Ordered list of all thresholds, ascending. Used for crossing detection. */
export const USAGE_THRESHOLDS_ASC: UsageThreshold[] = [UsageThreshold.FIFTY, UsageThreshold.EIGHTY, UsageThreshold.NINETY, UsageThreshold.HUNDRED]

// ---------------------------------------------------------------------------
// ThresholdSeverity
// Maps each threshold to a UI-level severity. Callers use this to choose
// banner variant, notification priority, or toast color — without hardcoding
// the mapping at every call site.
// ---------------------------------------------------------------------------
export const ThresholdSeverity = {
  info: 'info',
  warning: 'warning',
  critical: 'critical',
  limit: 'limit',
} as const

export type ThresholdSeverity = (typeof ThresholdSeverity)[keyof typeof ThresholdSeverity]

export const THRESHOLD_SEVERITY_MAP: Record<UsageThreshold, ThresholdSeverity> = {
  [UsageThreshold.FIFTY]: ThresholdSeverity.info,
  [UsageThreshold.EIGHTY]: ThresholdSeverity.warning,
  [UsageThreshold.NINETY]: ThresholdSeverity.critical,
  [UsageThreshold.HUNDRED]: ThresholdSeverity.limit,
}

// ---------------------------------------------------------------------------
// UsagePeriodKind
// Identifies the lifecycle of the usage period so the notification engine
// can render context-appropriate messaging without knowing subscription
// internals.
//   TRIAL   → single-period, ends at 500 TX or 30 days (whichever first)
//   MONTHLY → resets each billing cycle
//   CREDITS → resets when new credits are purchased/granted
// ---------------------------------------------------------------------------
export const UsagePeriodKind = {
  TRIAL: 'TRIAL',
  MONTHLY: 'MONTHLY',
  CREDITS: 'CREDITS',
} as const

export type UsagePeriodKind = (typeof UsagePeriodKind)[keyof typeof UsagePeriodKind]

// ---------------------------------------------------------------------------
// UsageNotificationContext
// Plain DTO the Application Layer assembles and passes to
// UsageNotificationEngine.evaluate(). The engine only cares about these
// numbers — it never reads a subscription or credit record directly.
// ---------------------------------------------------------------------------
export type UsageNotificationContext = {
  /** What resource is being measured */
  resource: UsageResource

  /** Current usage count (e.g. txCount, or creditsConsumed) */
  currentUsage: number

  /**
   * Maximum allowance for this period.
   * -1 = unlimited (engine returns no notification for unlimited plans).
   */
  limit: number

  /**
   * The usage period kind — drives messaging context (trial vs monthly vs credits).
   */
  periodKind: UsagePeriodKind

  /**
   * A stable string key that uniquely identifies this usage period for this
   * business. Used for deduplication — the same key across calls for the same
   * period ensures a given threshold fires at most once.
   *
   * Convention:
   *   TRIAL:   `trial:{businessId}`
   *   MONTHLY: `monthly:{businessId}:{billingPeriodStart.toISOString()}`
   *   CREDITS: `credits:{businessId}:{creditPeriodKey}` (e.g. the grant date)
   *
   * The Application Layer is responsible for assembling this key using
   * UsageThresholdPolicy.buildPeriodKey() helpers.
   */
  periodKey: string

  /**
   * Set of threshold percentages that have already been notified for this
   * period. The Application Layer loads this from persistent storage before
   * calling evaluate(), and persists the returned updatedNotifiedThresholds
   * afterwards.
   *
   * Represented as a Set<UsageThreshold> for O(1) membership checks.
   */
  alreadyNotifiedThresholds: ReadonlySet<UsageThreshold>
}

// ---------------------------------------------------------------------------
// UsageNotificationResult
// Returned by UsageNotificationEngine.evaluate(). The Application Layer
// acts on this without the engine ever touching infrastructure.
// ---------------------------------------------------------------------------
export type UsageNotificationResult =
  | {
      /** No threshold was crossed — nothing to notify */
      shouldNotify: false
    }
  | {
      shouldNotify: true
      /** The threshold that was just crossed (triggers the notification) */
      threshold: UsageThreshold
      /** UI severity level derived from the threshold */
      severity: ThresholdSeverity
      /** 0–100, rounded */
      percentUsed: number
      /** Human-readable notification title */
      title: string
      /** Human-readable notification body, appropriate to context */
      message: string
      /** Structured payload for frontend rendering and CTA routing */
      payload: UsageNotificationPayload
      /**
       * Updated set to persist — always a superset of alreadyNotifiedThresholds.
       * Application Layer should write this back to storage after notifying.
       */
      updatedNotifiedThresholds: ReadonlySet<UsageThreshold>
    }

// ---------------------------------------------------------------------------
// UsageNotificationPayload
// Machine-readable context attached to the Notification.metadata field.
// The frontend reads this to render progress bars, CTAs, and contextual hints.
// ---------------------------------------------------------------------------
export type UsageNotificationPayload = {
  resource: UsageResource
  currentUsage: number
  limit: number
  percentUsed: number
  threshold: UsageThreshold
  severity: ThresholdSeverity
  periodKind: UsagePeriodKind
  periodKey: string
  /** Suggested CTA slugs — frontend maps these to routes/modals */
  actions: UsageNotificationAction[]
}

// ---------------------------------------------------------------------------
// UsageNotificationAction
// Named CTA intent. The frontend resolves slugs to actual routes/components.
// ---------------------------------------------------------------------------
export const UsageNotificationAction = {
  VIEW_PLANS: 'VIEW_PLANS',
  TALK_TO_US: 'TALK_TO_US',
  CHOOSE_PLAN: 'CHOOSE_PLAN',
  UPGRADE_PLAN: 'UPGRADE_PLAN',
  BUY_TX_TOPUP: 'BUY_TX_TOPUP',
  BUY_CREDITS: 'BUY_CREDITS',
} as const

export type UsageNotificationAction = (typeof UsageNotificationAction)[keyof typeof UsageNotificationAction]
