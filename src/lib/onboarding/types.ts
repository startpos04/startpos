/**
 * types.ts — Onboarding & BOS (Business Operating System) type definitions
 *
 * This is the stable contract between:
 *   - The adaptive survey (SurveyInterpreter)
 *   - The capability registry (CapabilityResolver)
 *   - The configuration engine (ConfigurationEngine)
 *   - The profile classifier (ProfileClassifier)
 *   - The business intelligence engine (Phase 2+)
 *
 * Design constraints:
 *   - BusinessCharacteristics fields are factual ("sellsPhysicalGoods") not
 *     prescriptive ("needsInventory") — never feature flags or config keys.
 *   - Safe defaults produce the most minimal configuration possible.
 *   - No capability keys, config keys, or module names in this file.
 *   - All engines take BusinessCharacteristics. No intermediate snapshot type.
 *
 * Principal Architect Review fixes applied:
 *   R2 — CharacteristicsSnapshot removed; engines take BusinessCharacteristics directly.
 *   R6 — rollbackOutputs field added to CapabilityDefinition.
 *   P2-3 — suggestPlan moved out of ConfigurationEngine into PlanAdvisor.
 *   P2-4 — displayZone replaced by importance in recommendations.
 */

// ---------------------------------------------------------------------------
// BusinessCharacteristics — the stable API boundary
// ---------------------------------------------------------------------------

/**
 * The single stable contract between the survey and every downstream module.
 * The survey produces it. Capabilities consume it. Neither side knows about
 * the other's internals.
 *
 * Fields are factual. They describe the business as observable reality,
 * not as feature flags.
 *
 * IMPORTANT: Rename nothing in this type casually. It is the public API for
 * every engine in this codebase. Adding fields is safe. Renaming or removing
 * requires a migration of every consumer.
 */
export type BusinessCharacteristics = {
  // ── Scale ──────────────────────────────────────────────────────────────────
  dailyTransactionVolume: 'minimal' | 'low' | 'medium' | 'high'
  teamSize: 'solo' | 'small' | 'medium' | 'large'
  locationCount: 'one' | 'multiple'

  // ── What is sold ───────────────────────────────────────────────────────────
  sellsPhysicalGoods: boolean
  sellsPreparedFood: boolean
  sellsServices: boolean
  sellsRawMaterials: boolean
  catalogueSize: 'tiny' | 'small' | 'medium' | 'large'
  hasProductVariants: boolean
  hasProductComponents: boolean
  hasPerishables: boolean

  // ── Sales process ──────────────────────────────────────────────────────────
  paymentTiming: 'immediate' | 'deferred' | 'mixed'
  requiresTableManagement: boolean
  hasOrderCustomization: boolean
  offersDelivery: boolean

  // ── Inventory ──────────────────────────────────────────────────────────────
  tracksInventory: boolean
  inventoryCriticality: 'none' | 'relaxed' | 'standard' | 'strict'
  hasMultipleStockLocations: boolean
  usesSuppliers: boolean
  requiresGoodsReceipt: boolean
  hasRegularWaste: boolean

  // ── Team and operations ────────────────────────────────────────────────────
  hasRoleSeparation: boolean
  requiresApprovals: boolean
  usesOperationalTasks: boolean

  // ── Finance and compliance ─────────────────────────────────────────────────
  handlesCash: boolean
  reconcilesCash: boolean
  isVatRegistered: boolean
  taxDisplayMode: 'inclusive' | 'exclusive' | 'mixed'
  requiresOfficialReceipts: boolean
  hasCorporateBuyers: boolean

  // ── Customers ──────────────────────────────────────────────────────────────
  tracksCustomers: boolean
  hasLoyaltyIntent: boolean

  // ── Growth ─────────────────────────────────────────────────────────────────
  plansExpansion: boolean
  needsExternalIntegrations: boolean

  // ── Intent fields (Phase 3b) ───────────────────────────────────────────────
  // These are not derived from observation — they are stated intent from the
  // survey or corrected via the Business Profile editor.
  // They boost relevant recommendation scores without forcing enablement.
  intentToAddMoreStaff: boolean
  intentToTrackInventory: boolean
  intentToManageSuppliers: boolean
  intentToOfferDelivery: boolean
  intentToOpenMoreLocations: boolean
  intentToIntegrateExternalSystems: boolean

  // ── Batch preparation (Phase 6+) ────────────────────────────────────────────
  preparesBatches: boolean // Prepares items in batches (with or without recipes)
  preparesBatchesWithRecipes: boolean // Uses recipes/ingredients for batch prep
}

// ---------------------------------------------------------------------------
// Survey types
// ---------------------------------------------------------------------------

/**
 * Raw survey answers keyed by question ID.
 * Each value is a string or string[] (multi-select questions).
 * The SurveyInterpreter translates these into BusinessCharacteristics.
 */
