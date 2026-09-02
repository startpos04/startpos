/**
 * business-health-model.ts — Pure function: characteristics + capability states → BusinessHealthStage (Phase 4)
 *
 * Classifies a business into one of four health stages based on how fully
 * the platform is being used relative to what is available.
 *
 * Health stages (classification priority order — first match wins):
 *   SCALING      — Multi-branch OR large team AND 5+ CONFIGURED capabilities
 *   ESTABLISHED  — All profile-recommended capabilities ENABLED/CONFIGURED,
 *                  AND at least one CONFIGURED (actively used)
 *   ACTIVE       — Core capabilities all ENABLED, at least 1 CONFIGURED
 *   STARTING     — Fallback — recent registration or few capabilities active
 *
 * Design constraints:
 *   - Never shown as a "score" — framed as a contextual next-step hint.
 *   - Never blocks functionality.
 *   - Pure function: no IO, no side effects, deterministic output.
 *
 * Architecture:
 *   - Called by RecalculationJob after characteristics are updated.
 *   - Writes Business.healthStage (Application Layer handles the write).
 */

import type { BusinessCharacteristics } from '../onboarding/types'
import type { CapabilityStateForScoring } from './recommendation-engine'

// ---------------------------------------------------------------------------
// Health stage type
// ---------------------------------------------------------------------------

export const BusinessHealthStage = {
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  ESTABLISHED: 'ESTABLISHED',
  SCALING: 'SCALING',
} as const

export type BusinessHealthStage = (typeof BusinessHealthStage)[keyof typeof BusinessHealthStage]

// ---------------------------------------------------------------------------
// Stage hints — shown on the dashboard as the "next step"
// ---------------------------------------------------------------------------

export const HEALTH_STAGE_HINTS: Record<BusinessHealthStage, string> = {
  STARTING: 'Add your first product and process your first sale to get started.',
  ACTIVE: 'Your core setup is complete. Check your dashboard for recommended next steps.',
  ESTABLISHED: "You're fully set up. Review your analytics to find further improvements.",
  SCALING: 'Connect your external systems or add more branches to continue growing.',
}

// ---------------------------------------------------------------------------
// Core capability IDs — required for ACTIVE and above
// ---------------------------------------------------------------------------

/**
 * The minimum set of capabilities that must be ENABLED or CONFIGURED
 * for a business to reach ACTIVE health.
 * These map to always-on capabilities that every business gets at registration.
 */
const CORE_CAPABILITY_IDS = new Set(['COMPLETE_CHECKOUT', 'MANAGE_PRODUCTS', 'VIEW_SALES_REPORTS'])

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classifies a business into a health stage.
 *
 * @param characteristics - The business's current characteristics
 * @param capabilityStates - All capability states for this business
 * @returns The classified BusinessHealthStage
 */
export function classifyHealthStage(characteristics: BusinessCharacteristics, capabilityStates: CapabilityStateForScoring[]): BusinessHealthStage {
  const enabledOrConfigured = new Set(capabilityStates.filter(s => s.state === 'ENABLED' || s.state === 'CONFIGURED').map(s => s.capabilityId))

  const configuredOnly = new Set(capabilityStates.filter(s => s.state === 'CONFIGURED').map(s => s.capabilityId))

  const configuredCount = configuredOnly.size

  // ── SCALING ──────────────────────────────────────────────────────────────
  // Multi-location or large team AND serious usage depth
  if ((characteristics.locationCount === 'multiple' || characteristics.teamSize === 'large') && configuredCount >= 5) {
    return 'SCALING'
  }

  // ── ESTABLISHED ──────────────────────────────────────────────────────────
  // All core capabilities active AND at least 3 additional capabilities enabled
  // AND at least 1 is CONFIGURED (actively used, not just turned on)
  const coreActive = [...CORE_CAPABILITY_IDS].every(id => enabledOrConfigured.has(id))
  const totalEnabled = enabledOrConfigured.size
  if (coreActive && totalEnabled >= 4 && configuredCount >= 1) {
    return 'ESTABLISHED'
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  // All core capabilities ENABLED/CONFIGURED (the basics are working)
  if (coreActive) {
    return 'ACTIVE'
  }

  // ── STARTING ─────────────────────────────────────────────────────────────
  return 'STARTING'
}

/**
 * Returns the dashboard hint for the given health stage.
 */
export function getHealthStageHint(stage: BusinessHealthStage): string {
  return HEALTH_STAGE_HINTS[stage]
}
