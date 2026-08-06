/**
 * types.ts — Evolution Engine shared types (Phase 2+)
 *
 * Defines:
 *   - SourcedValue<T>       — a value annotated with where it came from
 *   - CharacteristicSource  — the priority ladder for merging sources
 *   - LivingCharacteristics — internal CharacteristicsEngine representation
 *   - ObservationRule       — a single rule in the OBSERVATION_RULES registry
 *   - BusinessUsageSummaryData — the JSON blob written by the aggregation job
 *   - CharacteristicsEngineInput — everything the engine needs to compute
 *   - CharacteristicsEngineOutput — what the engine returns
 *
 * Principal Architect Review compliance:
 *   - LivingCharacteristics is internal to CharacteristicsEngine only.
 *     It is NEVER exported to other modules (CapabilityResolver, ProfileClassifier, etc.)
 *   - All downstream pure engines receive BusinessCharacteristics directly.
 *   - CharacteristicsSnapshot removed per R2.
 */

import type { BusinessCharacteristics } from '../onboarding/types'

// ---------------------------------------------------------------------------
// Source priority ladder
// ---------------------------------------------------------------------------

/**
 * Priority values for each source — higher number = higher priority.
 * When two sources disagree on the same field, the higher-priority source wins.
 *
 * ADMIN_DECISION > SYSTEM_CONFIG > USAGE_OBSERVATION > BUSINESS_EVENT > SURVEY_ANSWER > AI_INFERENCE
 */
export const CharacteristicSourcePriority = {
  AI_INFERENCE: 10,
  SURVEY_ANSWER: 20,
  BUSINESS_EVENT: 40,
  USAGE_OBSERVATION: 60,
  SYSTEM_CONFIG: 80,
  ADMIN_DECISION: 100,
} as const

export type CharacteristicSource = keyof typeof CharacteristicSourcePriority

// ---------------------------------------------------------------------------
// SourcedValue<T> — annotated field
// ---------------------------------------------------------------------------

/**
 * A characteristic value together with where it came from, how confident
 * the system is, and when it was last observed.
 *
 * Used internally by the CharacteristicsEngine.
 * Never exported to capability, resolver, or recommendation modules.
 */
export type SourcedValue<T> = {
  value: T
  source: CharacteristicSource
  /** 0.0–1.0 — how confident we are this value is correct */
  confidence: number
  observedAt: Date
  /** Plain-language explanation shown in the Business Profile editor (Phase 4) */
  evidence?: string
}

// ---------------------------------------------------------------------------
// LivingCharacteristics — internal engine representation
// ---------------------------------------------------------------------------

/**
 * Each characteristic field represented as a SourcedValue<T>.
 * Internal to CharacteristicsEngine only. Never returned or exported.
 *
 * Partial — not all fields may have been observed yet. Missing fields
 * fall back to DEFAULT_CHARACTERISTICS when projected to BusinessCharacteristics.
 */
export type LivingCharacteristics = {
  [K in keyof BusinessCharacteristics]?: SourcedValue<BusinessCharacteristics[K]>
}

// ---------------------------------------------------------------------------
// Confidence decay parameters
// ---------------------------------------------------------------------------

/**
 * Decay parameters per source type.
 * Phase 4 activates the decay sweep; Phase 2 stores these as constants only.
 *
 * graceWindowDays: confidence stays at full value for this many days
 * staleAfterDays:  confidence reaches 0 after this many days (linear decay from grace to stale)
 */
export type DecayParameters = {
  graceWindowDays: number
  staleAfterDays: number
}

export const SOURCE_DECAY_PARAMS: Record<CharacteristicSource, DecayParameters> = {
  ADMIN_DECISION: { graceWindowDays: Infinity, staleAfterDays: Infinity },
  SYSTEM_CONFIG: { graceWindowDays: Infinity, staleAfterDays: Infinity },
  USAGE_OBSERVATION: { graceWindowDays: 30, staleAfterDays: 120 },
  BUSINESS_EVENT: { graceWindowDays: 60, staleAfterDays: 180 },
  SURVEY_ANSWER: { graceWindowDays: Infinity, staleAfterDays: Infinity },
  AI_INFERENCE: { graceWindowDays: 14, staleAfterDays: 60 },
}

// ---------------------------------------------------------------------------
// BusinessUsageSummaryData — the JSON blob
// ---------------------------------------------------------------------------

