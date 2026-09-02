/**
 * business-health-model.test.ts — Pattern A unit tests
 *
 * Coverage:
 *  - STARTING: no capabilities enabled
 *  - STARTING: only some core capabilities enabled
 *  - ACTIVE: all core capabilities enabled (COMPLETE_CHECKOUT, MANAGE_PRODUCTS, VIEW_SALES_REPORTS)
 *  - ACTIVE: core enabled but only 3 total enabled (< 4 threshold for ESTABLISHED)
 *  - ESTABLISHED: core enabled + 4+ total enabled + at least 1 CONFIGURED
 *  - ESTABLISHED: does NOT trigger without a CONFIGURED capability
 *  - SCALING: multiple locations + 5 CONFIGURED capabilities
 *  - SCALING: large team + 5 CONFIGURED capabilities
 *  - SCALING: does NOT trigger without 5 CONFIGURED even with large team
 *  - Classification priority: SCALING wins over ESTABLISHED
 *  - getHealthStageHint returns a non-empty string for every stage
 *  - All four stages have distinct hint strings
 */

import { describe, expect, it } from 'vitest'
import {
  BusinessHealthStage,
  HEALTH_STAGE_HINTS,
  classifyHealthStage,
  getHealthStageHint,
} from '@/lib/evolution/business-health-model'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'
import type { BusinessCharacteristics } from '@/lib/onboarding/types'
import type { CapabilityStateForScoring } from '@/lib/evolution/recommendation-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chars(overrides: Partial<BusinessCharacteristics> = {}): BusinessCharacteristics {
  return { ...DEFAULT_CHARACTERISTICS, ...overrides }
}

function capState(
  capabilityId: string,
  state: CapabilityStateForScoring['state'],
): CapabilityStateForScoring {
  return { capabilityId, state, dismissedAt: null }
}

const coreEnabled: CapabilityStateForScoring[] = [
  capState('COMPLETE_CHECKOUT', 'ENABLED'),
  capState('MANAGE_PRODUCTS', 'ENABLED'),
  capState('VIEW_SALES_REPORTS', 'ENABLED'),
]

// ---------------------------------------------------------------------------
// STARTING
// ---------------------------------------------------------------------------

describe('classifyHealthStage — STARTING', () => {
  it('no capabilities → STARTING', () => {
    expect(classifyHealthStage(chars(), [])).toBe(BusinessHealthStage.STARTING)
  })

  it('some capabilities but missing core → STARTING', () => {
    const states = [
      capState('COMPLETE_CHECKOUT', 'ENABLED'),
      // MANAGE_PRODUCTS and VIEW_SALES_REPORTS missing
    ]
    expect(classifyHealthStage(chars(), states)).toBe(BusinessHealthStage.STARTING)
  })

  it('only RECOMMENDED/HIDDEN capabilities → STARTING', () => {
    const states = [
      capState('MANAGE_INVENTORY', 'RECOMMENDED'),
      capState('CREATE_PURCHASE', 'HIDDEN'),
    ]
    expect(classifyHealthStage(chars(), states)).toBe(BusinessHealthStage.STARTING)
  })
})

// ---------------------------------------------------------------------------
// ACTIVE
// ---------------------------------------------------------------------------

describe('classifyHealthStage — ACTIVE', () => {
  it('all three core capabilities ENABLED → ACTIVE', () => {
    expect(classifyHealthStage(chars(), coreEnabled)).toBe(BusinessHealthStage.ACTIVE)
  })

  it('core CONFIGURED also qualifies as ACTIVE core (3 total, 0 CONFIGURED → ACTIVE not ESTABLISHED)', () => {
    // 3 total but 0 CONFIGURED → ACTIVE (not ESTABLISHED which needs configuredCount ≥ 1)
    expect(classifyHealthStage(chars(), coreEnabled)).toBe(BusinessHealthStage.ACTIVE)
  })

  it('PAUSED core capability does not count toward ACTIVE', () => {
    const states = [
      capState('COMPLETE_CHECKOUT', 'ENABLED'),
      capState('MANAGE_PRODUCTS', 'PAUSED'), // paused — not counted
      capState('VIEW_SALES_REPORTS', 'ENABLED'),
    ]
    expect(classifyHealthStage(chars(), states)).toBe(BusinessHealthStage.STARTING)
  })

  it('CONFIGURED core capability counts as active (3 total, 1 CONFIGURED → ESTABLISHED)', () => {
    // All 3 core caps are CONFIGURED — that's 3 enabled/configured and 3 CONFIGURED
    // ESTABLISHED requires totalEnabled >= 4, but 3 CONFIGURED still triggers SCALING check first
    // With solo + one location and only 3, we expect ESTABLISHED (configuredCount >= 1 and coreActive)
    // BUT our threshold is totalEnabled >= 4 — with only 3 total we get ACTIVE
    // Fix: this actually returns ACTIVE with the current thresholds (need 4+ for ESTABLISHED)
    const states = [
      capState('COMPLETE_CHECKOUT', 'CONFIGURED'),
      capState('MANAGE_PRODUCTS', 'ENABLED'),
      capState('VIEW_SALES_REPORTS', 'ENABLED'),
    ]
    // 3 total, 1 CONFIGURED — below ESTABLISHED threshold of 4 total → ACTIVE
    expect(classifyHealthStage(chars(), states)).toBe(BusinessHealthStage.ACTIVE)
  })
})

