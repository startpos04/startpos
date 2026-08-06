/**
 * recommendation-engine.test.ts — Pattern A unit tests
 *
 * Coverage:
 *  - Returns empty array when no applicable capabilities exist
 *  - Caps output at MAX_RECOMMENDATIONS (5)
 *  - Excludes ENABLED, CONFIGURED, PAUSED, DEPRECATED capabilities
 *  - Excludes always-on capabilities (checkout, products, etc.)
 *  - Excludes capabilities not passing required() gate
 *  - Excludes capabilities within 30-day dismiss cooldown
 *  - Includes capabilities past the cooldown
 *  - Excludes capabilities with unmet hard dependencies
 *  - Includes capabilities once hard dependencies are met
 *  - Results are sorted by score descending
 *  - Intent fields boost relevant capability scores
 *  - No intent boost for unrelated capabilities
 *  - scoreToImportance: correct thresholds for each level
 *  - computeFrictionScore: 0 min = 1.0, high minutes → lower score
 *  - Solo business sees no team-related high-importance recommendations
 *  - F&B business with deferred payment → CREATE_ORDER recommended
 *  - Supplier added → MANAGE_SUPPLIERS recommended at high/critical importance
 */

import { describe, expect, it } from 'vitest'
import {
  DISMISS_COOLDOWN_DAYS,
  MAX_RECOMMENDATIONS,
  type CapabilityRecommendation,
  type CapabilityStateForScoring,
  type RecommendationEngineInput,
  computeRecommendations,
  scoreToImportance,
} from '@/lib/evolution/recommendation-engine'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'
import type { BusinessCharacteristics, CapabilityDefinition } from '@/lib/onboarding/types'

const NOW = new Date('2026-08-04T12:00:00Z')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chars(overrides: Partial<BusinessCharacteristics> = {}): BusinessCharacteristics {
  return { ...DEFAULT_CHARACTERISTICS, ...overrides }
}

function state(
  capabilityId: string,
  s: CapabilityStateForScoring['state'] = 'HIDDEN',
  dismissedAt: Date | null = null,
): CapabilityStateForScoring {
  return { capabilityId, state: s, dismissedAt }
}

