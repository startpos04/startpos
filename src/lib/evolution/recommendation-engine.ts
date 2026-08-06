/**
 * recommendation-engine.ts — Pure scoring function (Phase 3b)
 *
 * Produces a prioritized list of capability recommendations for a business.
 *
 * Architecture compliance (Principal Architect Review P2-4):
 *   - Returns `importance` ('low' | 'medium' | 'high' | 'critical'), NOT display zones.
 *   - The UI layer maps importance → placement (dashboard card / contextual / settings).
 *   - This engine knows nothing about the UI.
 *
 * Pure function: no IO, no side effects, deterministic output.
 * The Application Layer (RecalculationJob or a weekly sweep) calls this and
 * writes the results to BusinessCapabilityState.
 *
 * Scoring formula (composite score 0.0–1.0):
 *   capabilityRelevance × 0.40   — how strongly the required conditions are met
 *   growthAlignment     × 0.30   — intent fields that signal readiness
 *   businessValueRating × 0.20   — category-based importance weight
 *   setupFriction       × 0.10   — inverse of estimatedSetupMinutes (5 min=1.0, 120 min=0.1)
 *
 * Hard limits:
 *   - Only HIDDEN or RECOMMENDED capabilities are scored — never ENABLED/CONFIGURED/PAUSED.
 *   - Capabilities with a 30-day dismiss cooldown are excluded.
 *   - Maximum 5 active recommendations returned.
 *   - Capabilities with unmet hardDependencies are excluded.
 *   - Always-on capabilities (threshold=0, no boosters) are never recommended.
 */

import { CAPABILITY_REGISTRY } from '../onboarding/capability-registry'
import type { BusinessCharacteristics, CapabilityDefinition } from '../onboarding/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationImportance = 'low' | 'medium' | 'high' | 'critical'

export type CapabilityRecommendation = {
  capabilityId: string
  score: number
  importance: RecommendationImportance
  /** Why this is shown — plain-language observation for the user */
  reason: string
  /** From capability definition */
  businessValue: string
  estimatedSetupMinutes: number
  isComplex: boolean
  /** Breakdown of the composite score for debugging/tuning */
  scoreBreakdown: {
    relevance: number
    growth: number
    businessValue: number
    friction: number
  }
}

/** The current state of a business's capabilities — only the fields needed for scoring */
export type CapabilityStateForScoring = {
  capabilityId: string
  state: 'HIDDEN' | 'RECOMMENDED' | 'ENABLED' | 'CONFIGURED' | 'PAUSED' | 'DEPRECATED'
  dismissedAt: Date | null
  /** Whether hard dependencies are met (all dependency capability IDs in ENABLED/CONFIGURED state) */
}

export type RecommendationEngineInput = {
  characteristics: BusinessCharacteristics
  /** All capability states for this business */
  capabilityStates: CapabilityStateForScoring[]
  /** Current date — injected so tests can use a fixed time */
  now: Date
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum active recommendations shown at one time */
export const MAX_RECOMMENDATIONS = 5

/** Dismiss cooldown in days — dismissed capabilities are excluded for this long */
export const DISMISS_COOLDOWN_DAYS = 30

/** Category-based business value weights (0.0–1.0) */
const CATEGORY_VALUE_WEIGHTS: Record<string, number> = {
  SALES: 1.0,
  INVENTORY: 0.9,
  COMPLIANCE: 0.9,
  FINANCE: 0.8,
  PROCUREMENT: 0.8,
  OPERATIONS: 0.75,
  CRM: 0.7,
  MULTI_BRANCH: 0.7,
  REPORTING: 0.6,
  PLATFORM: 0.5,
}

// ---------------------------------------------------------------------------
// Main engine function
// ---------------------------------------------------------------------------

/**
 * Produces a prioritized list of recommendations for deferred/hidden capabilities.
 *
 * @param input - Business characteristics, current capability states, and the current date
 * @param registry - Capability definitions (defaults to CAPABILITY_REGISTRY)
 * @returns Up to MAX_RECOMMENDATIONS recommendations sorted by score descending
 */
export function computeRecommendations(input: RecommendationEngineInput, registry: CapabilityDefinition[] = CAPABILITY_REGISTRY): CapabilityRecommendation[] {
  const { characteristics, capabilityStates, now } = input

  // Build lookup maps
  const stateMap = new Map(capabilityStates.map(s => [s.capabilityId, s]))
  const enabledIds = new Set(capabilityStates.filter(s => s.state === 'ENABLED' || s.state === 'CONFIGURED').map(s => s.capabilityId))

  const candidates: CapabilityRecommendation[] = []

  for (const cap of registry) {
    // Skip always-on capabilities (no boosters, threshold=0, not deferrable)
    if (cap.boosters.length === 0 && cap.threshold === 0 && !cap.deferrable) continue

    // Skip capabilities that are not applicable (required gate)
    if (!cap.required(characteristics)) continue

    // Skip capabilities that are already ENABLED, CONFIGURED, PAUSED, or DEPRECATED
    const currentState = stateMap.get(cap.id)
    if (
      currentState &&
      (currentState.state === 'ENABLED' || currentState.state === 'CONFIGURED' || currentState.state === 'PAUSED' || currentState.state === 'DEPRECATED')
    ) {
      continue
    }

    // Skip capabilities in dismiss cooldown
    if (currentState?.dismissedAt) {
      const daysSinceDismiss = (now.getTime() - currentState.dismissedAt.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceDismiss < DISMISS_COOLDOWN_DAYS) continue
    }

    // Skip capabilities with unmet hard dependencies
    if (cap.hardDependencies.some(dep => !enabledIds.has(dep))) continue

    // Compute composite score
    const breakdown = computeScoreBreakdown(cap, characteristics)
    const score = breakdown.relevance * 0.4 + breakdown.growth * 0.3 + breakdown.businessValue * 0.2 + breakdown.friction * 0.1

    if (score <= 0) continue

    candidates.push({
      capabilityId: cap.id,
      score,
      importance: scoreToImportance(score),
      reason: buildReason(cap, characteristics),
      businessValue: cap.businessValue,
      estimatedSetupMinutes: cap.estimatedSetupMinutes,
      isComplex: cap.isComplex,
      scoreBreakdown: breakdown,
    })
  }

  // Sort by score descending, cap at MAX_RECOMMENDATIONS
  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_RECOMMENDATIONS)
}