/**
 * Aggregated usage counts written by the weekly summary job.
 * Stored as Json in the BusinessUsageSummary table.
 *
 * Using Json (not typed columns) means new observation rules can add new
 * counts without a schema migration — just extend this type and the aggregation job.
 *
 * Phase 2 subset: six counts needed by the six initial observation rules.
 * Additional counts are added in Phase 3b when more rules ship.
 */
export type BusinessUsageSummaryData = {
  // Phase 2 counts (required by the 6 initial observation rules)
  supplierCount?: number
  employeeCount?: number
  branchCount?: number
  customerCount?: number

  // Inventory / purchasing
  purchaseOrderCount?: number
  inventoryAdjustmentCount?: number
  componentRecipeCount?: number
  wasteRecordCount?: number

  // Finance
  reconciliationCount?: number
  approvalWorkflowUsageCount?: number
  cashPaymentCount?: number

  // Sales
  transactionsLast30Days?: number
  avgDailyTransactions?: number
  productCount?: number

  // Phase 3b additions
  deliveryOrderCount?: number
  productVariantCount?: number

  // Phase 5 additions — growth detection
  /** Transaction count from the previous 30-day window (used for rapid-growth detection) */
  transactionsPrev30Days?: number

  // Allow future additions without migration (Pa Review: no 17-column typed table)
  [key: string]: number | undefined
}

// ---------------------------------------------------------------------------
// ObservationRule — the pure data registry entry
// ---------------------------------------------------------------------------

/**
 * A single rule in the OBSERVATION_RULES registry.
 *
 * Each rule describes a condition on BusinessUsageSummaryData that, when met,
 * produces a sourced update to one BusinessCharacteristics field.
 *
 * Rules are pure data — the CharacteristicsEngine evaluates them.
 * To add a new observation, add one entry to OBSERVATION_RULES.
 * No code changes in the engine.
 */
export type ObservationRule<K extends keyof BusinessCharacteristics = keyof BusinessCharacteristics> = {
  /** Human-readable name for logging and debugging */
  label: string

  /** The BusinessCharacteristics field this rule updates */
  characteristic: K

  /** The observed value to set when the condition is met */
  value: BusinessCharacteristics[K]

  /**
   * Predicate function — returns true when the condition is met.
   * Receives the current usage summary data.
   * Pure function: no IO, no side effects.
   */
  condition: (summary: BusinessUsageSummaryData) => boolean

  /** Confidence level (0.0–1.0) assigned to this observation when it fires */
  confidence: number

  /**
   * Human-readable evidence string shown in the Business Profile editor.
   * Use {count} as a placeholder — the engine will substitute the actual value.
   */
  evidence: string
}

// ---------------------------------------------------------------------------
// CharacteristicsEngineInput — all sources the engine needs
// ---------------------------------------------------------------------------

/**
 * Everything the CharacteristicsEngine needs to compute updated characteristics.
 * Assembled by the RecalculationJob (Application Layer) from DB reads.
 * Passed as a single DTO to the pure engine function.
 */
export type CharacteristicsEngineInput = {
  /** Current living characteristics (from Business.livingCharacteristics JSON) */
  current: LivingCharacteristics

  /** Latest usage summary counts (from BusinessUsageSummary.data JSON) */
  usageSummary: BusinessUsageSummaryData

  /**
   * Admin overrides — characteristics set explicitly by an admin.
   * These are stored with ADMIN_DECISION source and cannot be overridden
   * by any automated observation.
   */
  adminOverrides?: Partial<{
    [K in keyof BusinessCharacteristics]: {
      value: BusinessCharacteristics[K]
      setAt: Date
      setBy: string
    }
  }>

  /**
   * The timestamp to use for observedAt on new sourced values.
   * Injected by the job runner so tests can use a fixed time.
   */
  now: Date
}

// ---------------------------------------------------------------------------
// CharacteristicsEngineOutput
// ---------------------------------------------------------------------------

/**
 * What the CharacteristicsEngine returns.
 * The RecalculationJob persists updatedLiving and projects characteristics to DB.
 */
export type CharacteristicsEngineOutput = {
  /** Updated living characteristics (to persist to Business.livingCharacteristics) */
  updatedLiving: LivingCharacteristics

  /** Flat projected characteristics for downstream engines */
  characteristics: BusinessCharacteristics

  /** Fields that changed value in this recalculation (for CHARACTERISTICS_UPDATED event payload) */
  changedFields: Array<keyof BusinessCharacteristics>

  /** Whether the dominant source changed (for analytics) */
  dominantSourceChanged: boolean
}
