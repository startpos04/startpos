/**
 * characteristics-engine.ts — Pure function: CharacteristicsEngineInput → CharacteristicsEngineOutput
 *
 * Merges all evidence sources (survey, events, usage observations, admin overrides)
 * into an updated LivingCharacteristics and projects a flat BusinessCharacteristics
 * for use by downstream pure engines.
 *
 * Source priority (highest wins):
 *   ADMIN_DECISION > SYSTEM_CONFIG > USAGE_OBSERVATION > BUSINESS_EVENT > SURVEY_ANSWER > AI_INFERENCE
 *
 * Resolution rules:
 *   1. Admin overrides are applied first — they cannot be displaced.
 *   2. Observation rules are evaluated against the usage summary.
 *   3. For each characteristic field, the sourced value with the highest priority wins.
 *   4. If two sources have the same priority, the higher confidence wins.
 *   5. Fields not observed in any source fall back to DEFAULT_CHARACTERISTICS.
 *
 * Architecture compliance:
 *   - Pure function: no IO, no side effects, deterministic output.
 *   - LivingCharacteristics is internal — never returned to capability/resolver modules.
 *   - Downstream engines receive BusinessCharacteristics directly.
 *   - CharacteristicsSnapshot removed per Principal Architect Review R2.
 */

import { DEFAULT_CHARACTERISTICS } from '../onboarding/defaults'
import type { BusinessCharacteristics } from '../onboarding/types'
import { OBSERVATION_RULES } from './observation-rules'
import {
  CharacteristicSourcePriority,
  type CharacteristicsEngineInput,
  type CharacteristicsEngineOutput,
  type LivingCharacteristics,
  type ObservationRule,
  SOURCE_DECAY_PARAMS,
  type SourcedValue,
} from './types'

// ---------------------------------------------------------------------------
// Main engine function
// ---------------------------------------------------------------------------

/**
 * Computes updated characteristics by merging all evidence sources.
 *
 * @param input - All sources assembled by the RecalculationJob
 * @param rules - Observation rules to evaluate (defaults to OBSERVATION_RULES)
 * @returns Updated living characteristics and projected flat BusinessCharacteristics
 */