// ---------------------------------------------------------------------------
// Scoring factors
// ---------------------------------------------------------------------------

function computeScoreBreakdown(cap: CapabilityDefinition, characteristics: BusinessCharacteristics): CapabilityRecommendation['scoreBreakdown'] {
  // Factor 1: capability relevance — how strongly the signals fire
  const relevance = cap.recommendationScore(characteristics)

  // Factor 2: growth alignment — intent fields boost
  const growth = computeGrowthAlignment(cap, characteristics)

  // Factor 3: business value rating — category weight
  const businessValue = CATEGORY_VALUE_WEIGHTS[cap.category] ?? 0.5

  // Factor 4: setup friction — inverse of setup time (5 min = 1.0, 120 min ≈ 0.1)
  const friction = computeFrictionScore(cap.estimatedSetupMinutes)

  return { relevance, growth, businessValue, friction }
}

/**
 * Computes the growth alignment score (0.0–1.0) based on intent fields.
 * Intent fields boost scores for related capabilities — they signal that
 * the user has expressed readiness even before the usage observation fires.
 */
function computeGrowthAlignment(cap: CapabilityDefinition, c: BusinessCharacteristics): number {
  const signals: number[] = []

  // Intent → capability mapping
  if (c.intentToAddMoreStaff) {
    if (cap.id === 'MANAGE_EMPLOYEES' || cap.id === 'CREATE_TASK' || cap.id === 'START_VENDOR_SESSION') {
      signals.push(0.8)
    }
  }
  if (c.intentToTrackInventory) {
    if (cap.id === 'MANAGE_INVENTORY' || cap.id === 'VIEW_INVENTORY_REPORTS') {
      signals.push(0.9)
    }
  }
  if (c.intentToManageSuppliers) {
    if (cap.id === 'MANAGE_SUPPLIERS' || cap.id === 'CREATE_PURCHASE') {
      signals.push(0.9)
    }
  }
  if (c.intentToOfferDelivery) {
    if (cap.id === 'DELIVERY_MANAGEMENT' || cap.id === 'CREATE_ORDER') {
      signals.push(0.8)
    }
  }
  if (c.intentToOpenMoreLocations) {
    if (cap.id === 'MANAGE_BRANCHES') {
      signals.push(1.0)
    }
  }
  if (c.intentToIntegrateExternalSystems) {
    if (cap.id === 'ACCESS_API') {
      signals.push(1.0)
    }
  }

  if (signals.length === 0) return 0.3 // Baseline — not 0, because relevance already scores the fit
  return Math.max(...signals)
}

/**
 * Setup friction score: lower setup time = higher score.
 * 0 min → 1.0, 5 min → 0.95, 30 min → 0.7, 120 min → 0.15
 */
function computeFrictionScore(estimatedMinutes: number): number {
  if (estimatedMinutes === 0) return 1.0
  // Exponential decay: score = e^(-k * minutes) where k gives ~0.1 at 120 minutes
  const k = Math.log(10) / 120 // ≈ 0.0192
  return Math.max(0.05, Math.exp(-k * estimatedMinutes))
}

/**
 * Maps a composite score to an importance level.
 */
export function scoreToImportance(score: number): RecommendationImportance {
  if (score >= 0.75) return 'critical'
  if (score >= 0.55) return 'high'
  if (score >= 0.35) return 'medium'
  return 'low'
}

/**
 * Builds a plain-language reason string for a recommendation.
 * This is the "why is this shown?" text seen by the user.
 */
function buildReason(cap: CapabilityDefinition, c: BusinessCharacteristics): string {
  // Pick the most relevant booster that fired
  const firedBoosters = cap.boosters
    .map(b => ({ label: b.label, signal: b.signal(c) }))
    .filter(b => b.signal > 0)
    .sort((a, b) => b.signal - a.signal)

  const topBooster = firedBoosters[0]
  if (!topBooster) return `Based on your business profile`

  return `Because you ${topBooster.label}`
}