export type SurveyAnswers = {
  // Q1: What does your business primarily do? (multi-select)
  q1_business_type?: string[]

  // Q2: How many people work here, including yourself?
  q2_team_size?: string

  // Q3: When a customer pays, how does it usually work?
  q3_payment_timing?: string

  // Q3a: How do customers receive what they ordered? (if deferred/mixed)
  q3a_fulfillment?: string[]

  // Q3b: Do customers customize or add extras to orders?
  q3b_order_customization?: string

  // Q4: Do you track how much stock you have?
  q4_inventory_tracking?: string

  // Q4a: How do you replenish stock when it runs low?
  q4a_restock_method?: string

  // Q4b: Do you store stock in different areas or rooms?
  q4b_stock_locations?: string

  // Q4c: Do any of your products have an expiry date?
  q4c_expiry?: string

  // Q5: Do different staff members need different levels of access?
  q5_role_separation?: string

  // Q5a: Do certain actions need manager approval?
  q5a_approvals?: string

  // Q6: Is your business registered for VAT?
  q6_vat_registered?: string

  // Q6a: When you show prices, is tax already included?
  q6a_tax_display?: string

  // Q6b: Do you issue official receipts with regulatory numbers?
  q6b_official_receipts?: string

  // Q7: Do you operate from one place, or multiple?
  q7_location_count?: string

  // Q8: Do you plan to open more locations in the next year?
  q8_expansion_plans?: string

  // Q9: Do you reconcile your cash at the end of each shift?
  q9_cash_reconciliation?: string

  // Q10: Do you assign tasks to your staff (stock counts, shelf refills, etc.)?
  q10_operational_tasks?: string

  // Q11: Do you prepare products in batches ahead of sale?
  q11_batch_preparation?: string
}

// Q1 answer values (multi-select)
export const Q1_OPTIONS = {
  PHYSICAL_GOODS: 'physical_goods',
  FOOD_BEVERAGE: 'food_beverage',
  SERVICES: 'services',
  RAW_MATERIALS: 'raw_materials',
} as const

// Q2 answer values
export const Q2_OPTIONS = {
  JUST_ME: 'just_me',
  TWO_TO_FIVE: '2_to_5',
  SIX_TO_TWENTY: '6_to_20',
  MORE_THAN_TWENTY: 'more_than_20',
} as const

// Q3 answer values
export const Q3_OPTIONS = {
  IMMEDIATE: 'pay_right_away',
  DEFERRED: 'order_then_pay',
  MIXED: 'both',
} as const

// Q3a answer values (multi-select)
export const Q3A_OPTIONS = {
  DINE_IN: 'dine_in',
  TAKEOUT: 'takeout',
  DELIVERY: 'delivery',
} as const

// Q3b answer values
export const Q3B_OPTIONS = {
  OFTEN: 'often',
  OCCASIONALLY: 'occasionally',
  NEVER: 'never',
} as const

// Q4 answer values
export const Q4_OPTIONS = {
  YES_STRICT: 'yes_strict',
  YES_RELAXED: 'yes_relaxed',
  PERIODIC: 'periodic',
  NO: 'no',
} as const

// Q4a answer values
export const Q4A_OPTIONS = {
  FORMAL_SUPPLIERS: 'formal_suppliers',
  INFORMAL: 'informal',
} as const

// Q4b answer values
export const Q4B_OPTIONS = {
  YES: 'yes',
  NO: 'no',
} as const

// Q4c answer values
export const Q4C_OPTIONS = {
  YES_MANY: 'yes_many',
  SOME: 'some',
  NO: 'no',
} as const

// Q5 answer values
export const Q5_OPTIONS = {
  YES: 'yes',
  LATER: 'later',
  NO: 'no',
} as const

// Q5a answer values
export const Q5A_OPTIONS = {
  YES_STRICT: 'yes_strict',
  YES_SOME: 'yes_some',
  NO: 'no',
} as const

// Q6 answer values
export const Q6_OPTIONS = {
  YES: 'yes',
  NO: 'no',
  UNSURE: 'unsure',
} as const

// Q6a answer values
export const Q6A_OPTIONS = {
  INCLUSIVE: 'inclusive',
  EXCLUSIVE: 'exclusive',
} as const

// Q6b answer values
export const Q6B_OPTIONS = {
  BIR_COMPLIANT: 'bir_compliant',
  INFORMAL: 'informal',
  NONE: 'none',
} as const

// Q7 answer values
export const Q7_OPTIONS = {
  ONE: 'one',
  MULTIPLE: 'multiple',
} as const

// Q8 answer values
export const Q8_OPTIONS = {
  YES: 'yes',
  POSSIBLY: 'possibly',
  NO: 'no',
} as const

// Q9 answer values
export const Q9_OPTIONS = {
  YES: 'yes',
  NO: 'no',
} as const