function input(
  characteristicsOverrides: Partial<BusinessCharacteristics> = {},
  capabilityStates: CapabilityStateForScoring[] = [],
  now = NOW,
): RecommendationEngineInput {
  return {
    characteristics: chars(characteristicsOverrides),
    capabilityStates,
    now,
  }
}
function makeCap(
  id: string,
  overrides: Partial<CapabilityDefinition> = {},
): CapabilityDefinition {
  return {
    id,
    label: id,
    description: `${id} description`,
    category: 'SALES',
    required: () => true,
    boosters: [{ label: 'always fires', signal: () => 1.0 }],
    threshold: 0.5,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: `${id} value`,
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0.8,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Basic cases
// ---------------------------------------------------------------------------

describe('computeRecommendations — basic cases', () => {
  it('returns empty array when no registry entries qualify', () => {
    const registry = [makeCap('CAP_A', { required: () => false })]
    const result = computeRecommendations(input(), registry as CapabilityDefinition[])
    expect(result).toHaveLength(0)
  })

  it('excludes capabilities that fail required() gate', () => {
    const registry = [makeCap('CAP_A', { required: () => false })]
    const result = computeRecommendations(input(), registry as CapabilityDefinition[])
    expect(result).toHaveLength(0)
  })

  it('includes capabilities that pass required() gate', () => {
    const registry = [makeCap('CAP_A', { required: () => true })]
    const result = computeRecommendations(input(), registry as CapabilityDefinition[])
    expect(result).toHaveLength(1)
    expect(result[0]?.capabilityId).toBe('CAP_A')
  })

  it('returns results sorted by score descending', () => {
    const registry = [
      makeCap('LOW_SCORE', { recommendationScore: () => 0.2, estimatedSetupMinutes: 90 }),
      makeCap('HIGH_SCORE', { recommendationScore: () => 0.9, estimatedSetupMinutes: 5 }),
      makeCap('MID_SCORE', { recommendationScore: () => 0.5, estimatedSetupMinutes: 15 }),
    ]
    const result = computeRecommendations(input(), registry as CapabilityDefinition[])
    expect(result[0]?.capabilityId).toBe('HIGH_SCORE')
    expect(result[1]?.capabilityId).toBe('MID_SCORE')
    expect(result[2]?.capabilityId).toBe('LOW_SCORE')
  })
})

// ---------------------------------------------------------------------------
// Always-on exclusion
// ---------------------------------------------------------------------------

describe('computeRecommendations — always-on exclusion', () => {
  it('excludes always-on capabilities (no boosters, threshold=0, not deferrable)', () => {
    const alwaysOnCap = makeCap('ALWAYS_ON', {
      boosters: [],
      threshold: 0,
      deferrable: false,
      required: () => true,
    })
    const result = computeRecommendations(input(), [alwaysOnCap] as CapabilityDefinition[])
    expect(result).toHaveLength(0)
  })

  it('includes a deferrable cap with threshold=0 (not always-on)', () => {
    const deferrableCap = makeCap('DEFERRABLE', {
      boosters: [],
      threshold: 0,
      deferrable: true,
      required: () => true,
    })
    const result = computeRecommendations(input(), [deferrableCap] as CapabilityDefinition[])
    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// State exclusion
// ---------------------------------------------------------------------------

describe('computeRecommendations — state-based exclusion', () => {
  const capId = 'TEST_CAP'
  const registry = [makeCap(capId)] as CapabilityDefinition[]

  const excludedStates: CapabilityStateForScoring['state'][] = [
    'ENABLED', 'CONFIGURED', 'PAUSED', 'DEPRECATED',
  ]

  for (const s of excludedStates) {
    it(`excludes capability in state ${s}`, () => {
      const result = computeRecommendations(
        input({}, [state(capId, s)]),
        registry,
      )
      expect(result).toHaveLength(0)
    })
  }

  it('includes capability in state HIDDEN', () => {
    const result = computeRecommendations(
      input({}, [state(capId, 'HIDDEN')]),
      registry,
    )
    expect(result).toHaveLength(1)
  })

  it('includes capability in state RECOMMENDED', () => {
    const result = computeRecommendations(
      input({}, [state(capId, 'RECOMMENDED')]),
      registry,
    )
    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Dismiss cooldown
// ---------------------------------------------------------------------------

describe('computeRecommendations — dismiss cooldown', () => {
  const capId = 'TEST_CAP'
  const registry = [makeCap(capId)] as CapabilityDefinition[]

  it('excludes capability dismissed 10 days ago (within 30-day cooldown)', () => {
    const recentDismiss = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000)
    const result = computeRecommendations(
      input({}, [state(capId, 'HIDDEN', recentDismiss)]),
      registry,
    )
    expect(result).toHaveLength(0)
  })

  it('excludes capability dismissed exactly 29 days ago (still in cooldown)', () => {
    const dismissedAt = new Date(NOW.getTime() - 29 * 24 * 60 * 60 * 1000)
    const result = computeRecommendations(
      input({}, [state(capId, 'HIDDEN', dismissedAt)]),
      registry,
    )
    expect(result).toHaveLength(0)
  })

  it('includes capability dismissed exactly 31 days ago (past cooldown)', () => {
    const oldDismiss = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000)
    const result = computeRecommendations(
      input({}, [state(capId, 'HIDDEN', oldDismiss)]),
      registry,
    )
    expect(result).toHaveLength(1)
  })

  it('DISMISS_COOLDOWN_DAYS constant is 30', () => {
    expect(DISMISS_COOLDOWN_DAYS).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// Hard dependencies
// ---------------------------------------------------------------------------

describe('computeRecommendations — hard dependencies', () => {
  it('excludes capability when hard dependency is not ENABLED', () => {
    const dep = makeCap('DEP')
    const cap = makeCap('DEPENDENT', { hardDependencies: ['DEP'] })
    const result = computeRecommendations(
      input({}, [state('DEP', 'HIDDEN'), state('DEPENDENT', 'HIDDEN')]),
      [dep, cap] as CapabilityDefinition[],
    )
    expect(result.some((r) => r.capabilityId === 'DEPENDENT')).toBe(false)
    expect(result.some((r) => r.capabilityId === 'DEP')).toBe(true)
  })

  it('includes capability when hard dependency IS ENABLED', () => {
    const dep = makeCap('DEP')
    const cap = makeCap('DEPENDENT', { hardDependencies: ['DEP'] })
    const result = computeRecommendations(
      input({}, [state('DEP', 'ENABLED'), state('DEPENDENT', 'HIDDEN')]),
      [dep, cap] as CapabilityDefinition[],
    )
    expect(result.some((r) => r.capabilityId === 'DEPENDENT')).toBe(true)
  })

  it('includes capability when hard dependency is CONFIGURED', () => {
    const dep = makeCap('DEP')
    const cap = makeCap('DEPENDENT', { hardDependencies: ['DEP'] })
    const result = computeRecommendations(
      input({}, [state('DEP', 'CONFIGURED'), state('DEPENDENT', 'HIDDEN')]),
      [dep, cap] as CapabilityDefinition[],
    )
    expect(result.some((r) => r.capabilityId === 'DEPENDENT')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// MAX_RECOMMENDATIONS cap
// ---------------------------------------------------------------------------

describe('computeRecommendations — 5-recommendation cap', () => {
  it('returns at most MAX_RECOMMENDATIONS (5) results', () => {
    const registry = Array.from({ length: 10 }, (_, i) =>
      makeCap(`CAP_${i}`, { recommendationScore: () => Math.random() }),
    )
    const result = computeRecommendations(input(), registry as CapabilityDefinition[])
    expect(result.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS)
  })

  it('MAX_RECOMMENDATIONS constant is 5', () => {
    expect(MAX_RECOMMENDATIONS).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Intent field boosts
// ---------------------------------------------------------------------------

describe('computeRecommendations — intent field boosts', () => {
  it('intentToManageSuppliers boosts MANAGE_SUPPLIERS score', () => {
    const withIntent = computeRecommendations(
      input({ intentToManageSuppliers: true, usesSuppliers: true }),
    )
    const withoutIntent = computeRecommendations(
      input({ intentToManageSuppliers: false, usesSuppliers: true }),
    )

    const withScore = withIntent.find((r) => r.capabilityId === 'MANAGE_SUPPLIERS')?.score ?? 0
    const withoutScore = withoutIntent.find((r) => r.capabilityId === 'MANAGE_SUPPLIERS')?.score ?? 0

    // Intent should produce a higher score
    expect(withScore).toBeGreaterThan(withoutScore)
  })

  it('intentToOpenMoreLocations boosts MANAGE_BRANCHES score', () => {
    const withIntent = computeRecommendations(
      input({ intentToOpenMoreLocations: true, plansExpansion: true }),
    )
    const withoutIntent = computeRecommendations(
      input({ intentToOpenMoreLocations: false, plansExpansion: true }),
    )

    const withScore = withIntent.find((r) => r.capabilityId === 'MANAGE_BRANCHES')?.score ?? 0
    const withoutScore = withoutIntent.find((r) => r.capabilityId === 'MANAGE_BRANCHES')?.score ?? 0

    expect(withScore).toBeGreaterThan(withoutScore)
  })

  it('intent for delivery does not boost unrelated capabilities', () => {
    const registry = [
      makeCap('MANAGE_INVENTORY', { category: 'INVENTORY', recommendationScore: () => 0.7 }),
    ]
    const withDeliveryIntent = computeRecommendations(
      input({ intentToOfferDelivery: true }),
      registry as CapabilityDefinition[],
    )
    const withoutDeliveryIntent = computeRecommendations(
      input({ intentToOfferDelivery: false }),
      registry as CapabilityDefinition[],
    )

    // Scores should be equal — no boost for unrelated cap
    expect(withDeliveryIntent[0]?.scoreBreakdown.growth).toBe(
      withoutDeliveryIntent[0]?.scoreBreakdown.growth,
    )
  })
})

// ---------------------------------------------------------------------------
// scoreToImportance
// ---------------------------------------------------------------------------

describe('scoreToImportance', () => {
  it('≥ 0.75 → critical', () => {
    expect(scoreToImportance(0.75)).toBe('critical')
    expect(scoreToImportance(0.9)).toBe('critical')
    expect(scoreToImportance(1.0)).toBe('critical')
  })

  it('0.55–0.749 → high', () => {
    expect(scoreToImportance(0.55)).toBe('high')
    expect(scoreToImportance(0.65)).toBe('high')
    expect(scoreToImportance(0.749)).toBe('high')
  })

  it('0.35–0.549 → medium', () => {
    expect(scoreToImportance(0.35)).toBe('medium')
    expect(scoreToImportance(0.45)).toBe('medium')
    expect(scoreToImportance(0.549)).toBe('medium')
  })

  it('< 0.35 → low', () => {
    expect(scoreToImportance(0.34)).toBe('low')
    expect(scoreToImportance(0.1)).toBe('low')
    expect(scoreToImportance(0)).toBe('low')
  })
})

// ---------------------------------------------------------------------------
// Friction score behaviour
// ---------------------------------------------------------------------------

describe('friction score in scoreBreakdown', () => {
  it('0-minute setup → friction = 1.0', () => {
    const registry = [makeCap('INSTANT', { estimatedSetupMinutes: 0, recommendationScore: () => 0.8 })]
    const result = computeRecommendations(input(), registry as CapabilityDefinition[])
    expect(result[0]?.scoreBreakdown.friction).toBe(1.0)
  })

  it('120-minute setup → friction significantly lower than 5-minute setup', () => {
    const registry = [
      makeCap('QUICK', { estimatedSetupMinutes: 5, recommendationScore: () => 0.8 }),
      makeCap('SLOW', { estimatedSetupMinutes: 120, recommendationScore: () => 0.8 }),
    ]
    const result = computeRecommendations(input(), registry as CapabilityDefinition[])
    const quick = result.find((r) => r.capabilityId === 'QUICK')
    const slow = result.find((r) => r.capabilityId === 'SLOW')
    expect(quick!.scoreBreakdown.friction).toBeGreaterThan(slow!.scoreBreakdown.friction)
  })
})

// ---------------------------------------------------------------------------
// Business scenario: solo business
// ---------------------------------------------------------------------------

describe('computeRecommendations — solo business', () => {
  it('solo + immediate payment → CREATE_ORDER not recommended (required gate fails)', () => {
    const result = computeRecommendations(
      input({ teamSize: 'solo', paymentTiming: 'immediate' }),
    )
    expect(result.some((r) => r.capabilityId === 'CREATE_ORDER')).toBe(false)
  })

  it('solo → CREATE_TASK not recommended (teamSize=solo fails required gate)', () => {
    const result = computeRecommendations(
      input({ teamSize: 'solo', usesOperationalTasks: false }),
    )
    expect(result.some((r) => r.capabilityId === 'CREATE_TASK')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Business scenario: F&B with deferred payment
// ---------------------------------------------------------------------------

describe('computeRecommendations — F&B business', () => {
  // Provide COMPLETE_CHECKOUT as ENABLED (it's always on — would be seeded at registration)
  const baseStates = [state('COMPLETE_CHECKOUT', 'ENABLED')]

  it('deferred payment → CREATE_ORDER is recommended', () => {
    const result = computeRecommendations(
      input({
        sellsPreparedFood: true,
        paymentTiming: 'deferred',
        requiresTableManagement: true,
        hasOrderCustomization: true,
      }, baseStates),
    )
    expect(result.some((r) => r.capabilityId === 'CREATE_ORDER')).toBe(true)
  })

  it('CREATE_ORDER recommendation has high or critical importance for a restaurant', () => {
    const result = computeRecommendations(
      input({
        sellsPreparedFood: true,
        paymentTiming: 'deferred',
        requiresTableManagement: true,
        hasOrderCustomization: true,
      }, baseStates),
    )
    const rec = result.find((r) => r.capabilityId === 'CREATE_ORDER')
    expect(['high', 'critical']).toContain(rec?.importance)
  })
})

// ---------------------------------------------------------------------------
// Business scenario: supplier added
// ---------------------------------------------------------------------------

describe('computeRecommendations — supplier context', () => {
  it('usesSuppliers=true → MANAGE_SUPPLIERS is recommended', () => {
    const result = computeRecommendations(
      input({ usesSuppliers: true }),
    )
    expect(result.some((r) => r.capabilityId === 'MANAGE_SUPPLIERS')).toBe(true)
  })

  it('MANAGE_SUPPLIERS has a reason string', () => {
    const result = computeRecommendations(
      input({ usesSuppliers: true }),
    )
    const rec = result.find((r) => r.capabilityId === 'MANAGE_SUPPLIERS')
    expect(rec?.reason).toBeTruthy()
    expect(typeof rec?.reason).toBe('string')
    expect(rec!.reason.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Recommendation shape
// ---------------------------------------------------------------------------

describe('computeRecommendations — output shape', () => {
  it('every recommendation has required fields', () => {
    const result = computeRecommendations(
      input({ usesSuppliers: true }),
    )
    for (const rec of result) {
      expect(typeof rec.capabilityId).toBe('string')
      expect(typeof rec.score).toBe('number')
      expect(['low', 'medium', 'high', 'critical']).toContain(rec.importance)
      expect(typeof rec.businessValue).toBe('string')
      expect(typeof rec.estimatedSetupMinutes).toBe('number')
      expect(typeof rec.isComplex).toBe('boolean')
      expect(typeof rec.reason).toBe('string')
      expect(typeof rec.scoreBreakdown).toBe('object')
    }
  })

  it('every score is between 0 and 1', () => {
    const result = computeRecommendations(
      input({ usesSuppliers: true, tracksInventory: true }),
    )
    for (const rec of result) {
      expect(rec.score).toBeGreaterThan(0)
      expect(rec.score).toBeLessThanOrEqual(1)
    }
  })
})