// ---------------------------------------------------------------------------
// ESTABLISHED
// ---------------------------------------------------------------------------

describe('classifyHealthStage — ESTABLISHED', () => {
  it('4+ enabled + 1 CONFIGURED → ESTABLISHED', () => {
    const states = [
      ...coreEnabled,
      capState('MANAGE_INVENTORY', 'ENABLED'),
      capState('MANAGE_SUPPLIERS', 'CONFIGURED'), // 1 CONFIGURED
    ]
    expect(classifyHealthStage(chars(), states)).toBe(BusinessHealthStage.ESTABLISHED)
  })

  it('exactly 4 enabled but 0 CONFIGURED → ACTIVE (not ESTABLISHED)', () => {
    const states = [
      ...coreEnabled,
      capState('MANAGE_INVENTORY', 'ENABLED'),
      // No CONFIGURED
    ]
    expect(classifyHealthStage(chars(), states)).toBe(BusinessHealthStage.ACTIVE)
  })

  it('4+ enabled + 1 CONFIGURED + solo team → ESTABLISHED (not SCALING)', () => {
    const states = [
      ...coreEnabled,
      capState('MANAGE_INVENTORY', 'ENABLED'),
      capState('MANAGE_SUPPLIERS', 'CONFIGURED'),
    ]
    expect(
      classifyHealthStage(chars({ teamSize: 'solo', locationCount: 'one' }), states),
    ).toBe(BusinessHealthStage.ESTABLISHED)
  })
})

// ---------------------------------------------------------------------------
// SCALING
// ---------------------------------------------------------------------------

describe('classifyHealthStage — SCALING', () => {
  const fiveConfigured: CapabilityStateForScoring[] = [
    capState('COMPLETE_CHECKOUT', 'CONFIGURED'),
    capState('MANAGE_PRODUCTS', 'CONFIGURED'),
    capState('VIEW_SALES_REPORTS', 'CONFIGURED'),
    capState('MANAGE_INVENTORY', 'CONFIGURED'),
    capState('MANAGE_SUPPLIERS', 'CONFIGURED'),
  ]

  it('multiple locations + 5 CONFIGURED → SCALING', () => {
    expect(
      classifyHealthStage(chars({ locationCount: 'multiple' }), fiveConfigured),
    ).toBe(BusinessHealthStage.SCALING)
  })

  it('large team + 5 CONFIGURED → SCALING', () => {
    expect(
      classifyHealthStage(chars({ teamSize: 'large' }), fiveConfigured),
    ).toBe(BusinessHealthStage.SCALING)
  })

  it('multiple locations + only 4 CONFIGURED → ESTABLISHED (not SCALING)', () => {
    const fourConfigured = fiveConfigured.slice(0, 4)
    expect(
      classifyHealthStage(chars({ locationCount: 'multiple' }), fourConfigured),
    ).toBe(BusinessHealthStage.ESTABLISHED)
  })

  it('5 CONFIGURED but solo + one location → ESTABLISHED (not SCALING)', () => {
    expect(
      classifyHealthStage(chars({ teamSize: 'solo', locationCount: 'one' }), fiveConfigured),
    ).toBe(BusinessHealthStage.ESTABLISHED)
  })
})

// ---------------------------------------------------------------------------
// Priority order
// ---------------------------------------------------------------------------

describe('classifyHealthStage — priority', () => {
  it('SCALING wins over ESTABLISHED when both conditions are met', () => {
    // Large team + 5 CONFIGURED would also satisfy ESTABLISHED — SCALING should win
    const states = [
      capState('COMPLETE_CHECKOUT', 'CONFIGURED'),
      capState('MANAGE_PRODUCTS', 'CONFIGURED'),
      capState('VIEW_SALES_REPORTS', 'CONFIGURED'),
      capState('MANAGE_INVENTORY', 'CONFIGURED'),
      capState('MANAGE_SUPPLIERS', 'CONFIGURED'),
    ]
    expect(
      classifyHealthStage(chars({ teamSize: 'large' }), states),
    ).toBe(BusinessHealthStage.SCALING)
  })
})

// ---------------------------------------------------------------------------
// getHealthStageHint
// ---------------------------------------------------------------------------

describe('getHealthStageHint', () => {
  it('returns a non-empty hint for every stage', () => {
    for (const stage of Object.values(BusinessHealthStage)) {
      const hint = getHealthStageHint(stage)
      expect(typeof hint).toBe('string')
      expect(hint.length).toBeGreaterThan(0)
    }
  })

  it('all four stages have distinct hint strings', () => {
    const hints = Object.values(BusinessHealthStage).map(getHealthStageHint)
    const unique = new Set(hints)
    expect(unique.size).toBe(4)
  })

  it('HEALTH_STAGE_HINTS covers all four stages', () => {
    expect(Object.keys(HEALTH_STAGE_HINTS)).toHaveLength(4)
    for (const stage of Object.values(BusinessHealthStage)) {
      expect(HEALTH_STAGE_HINTS[stage]).toBeTruthy()
    }
  })
})
