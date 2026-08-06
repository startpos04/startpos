/**
 * threshold-tuning-guide.ts — Phase 7 threshold audit tooling
 *
 * Pure functions that read recommendation analytics (from Phase 6) and produce
 * actionable tuning recommendations. No actual threshold values are changed here —
 * this module flags candidates and explains the direction of adjustment.
 *
 * Workflow for a Phase 7 threshold change:
 *   1. Wait for ≥ 90 days of production data (the roadmap precondition).
 *   2. Call fetchRecommendationAnalytics() from recommendation-analytics.ts.
 *   3. Pass the result to auditThresholds() — this function.
 *   4. For each flagged capability, review the raw data in the admin dashboard.
 *   5. Make the change in capability-registry.ts.
 *   6. File an ADR using docs/decisions/ADR-005-threshold-change-template.md.
 *   7. Run pnpm test to confirm the registry validation still passes.
 *
 * What "threshold" means in context:
 *   - capability.threshold      — min average booster confidence to auto-enable
 *   - capability.recommendationScore — returns 0.0–1.0; used as the "relevance" factor
 *   - ObservationRule.confidence — how strongly the engine trusts an observation
 *   - SOURCE_DECAY_PARAMS        — graceWindowDays / staleAfterDays per source type
 *
 * This file handles the capability threshold and recommendationScore signals.
 * Observation rule confidence tuning is handled by examining which rules fire
 * incorrectly using the BusinessEventLog — that is a manual audit step.
 * Decay rate tuning is covered by auditDecayedCharacteristics() in
 * characteristics-engine.ts.
 */

import type { CapabilityRecommendationStats } from './recommendation-analytics'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Acceptance rate below this threshold suggests the capability is being
 * recommended too broadly — the threshold or recommendationScore is too low.
 * Direction: raise threshold or tighten the required() / booster signals.
 */
export const LOW_ACCEPTANCE_RATE_THRESHOLD = 0.15

/**
 * Dismissal rate above this threshold suggests the capability is surfaced
 * at the wrong time or to the wrong businesses.
 * Direction: tighten required() or add stronger booster conditions.
 */
export const HIGH_DISMISSAL_RATE_THRESHOLD = 0.5

/**
 * Acceptance rate above this threshold on a capability marked deferrable
 * suggests the threshold is too high — many businesses want it but it is
 * not being auto-enabled.
 * Direction: lower the threshold or raise booster signal weights.
 */
export const HIGH_ACCEPTANCE_RATE_THRESHOLD = 0.85

/**
 * Minimum sample size (total recommendations) before a capability is audited.
 * Small samples produce noisy rates. Adjust this as the business grows.
 */
export const MIN_SAMPLE_SIZE = 20

/**
 * Average days-to-enable above this value suggests friction in the activation
 * flow for an accepted recommendation — the setup UX may need improvement.
 */
export const HIGH_DAYS_TO_ENABLE_THRESHOLD = 14

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThresholdAuditSeverity = 'info' | 'warn' | 'action-required'

export type ThresholdAuditFlag = {
  capabilityId: string
  severity: ThresholdAuditSeverity
  signal: 'LOW_ACCEPTANCE' | 'HIGH_DISMISSAL' | 'HIGH_ACCEPTANCE' | 'SLOW_ACTIVATION'
  /** What the data shows */
  observation: string
  /** What to investigate or change */
  recommendation: string
  /** The raw stats this flag was derived from */
  stats: CapabilityRecommendationStats
}

export type ThresholdAuditReport = {
  generatedAt: Date
  sampleWindowNote: string
  totalCapabilitiesEvaluated: number
  totalFlagged: number
  flags: ThresholdAuditFlag[]
}

// ---------------------------------------------------------------------------
// Main audit function
// ---------------------------------------------------------------------------

/**
 * Audits recommendation analytics and returns a report of capabilities that
 * may need threshold or scoring adjustments.
 *
 * Pure function — no IO. Pass the output of fetchRecommendationAnalytics()
 * directly to this function.
 *
 * @param stats  - Per-capability stats from recommendation-analytics.ts
 * @param now    - Current date (injected for testability)
 * @returns      - Audit report with flagged capabilities and recommendations
 */
