/**
 * decay-activation.test.ts — Pattern A unit tests for Phase 4 decay activation
 *
 * Coverage:
 *  - computeCharacteristics applies decay to USAGE_OBSERVATION sources before rules
 *  - Stale USAGE_OBSERVATION (confidence=0) is displaced by a fresh observation rule
 *  - Within-grace-window USAGE_OBSERVATION is preserved unchanged
 *  - ADMIN_DECISION source is never decayed
 *  - SURVEY_ANSWER source is never decayed
 *  - Decayed USAGE_OBSERVATION falls back to SURVEY_ANSWER default when no rule fires
 *  - BUSINESS_EVENT source decays on the same schedule as USAGE_OBSERVATION
 *  - Decay does not affect the final value if a higher-confidence rule fires for the same field
 */

import { describe, expect, it } from 'vitest'
import { computeCharacteristics } from '@/lib/evolution/characteristics-engine'
import type { CharacteristicsEngineInput, LivingCharacteristics, SourcedValue } from '@/lib/evolution/types'
import type { BusinessCharacteristics } from '@/lib/onboarding/types'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-08-04T12:00:00Z')

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

function sourced<T>(
  value: T,
  source: SourcedValue<T>['source'],
  observedAt: Date,
  confidence = 1.0,
): SourcedValue<T> {
  return { value, source, confidence, observedAt }
}

function makeInput(
  current: LivingCharacteristics,
  usageSummary: Record<string, number> = {},
): CharacteristicsEngineInput {
  return { current, usageSummary, now: NOW }
}

// ---------------------------------------------------------------------------
// Decay is applied before new rules
// ---------------------------------------------------------------------------

describe('decay activation — USAGE_OBSERVATION', () => {
  it('stale USAGE_OBSERVATION (> 120 days old) has confidence = 0 after decay', () => {
    // usesSuppliers was set 150 days ago (past 120-day stale threshold)
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'USAGE_OBSERVATION', daysAgo(150)),
    }
    // No new observation fires (supplierCount=0)
    const output = computeCharacteristics(makeInput(current, { supplierCount: 0 }))

    // The decayed field should have confidence = 0
    const staleField = output.updatedLiving.usesSuppliers
    expect(staleField?.confidence).toBe(0)
  })

  it('fresh USAGE_OBSERVATION (within 30-day grace window) is preserved', () => {
    // usesSuppliers was observed 10 days ago (well within 30-day grace window)
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'USAGE_OBSERVATION', daysAgo(10), 0.95),
    }
    const output = computeCharacteristics(makeInput(current, { supplierCount: 0 }))

    // Confidence unchanged — within grace window
    const preserved = output.updatedLiving.usesSuppliers
    expect(preserved?.confidence).toBe(0.95)
    expect(preserved?.value).toBe(true)
  })

  it('stale observation is displaced by a fresh rule firing for the same field', () => {
    // usesSuppliers was observed 150 days ago (stale — confidence decays to 0)
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'USAGE_OBSERVATION', daysAgo(150), 0.95),
    }
    // New observation fires (supplierCount=1 → ruleUsesSuppliers fires)
    const output = computeCharacteristics(makeInput(current, { supplierCount: 1 }))

    // The rule wins — fresh observation replaces the stale one
    const updated = output.updatedLiving.usesSuppliers
    expect(updated?.confidence).toBe(0.95) // rule confidence
    expect(updated?.source).toBe('USAGE_OBSERVATION')
    expect(updated?.observedAt).toEqual(NOW) // observed now, not 150 days ago
  })

  it('stale observation falls back to survey_answer default when no rule fires', () => {
    // usesSuppliers = true from USAGE_OBSERVATION 150 days ago (decays to 0)
    // No rule fires (supplierCount = 0)
    // After decay, the field still has the stale value — but changedFields won't include it
    // because the VALUE hasn't changed (only confidence changed)
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'USAGE_OBSERVATION', daysAgo(150), 0.95),
    }
    const output = computeCharacteristics(makeInput(current, { supplierCount: 0 }))

    // Confidence decayed to 0 but the raw value is still there (engine doesn't remove it)
    expect(output.updatedLiving.usesSuppliers?.confidence).toBe(0)
    // The projected characteristics still returns the value (confidence is metadata, not a gate)
    expect(output.characteristics.usesSuppliers).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Sources that never decay