export function computeCharacteristics(input: CharacteristicsEngineInput, rules: ObservationRule[] = OBSERVATION_RULES): CharacteristicsEngineOutput {
  const { current, usageSummary, adminOverrides, now } = input

  // Start from the current living characteristics
  const updated: LivingCharacteristics = { ...current }

  // Step 0 (Phase 4): Apply confidence decay to USAGE_OBSERVATION and BUSINESS_EVENT
  // sourced values before evaluating new rules. Stale observations fall back to
  // lower-priority sources when their confidence drops below the rule threshold.
  for (const key of Object.keys(updated) as Array<keyof BusinessCharacteristics>) {
    const sourced = updated[key]
    if (!sourced) continue
    const decayParams = SOURCE_DECAY_PARAMS[sourced.source]
    if (!decayParams) continue
    // Only decay observation-type sources; ADMIN/SURVEY/SYSTEM_CONFIG never decay
    if (sourced.source !== 'USAGE_OBSERVATION' && sourced.source !== 'BUSINESS_EVENT') continue

    const decayed = applyDecay(sourced as SourcedValue<unknown>, now, decayParams.graceWindowDays, decayParams.staleAfterDays)
    if (decayed.confidence !== sourced.confidence) {
      ;(updated as Record<string, SourcedValue<unknown>>)[key] = decayed as SourcedValue<BusinessCharacteristics[typeof key]>
    }
  }

  // Step 1: Apply admin overrides (ADMIN_DECISION source — maximum priority)
  if (adminOverrides) {
    for (const [field, override] of Object.entries(adminOverrides)) {
      if (override === undefined) continue
      const key = field as keyof BusinessCharacteristics
      const existing = updated[key]
      const adminPriority = CharacteristicSourcePriority.ADMIN_DECISION

      // Only apply if it would win (it always does — admin overrides everything)
      if (!existing || adminPriority > CharacteristicSourcePriority[existing.source]) {
        ;(updated as Record<string, SourcedValue<unknown>>)[key] = {
          value: override.value,
          source: 'ADMIN_DECISION',
          confidence: 1.0,
          observedAt: override.setAt,
          evidence: `Set manually by ${override.setBy}`,
        }
      }
    }
  }

  // Step 2: Evaluate all observation rules against the usage summary
  for (const rule of rules) {
    if (!rule.condition(usageSummary)) continue

    const key = rule.characteristic as keyof BusinessCharacteristics
    const existing = updated[key]
    const rulePriority = CharacteristicSourcePriority.USAGE_OBSERVATION

    // Rule fires: apply if it beats the existing source
    const shouldApply =
      !existing ||
      rulePriority > CharacteristicSourcePriority[existing.source] ||
      // Same priority: higher confidence wins
      (rulePriority === CharacteristicSourcePriority[existing.source] && rule.confidence > (existing.confidence ?? 0))

    if (shouldApply) {
      ;(updated as Record<string, SourcedValue<unknown>>)[key] = {
        value: rule.value,
        source: 'USAGE_OBSERVATION',
        confidence: rule.confidence,
        observedAt: now,
        evidence: rule.evidence,
      }
    }
  }

  // Step 3: Project to flat BusinessCharacteristics
  const characteristics = projectToCharacteristics(updated)

  // Step 4: Compute changed fields by comparing current → updated
  const changedFields = computeChangedFields(current, updated)

  // Step 5: Compute whether the dominant source changed
  const dominantSourceChanged = computeDominantSourceChanged(current, updated)

  return {
    updatedLiving: updated,
    characteristics,
    changedFields,
    dominantSourceChanged,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Projects LivingCharacteristics to a flat BusinessCharacteristics.
 * Fields not present in the living state fall back to DEFAULT_CHARACTERISTICS.
 */
export function projectToCharacteristics(living: LivingCharacteristics): BusinessCharacteristics {
  const result: Partial<BusinessCharacteristics> = {}

  for (const key of Object.keys(DEFAULT_CHARACTERISTICS) as Array<keyof BusinessCharacteristics>) {
    const sourced = living[key]
    if (sourced !== undefined) {
      // Type-safe assignment via unknown cast
      ;(result as Record<string, unknown>)[key] = sourced.value
    } else {
      ;(result as Record<string, unknown>)[key] = DEFAULT_CHARACTERISTICS[key]
    }
  }

  return result as BusinessCharacteristics
}

/**
 * Applies a survey-derived BusinessCharacteristics as SURVEY_ANSWER sources
 * into an empty LivingCharacteristics. Used at registration.
 */
export function applysurveyAnswers(surveyCharacteristics: BusinessCharacteristics, now: Date): LivingCharacteristics {
  const living: LivingCharacteristics = {}

  for (const key of Object.keys(surveyCharacteristics) as Array<keyof BusinessCharacteristics>) {
    ;(living as Record<string, SourcedValue<unknown>>)[key] = {
      value: surveyCharacteristics[key],
      source: 'SURVEY_ANSWER',
      confidence: 1.0,
      observedAt: now,
      evidence: 'From your initial survey',
    }
  }

  return living
}

/**
 * Returns the fields whose effective value changed between two LivingCharacteristics states.
 */
function computeChangedFields(before: LivingCharacteristics, after: LivingCharacteristics): Array<keyof BusinessCharacteristics> {
  const changed: Array<keyof BusinessCharacteristics> = []

  for (const key of Object.keys(DEFAULT_CHARACTERISTICS) as Array<keyof BusinessCharacteristics>) {
    const beforeValue = before[key]?.value ?? DEFAULT_CHARACTERISTICS[key]
    const afterValue = after[key]?.value ?? DEFAULT_CHARACTERISTICS[key]

    if (beforeValue !== afterValue) {
      changed.push(key)
    }
  }

  return changed
}

/**
 * Returns the dominant source (highest priority source with a value) across all fields.
 * Used for analytics — not for capability resolution.
 */
export function getDominantSource(living: LivingCharacteristics): string {
  let maxPriority = -1
  let dominant = 'SURVEY_ANSWER'

  for (const sourced of Object.values(living)) {
    if (!sourced) continue
    const priority = CharacteristicSourcePriority[sourced.source] ?? 0
    if (priority > maxPriority) {
      maxPriority = priority
      dominant = sourced.source
    }
  }

  return dominant
}

/**
 * Returns true if the dominant source changed between two living states.
 */
function computeDominantSourceChanged(before: LivingCharacteristics, after: LivingCharacteristics): boolean {
  return getDominantSource(before) !== getDominantSource(after)
}

/**
 * Decays a single SourcedValue based on the time elapsed since observedAt.
 * Phase 4 activates this; Phase 2 defines it as a pure function for future use.
 * Returns the original value unchanged if the source never decays.
 */
export function applyDecay<T>(sourced: SourcedValue<T>, now: Date, graceWindowDays: number, staleAfterDays: number): SourcedValue<T> {
  if (!Number.isFinite(graceWindowDays) || !Number.isFinite(staleAfterDays)) {
    // ADMIN_DECISION and SURVEY_ANSWER never decay
    return sourced
  }

  const ageMs = now.getTime() - sourced.observedAt.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  if (ageDays <= graceWindowDays) {
    // Within grace window — no decay
    return sourced
  }

  if (ageDays >= staleAfterDays) {
    // Fully stale — confidence = 0
    return { ...sourced, confidence: 0 }
  }

  // Linear decay from graceWindowDays to staleAfterDays
  const decayRange = staleAfterDays - graceWindowDays
  const decayProgress = (ageDays - graceWindowDays) / decayRange
  const decayedConfidence = sourced.confidence * (1 - decayProgress)

  return { ...sourced, confidence: Math.max(0, decayedConfidence) }
}

// ---------------------------------------------------------------------------
// Decay audit helpers (Phase 7)
// ---------------------------------------------------------------------------

/**
 * Describes a characteristic that has fully decayed (confidence = 0).
 * Used by the Phase 7 decay rate audit to identify fields that may need
 * their graceWindowDays or staleAfterDays tuned.
 */
export type DecayedCharacteristicReport = {
  /** The characteristic field name */
  field: string
  /** The source that originally set this value */
  source: string
  /** When the value was last observed (before it decayed) */
  observedAt: Date
  /** Age of the value in days at audit time */
  ageDays: number
  /** The decayed value (still stored — just has 0 confidence) */
  value: unknown
}

/**
 * Inspects a LivingCharacteristics snapshot and returns all fields that
 * have fully decayed to confidence = 0.
 *
 * A fully decayed field means the engine no longer trusts this observation.
 * When many fields decay simultaneously it may indicate:
 *   - graceWindowDays is too short for the business's operating cadence
 *   - staleAfterDays is too short relative to the weekly job frequency
 *   - The business went dormant (no usage events to refresh observations)
 *
 * Phase 7 workflow:
 *   1. Run this function across a sample of businesses via the backfill job.
 *   2. If ≥ 10% of active businesses have decayed characteristics, review
 *      SOURCE_DECAY_PARAMS in types.ts against the data pattern.
 *   3. File an ADR (ADR-005 or higher) before changing any decay parameters.
 *
 * @param living - The LivingCharacteristics JSON from Business.livingCharacteristics
 * @param now    - Current date (injected for testability)
 */
export function auditDecayedCharacteristics(living: LivingCharacteristics, now: Date): DecayedCharacteristicReport[] {
  const decayed: DecayedCharacteristicReport[] = []

  for (const [field, sourced] of Object.entries(living)) {
    if (!sourced) continue
    const s = sourced as SourcedValue<unknown>
    if (s.confidence > 0) continue

    const ageDays = (now.getTime() - s.observedAt.getTime()) / (1000 * 60 * 60 * 24)
    decayed.push({
      field,
      source: s.source,
      observedAt: s.observedAt,
      ageDays: Math.round(ageDays),
      value: s.value,
    })
  }

  // Sort by age descending — most stale fields first
  return decayed.sort((a, b) => b.ageDays - a.ageDays)
}