// Q10 answer values
export const Q10_OPTIONS = {
  YES: 'yes',
  NO: 'no',
} as const

// Q11 answer values
export const Q11_OPTIONS = {
  YES_RECIPES: 'yes_recipes',
  YES_NO_RECIPES: 'yes_no_recipes',
  NO: 'no',
} as const

// ---------------------------------------------------------------------------
// Operational profiles
// ---------------------------------------------------------------------------

/**
 * Named archetypes that emerge from BusinessCharacteristics.
 * The ProfileClassifier assigns one after every recalculation.
 * Users never select a profile — the system classifies them.
 *
 * Classification priority order (first match wins):
 * MULTI_BRANCH_ENTERPRISE → FOOD_AND_BEVERAGE → WHOLESALE_DISTRIBUTION →
 * SERVICE_BUSINESS → INVENTORY_INTENSIVE → QUICK_SERVICE → SIMPLE_RETAILER
 * → LITE_POS → GENERAL
 */
export type OperationalProfile =
  | 'LITE_POS'
  | 'SIMPLE_RETAILER'
  | 'FOOD_AND_BEVERAGE'
  | 'SERVICE_BUSINESS'
  | 'WHOLESALE_DISTRIBUTION'
  | 'QUICK_SERVICE'
  | 'INVENTORY_INTENSIVE'
  | 'MULTI_BRANCH_ENTERPRISE'
  | 'GENERAL'

// ---------------------------------------------------------------------------
// Capability types
// ---------------------------------------------------------------------------

/**
 * A single config key=value pair that a capability writes when it is enabled.
 * Maps to the SystemConfig table at the BUSINESS scope.
 */
export type CapabilityOutput = {
  key: string
  value: string
}

/**
 * Capability lifecycle state as persisted in BusinessCapabilityState.
 */
export type CapabilityLifecycleState = 'HIDDEN' | 'RECOMMENDED' | 'ENABLED' | 'CONFIGURED' | 'PAUSED' | 'DEPRECATED'

/**
 * The result of evaluating a capability against a business's characteristics.
 */
export type ResolvedCapability = {
  id: string
  state: 'ENABLED' | 'DEFERRED' | 'NOT_APPLICABLE'
  confidence: number
  outputs: CapabilityOutput[]
  rollbackOutputs: CapabilityOutput[]
}

/**
 * A single capability definition in the CAPABILITY_REGISTRY.
 *
 * Every capability is self-describing. Adding a new capability = adding one
 * entry here. Nothing else changes in the engine.
 *
 * Key design notes:
 *   - `required` is the gate: if false, the capability is NOT_APPLICABLE.
 *   - `boosters` are confidence signals: average determines ENABLED vs DEFERRED.
 *   - `threshold` is the minimum average booster confidence to auto-enable.
 *   - `outputs` are the config writes applied when the capability is enabled.
 *   - `rollbackOutputs` are the config writes applied when the capability is
 *     paused or deprecated (R6 requirement from Principal Architect Review).
 *
 * Removed per Principal Architect Review:
 *   - `canBeSelfServed` — all current capabilities are self-served
 *   - `aiHints` — speculative, no ML team exists
 *   - `upgradePath`, `migrationNotes` — deferred until first use
 *   - `learningCurve` (4 values) replaced by `isComplex` (boolean)
 *   - `softDependencies` renamed to `relatedCapabilities` with clear semantics
 *   - `displayZone` replaced by `importance` in recommendation types
 */