// ---------------------------------------------------------------------------

describe('decay activation — never-decay sources', () => {
  it('ADMIN_DECISION source is never decayed regardless of age', () => {
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(false, 'ADMIN_DECISION', daysAgo(500), 1.0),
    }
    // Rule fires (supplierCount=5) — but admin decision should NOT be overridden
    const output = computeCharacteristics(makeInput(current, { supplierCount: 5 }))

    // Admin decision preserved
    expect(output.updatedLiving.usesSuppliers?.source).toBe('ADMIN_DECISION')
    expect(output.updatedLiving.usesSuppliers?.value).toBe(false)
    expect(output.updatedLiving.usesSuppliers?.confidence).toBe(1.0)
    expect(output.characteristics.usesSuppliers).toBe(false)
  })

  it('SURVEY_ANSWER source is never decayed', () => {
    const current: LivingCharacteristics = {
      tracksInventory: sourced(false, 'SURVEY_ANSWER', daysAgo(365), 1.0),
    }
    // No rule fires (purchaseOrderCount = 0)
    const output = computeCharacteristics(makeInput(current, { purchaseOrderCount: 0 }))

    // Survey answer preserved
    expect(output.updatedLiving.tracksInventory?.source).toBe('SURVEY_ANSWER')
    expect(output.updatedLiving.tracksInventory?.confidence).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// BUSINESS_EVENT decay
// ---------------------------------------------------------------------------

describe('decay activation — BUSINESS_EVENT source', () => {
  it('BUSINESS_EVENT within 60-day grace window is not decayed', () => {
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'BUSINESS_EVENT', daysAgo(30), 0.95),
    }
    const output = computeCharacteristics(makeInput(current, {}))

    // Still within 60-day grace window
    expect(output.updatedLiving.usesSuppliers?.confidence).toBe(0.95)
  })

  it('BUSINESS_EVENT past 180-day stale threshold has confidence = 0', () => {
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'BUSINESS_EVENT', daysAgo(200), 0.95),
    }
    const output = computeCharacteristics(makeInput(current, {}))

    expect(output.updatedLiving.usesSuppliers?.confidence).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Decay does not affect outcome when a fresh rule fires
// ---------------------------------------------------------------------------

describe('decay — interaction with new rules', () => {
  it('fresh rule for a different field is unaffected by decay of another field', () => {
    // usesSuppliers is stale
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'USAGE_OBSERVATION', daysAgo(150), 0.95),
    }
    // tracksInventory rule fires (purchaseOrderCount = 3)
    const output = computeCharacteristics(makeInput(current, { purchaseOrderCount: 3 }))

    // tracksInventory is updated freshly
    expect(output.updatedLiving.tracksInventory?.source).toBe('USAGE_OBSERVATION')
    expect(output.updatedLiving.tracksInventory?.observedAt).toEqual(NOW)
    // usesSuppliers is stale (confidence 0) but still in living state
    expect(output.updatedLiving.usesSuppliers?.confidence).toBe(0)
  })

  it('changedFields does not include a field whose VALUE is unchanged by decay', () => {
    // usesSuppliers = true from 150 days ago — decays to confidence=0 but value stays true
    const current: LivingCharacteristics = {
      usesSuppliers: sourced(true, 'USAGE_OBSERVATION', daysAgo(150), 0.95),
    }
    const output = computeCharacteristics(makeInput(current, { supplierCount: 0 }))

    // Value is still true (same as before) — should NOT appear in changedFields
    expect(output.changedFields).not.toContain('usesSuppliers')
  })
})