export function auditThresholds(stats: CapabilityRecommendationStats[], now: Date = new Date()): ThresholdAuditReport {
  const flags: ThresholdAuditFlag[] = []
  let evaluated = 0

  for (const s of stats) {
    // Skip capabilities with insufficient data
    if (s.totalRecommended < MIN_SAMPLE_SIZE) continue
    evaluated++

    // ── Signal 1: Low acceptance rate ──────────────────────────────────────
    if (s.acceptanceRate < LOW_ACCEPTANCE_RATE_THRESHOLD) {
      flags.push({
        capabilityId: s.capabilityId,
        severity: s.acceptanceRate < 0.05 ? 'action-required' : 'warn',
        signal: 'LOW_ACCEPTANCE',
        observation: `Acceptance rate is ${pct(s.acceptanceRate)} (${s.totalAccepted}/${s.totalRecommended}). Below the ${pct(LOW_ACCEPTANCE_RATE_THRESHOLD)} baseline.`,
        recommendation: [
          `Raise the capability's 'threshold' value to require stronger booster signals before auto-enabling.`,
          `Or tighten the 'required()' gate so fewer businesses see this recommendation.`,
          `Or adjust 'recommendationScore()' to return lower values for the patterns that are dismissing.`,
        ].join(' '),
        stats: s,
      })
    }

    // ── Signal 2: High dismissal rate ──────────────────────────────────────
    if (s.dismissalRate > HIGH_DISMISSAL_RATE_THRESHOLD) {
      flags.push({
        capabilityId: s.capabilityId,
        severity: 'warn',
        signal: 'HIGH_DISMISSAL',
        observation: `Dismissal rate is ${pct(s.dismissalRate)} (${s.totalDismissed}/${s.totalRecommended}). Above the ${pct(HIGH_DISMISSAL_RATE_THRESHOLD)} baseline.`,
        recommendation: [
          `Strengthen the 'required()' gate — the capability may be appearing for businesses that genuinely don't need it.`,
          `Or add a higher-confidence booster so the recommendation score only rises when the signal is strong.`,
          `Review the BusinessEventLog for the triggering observation rules on these businesses.`,
        ].join(' '),
        stats: s,
      })
    }

    // ── Signal 3: High acceptance rate (may be too conservative) ───────────
    if (s.acceptanceRate > HIGH_ACCEPTANCE_RATE_THRESHOLD && s.totalAbandoned < 5) {
      flags.push({
        capabilityId: s.capabilityId,
        severity: 'info',
        signal: 'HIGH_ACCEPTANCE',
        observation: `Acceptance rate is ${pct(s.acceptanceRate)} (${s.totalAccepted}/${s.totalRecommended}). Near-universal acceptance suggests the threshold may be too high.`,
        recommendation: [
          `Consider lowering the capability's 'threshold' value so it auto-enables for more businesses.`,
          `Or increase the 'recommendationScore()' weight so this capability surfaces earlier in the recommendation queue.`,
        ].join(' '),
        stats: s,
      })
    }

    // ── Signal 4: Slow activation (high days-to-enable) ─────────────────────
    if (s.avgDaysToEnable !== null && s.avgDaysToEnable > HIGH_DAYS_TO_ENABLE_THRESHOLD && s.totalAccepted >= 5) {
      flags.push({
        capabilityId: s.capabilityId,
        severity: 'info',
        signal: 'SLOW_ACTIVATION',
        observation: `Average time from RECOMMENDED to ENABLED is ${s.avgDaysToEnable.toFixed(1)} days. Above the ${HIGH_DAYS_TO_ENABLE_THRESHOLD}-day baseline.`,
        recommendation: [
          `Review the setup flow for this capability — the UX may have too many steps.`,
          `Or the recommendation is appearing before the business is ready: tighten the required() gate.`,
        ].join(' '),
        stats: s,
      })
    }
  }

  // Sort: action-required first, then warn, then info
  const severityOrder: Record<ThresholdAuditSeverity, number> = {
    'action-required': 0,
    warn: 1,
    info: 2,
  }
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return {
    generatedAt: now,
    sampleWindowNote: `This report requires ≥ 90 days of production data to be reliable. Only capabilities with ≥ ${MIN_SAMPLE_SIZE} recommendations are evaluated.`,
    totalCapabilitiesEvaluated: evaluated,
    totalFlagged: flags.length,
    flags,
  }
}

/**
 * Returns only the action-required flags — the critical subset for daily ops.
 */
export function getCriticalFlags(report: ThresholdAuditReport): ThresholdAuditFlag[] {
  return report.flags.filter(f => f.severity === 'action-required')
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}