export type CapabilityDefinition = {
  /** Matches CapabilityKey or ConfigKey; stable identifier. */
  id: string

  /** Human-readable name — developer tooling only. */
  label: string

  /** Plain-language business benefit shown in recommendation cards. */
  description: string

  /** Grouping category for UI and recommendation scoring. */
  category: CapabilityCategory

  // ── Evaluation ─────────────────────────────────────────────────────────────

  /**
   * Gate function. If false, the capability is NOT_APPLICABLE — not recommended,
   * not enabled, not shown. The business does not need it at all.
   */
  required: (c: BusinessCharacteristics) => boolean

  /**
   * Confidence signals. Each returns 0.0–1.0. The average determines whether
   * the capability is ENABLED (≥ threshold) or DEFERRED (< threshold).
   * If no boosters are defined, confidence is 1.0 (binary — required gate suffices).
   */
  boosters: Array<{
    label: string
    signal: (c: BusinessCharacteristics) => number
  }>

  /**
   * Minimum average booster confidence to auto-enable.
   * Below this threshold, the capability is DEFERRED (queued for recommendation).
   * Capabilities with no boosters use threshold 0 (always ENABLED when required).
   */
  threshold: number

  // ── Outputs ────────────────────────────────────────────────────────────────

  /**
   * Config writes applied when the capability is ENABLED.
   * Called by ConfigurationEngine and CapabilityControl.enable().
   */
  outputs: (c: BusinessCharacteristics) => CapabilityOutput[]

  /**
   * Config writes applied when the capability is PAUSED or DEPRECATED.
   * Typically reverses the outputs (sets keys back to false / safe defaults).
   * Required on all capabilities (R6 — Principal Architect Review).
   */
  rollbackOutputs: (c: BusinessCharacteristics) => CapabilityOutput[]

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * If true, a capability that is below threshold is queued as DEFERRED for
   * progressive activation. If false, it stays NOT_APPLICABLE.
   */
  deferrable: boolean

  /**
   * Usage signal function. Called with a business's usage summary.
   * Returns true when the capability is being actively used (ENABLED → CONFIGURED).
   * Phase 2+ only — can return false in Phase 1 implementation.
   */
  configuredSignal: (summary: BusinessUsageSummaryInput) => boolean

  // ── Metadata (Recommendation Engine) ──────────────────────────────────────

  /** Approximate minutes a user needs to set up this capability. */
  estimatedSetupMinutes: number

  /** Whether setup requires significant effort (shows a heads-up in the UI). */
  isComplex: boolean

  /** "What you'll gain" — shown in recommendation cards. */
  businessValue: string

  /**
   * Capability IDs that must be ENABLED before this one can be enabled.
   * Enforced at enablement time.
   */
  hardDependencies: string[]

  /**
   * Capability IDs that enhance this one when co-enabled.
   * Used for recommendation co-location in the UI.
   */
  relatedCapabilities: string[]

  /** Capability IDs that cannot coexist with this one. */
  conflicts: string[]

  /** Minimum subscription plan required to enable this capability. */
  minimumPlan: 'any' | 'Basic' | 'Premium' | 'Enterprise'

  /**
   * Recommendation scoring function. Returns 0.0–1.0.
   * Higher = more strongly recommended.
   */
  recommendationScore: (c: BusinessCharacteristics) => number

  // ── Observability (Phase 6) ────────────────────────────────────────────────

  /**
   * Tracking events this capability should emit at the points listed.
   * Used by Phase 6 to audit whether all declared events are actually wired.
   *
   * Each entry documents:
   *   - event: the BusinessEventType emitted
   *   - when:  plain-language description of the trigger point
   *
   * These are declarations only — the engine does not emit automatically.
   * Emission happens in the relevant server function or job.
   * Phase 6 uses this list to audit coverage.
   */
  trackingEvents: Array<{
    event: string
    when: string
  }>
}

/**
 * Grouping category for capabilities.
 * Used for UI grouping and recommendation scoring weights.
 */
export type CapabilityCategory =
  | 'SALES'
  | 'INVENTORY'
  | 'PROCUREMENT'
  | 'OPERATIONS'
  | 'CRM'
  | 'COMPLIANCE'
  | 'FINANCE'
  | 'REPORTING'
  | 'MULTI_BRANCH'
  | 'PLATFORM'

// ---------------------------------------------------------------------------
// Registry validation
// ---------------------------------------------------------------------------

export type RegistryValidationError = {
  capabilityId: string
  message: string
}

// ---------------------------------------------------------------------------
// Business configuration output
// ---------------------------------------------------------------------------

/**
 * The final configuration object produced by ConfigurationEngine.
 * This is what complete-registration.ts persists to the database.
 */
export type BusinessConfiguration = {
  /** System config key=value pairs to write to SystemConfig table. */
  systemConfigs: CapabilityOutput[]

  /** Capability IDs that are immediately ENABLED for this business. */
  enabledCapabilities: string[]

  /**
   * Capability IDs that are DEFERRED — below threshold but applicable.
   * Written to Business.deferredCapabilities for progressive activation.
   */
  deferredCapabilities: string[]

  /** The classified operational profile. */
  operationalProfile: OperationalProfile
}

// ---------------------------------------------------------------------------
// Plan advisor output
// ---------------------------------------------------------------------------

export type SuggestedPlan = 'Basic' | 'Premium' | 'Enterprise'

// ---------------------------------------------------------------------------
// Business usage summary (minimal interface for Phase 1)
// Full implementation added in Phase 2 when BusinessUsageSummary table exists.
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the usage summary used by configuredSignal functions.
 * Phase 2 will populate this from the BusinessUsageSummary table.
 * Phase 1 implementations always return false from configuredSignal.
 */
export type BusinessUsageSummaryInput = {
  supplierCount?: number
  purchaseOrderCount?: number
  productionOrderCount?: number
  employeeCount?: number
  branchCount?: number
  customerCount?: number
  inventoryAdjustmentCount?: number
  reconciliationCount?: number
  approvalWorkflowUsageCount?: number
  componentRecipeCount?: number
  wasteRecordCount?: number
  transactionsLast30Days?: number
  cashPaymentCount?: number
}
