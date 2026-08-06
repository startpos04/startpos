/**
 * capability-resolver.test.ts — Pattern A unit tests for CapabilityResolver
 *
 * Coverage:
 *  - required()=false → NOT_APPLICABLE
 *  - required()=true, no boosters → ENABLED with confidence=1.0
 *  - required()=true, boosters ≥ threshold → ENABLED
 *  - required()=true, boosters < threshold, deferrable=true → DEFERRED
 *  - required()=true, boosters < threshold, deferrable=false → NOT_APPLICABLE
 *  - ENABLED capabilities include outputs
 *  - DEFERRED capabilities include empty outputs but populated rollbackOutputs
 *  - collectOutputs deduplicates by key (last write wins)
 *  - computeConfidence: average of booster signal values
 *  - getEnabledCapabilities filters correctly
 *  - getDeferredCapabilities filters correctly
 *  - resolveCapabilities processes a full registry
 */

import { describe, expect, it } from 'vitest'
import {
  collectOutputs,
  computeConfidence,
  getDeferredCapabilities,
  getEnabledCapabilities,
  resolveCapabilities,
  resolveOne,
} from '@/lib/onboarding/capability-resolver'
import type { BusinessCharacteristics, CapabilityDefinition } from '@/lib/onboarding/types'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'
import { CAPABILITY_REGISTRY } from '@/lib/onboarding/capability-registry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapability(overrides: Partial<CapabilityDefinition> & { id: string }): CapabilityDefinition {
  return {
    label: 'Test',
    description: 'Test',
    category: 'SALES',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: 'test',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
    ...overrides,
  }
}

const minimalChars: BusinessCharacteristics = { ...DEFAULT_CHARACTERISTICS }

// ---------------------------------------------------------------------------
// resolveOne — core resolution logic
// ---------------------------------------------------------------------------

describe('resolveOne — required gate', () => {
  it('required()=false → NOT_APPLICABLE regardless of boosters', () => {
    const cap = makeCapability({ id: 'CAP', required: () => false })
    const result = resolveOne(cap, minimalChars)
    expect(result.state).toBe('NOT_APPLICABLE')
    expect(result.confidence).toBe(0)
    expect(result.outputs).toEqual([])
  })

  it('required()=true with no boosters → ENABLED with confidence=1.0', () => {
    const cap = makeCapability({ id: 'CAP', required: () => true, boosters: [], threshold: 0 })
    const result = resolveOne(cap, minimalChars)
    expect(result.state).toBe('ENABLED')
    expect(result.confidence).toBe(1.0)
  })
})

describe('resolveOne — booster threshold logic', () => {
  it('average booster ≥ threshold → ENABLED', () => {
    const cap = makeCapability({
      id: 'CAP',
      required: () => true,
      boosters: [
        { label: 'A', signal: () => 0.8 },
        { label: 'B', signal: () => 0.6 },
      ],
      threshold: 0.5,
    })
    // avg = 0.7, threshold = 0.5 → ENABLED
    const result = resolveOne(cap, minimalChars)
    expect(result.state).toBe('ENABLED')
    expect(result.confidence).toBeCloseTo(0.7)
  })

  it('average booster < threshold + deferrable=true → DEFERRED', () => {
    const cap = makeCapability({
      id: 'CAP',
      required: () => true,
      boosters: [
        { label: 'A', signal: () => 0.1 },
        { label: 'B', signal: () => 0.2 },
      ],
      threshold: 0.5,
      deferrable: true,
    })
    // avg = 0.15, threshold = 0.5 → DEFERRED
    const result = resolveOne(cap, minimalChars)
    expect(result.state).toBe('DEFERRED')
    expect(result.confidence).toBeCloseTo(0.15)
  })

  it('average booster < threshold + deferrable=false → NOT_APPLICABLE', () => {
    const cap = makeCapability({
      id: 'CAP',
      required: () => true,
      boosters: [{ label: 'A', signal: () => 0.1 }],
      threshold: 0.5,
      deferrable: false,
    })
    const result = resolveOne(cap, minimalChars)
    expect(result.state).toBe('NOT_APPLICABLE')
  })
})

describe('resolveOne — outputs', () => {
  it('ENABLED capability includes outputs', () => {
    const cap = makeCapability({
      id: 'CAP',
      required: () => true,
      outputs: () => [{ key: 'ENABLE_FOO', value: 'true' }],
      rollbackOutputs: () => [{ key: 'ENABLE_FOO', value: 'false' }],
    })
    const result = resolveOne(cap, minimalChars)
    expect(result.state).toBe('ENABLED')
    expect(result.outputs).toEqual([{ key: 'ENABLE_FOO', value: 'true' }])
    expect(result.rollbackOutputs).toEqual([{ key: 'ENABLE_FOO', value: 'false' }])
  })

  it('DEFERRED capability has empty outputs but populated rollbackOutputs', () => {
    const cap = makeCapability({
      id: 'CAP',
      required: () => true,
      boosters: [{ label: 'A', signal: () => 0 }],
      threshold: 0.5,
      deferrable: true,
      outputs: () => [{ key: 'ENABLE_FOO', value: 'true' }],
      rollbackOutputs: () => [{ key: 'ENABLE_FOO', value: 'false' }],
    })
    const result = resolveOne(cap, minimalChars)
    expect(result.state).toBe('DEFERRED')
    expect(result.outputs).toEqual([]) // deferred = outputs not applied yet
    expect(result.rollbackOutputs).toEqual([{ key: 'ENABLE_FOO', value: 'false' }])
  })
})

// ---------------------------------------------------------------------------
// computeConfidence
// ---------------------------------------------------------------------------

describe('computeConfidence', () => {
  it('no boosters → confidence=1.0', () => {
    const cap = makeCapability({ id: 'CAP', boosters: [] })
    expect(computeConfidence(cap, minimalChars)).toBe(1.0)
  })

  it('single booster → confidence = booster value', () => {
    const cap = makeCapability({
      id: 'CAP',
      boosters: [{ label: 'A', signal: () => 0.75 }],
    })
    expect(computeConfidence(cap, minimalChars)).toBe(0.75)
  })

  it('multiple boosters → confidence = average', () => {
    const cap = makeCapability({
      id: 'CAP',
      boosters: [
        { label: 'A', signal: () => 1.0 },
        { label: 'B', signal: () => 0.0 },
        { label: 'C', signal: () => 0.5 },
      ],
    })
    expect(computeConfidence(cap, minimalChars)).toBeCloseTo(0.5)
  })

  it('booster signal is called with characteristics', () => {
    let calledWith: BusinessCharacteristics | null = null
    const cap = makeCapability({
      id: 'CAP',
      boosters: [{ label: 'A', signal: (c) => { calledWith = c; return 0.5 } }],
    })
    const chars = { ...minimalChars, teamSize: 'medium' as const }
    computeConfidence(cap, chars)
    expect(calledWith!.teamSize).toBe('medium')
  })
})

// ---------------------------------------------------------------------------
// collectOutputs
// ---------------------------------------------------------------------------

describe('collectOutputs', () => {
  it('collects outputs from all ENABLED capabilities', () => {
    const resolved = [
      { id: 'A', state: 'ENABLED' as const, confidence: 1, outputs: [{ key: 'KEY_A', value: 'true' }], rollbackOutputs: [] },
      { id: 'B', state: 'ENABLED' as const, confidence: 1, outputs: [{ key: 'KEY_B', value: 'false' }], rollbackOutputs: [] },
    ]
    const outputs = collectOutputs(resolved)
    expect(outputs).toContainEqual({ key: 'KEY_A', value: 'true' })
    expect(outputs).toContainEqual({ key: 'KEY_B', value: 'false' })
  })

  it('ignores DEFERRED and NOT_APPLICABLE capabilities', () => {
    const resolved = [
      { id: 'A', state: 'DEFERRED' as const, confidence: 0.3, outputs: [{ key: 'KEY_A', value: 'true' }], rollbackOutputs: [] },
      { id: 'B', state: 'NOT_APPLICABLE' as const, confidence: 0, outputs: [{ key: 'KEY_B', value: 'true' }], rollbackOutputs: [] },
    ]
    expect(collectOutputs(resolved)).toEqual([])
  })

  it('deduplicates by key — last write wins', () => {
    const resolved = [
      { id: 'A', state: 'ENABLED' as const, confidence: 1, outputs: [{ key: 'PRICE_CONFIG', value: 'EXCLUSIVE' }], rollbackOutputs: [] },
      { id: 'B', state: 'ENABLED' as const, confidence: 1, outputs: [{ key: 'PRICE_CONFIG', value: 'INCLUSIVE' }], rollbackOutputs: [] },
    ]
    const outputs = collectOutputs(resolved)
    const priceConfig = outputs.find((o) => o.key === 'PRICE_CONFIG')
    expect(priceConfig?.value).toBe('INCLUSIVE')
    expect(outputs.filter((o) => o.key === 'PRICE_CONFIG')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// getEnabledCapabilities / getDeferredCapabilities
// ---------------------------------------------------------------------------

describe('getEnabledCapabilities / getDeferredCapabilities', () => {
  const resolved = [
    { id: 'E1', state: 'ENABLED' as const, confidence: 1, outputs: [], rollbackOutputs: [] },
    { id: 'D1', state: 'DEFERRED' as const, confidence: 0.3, outputs: [], rollbackOutputs: [] },
    { id: 'N1', state: 'NOT_APPLICABLE' as const, confidence: 0, outputs: [], rollbackOutputs: [] },
    { id: 'E2', state: 'ENABLED' as const, confidence: 0.9, outputs: [], rollbackOutputs: [] },
  ]

  it('getEnabledCapabilities returns only ENABLED entries', () => {
    const enabled = getEnabledCapabilities(resolved)
    expect(enabled).toHaveLength(2)
    expect(enabled.map((r) => r.id)).toEqual(['E1', 'E2'])
  })

  it('getDeferredCapabilities returns only DEFERRED entries', () => {
    const deferred = getDeferredCapabilities(resolved)
    expect(deferred).toHaveLength(1)
    expect(deferred[0]!.id).toBe('D1')
  })
})

// ---------------------------------------------------------------------------
// resolveCapabilities — full registry smoke test
// ---------------------------------------------------------------------------

describe('resolveCapabilities — full registry with safe defaults', () => {
  it('returns a result for every capability in the registry', () => {
    const results = resolveCapabilities(DEFAULT_CHARACTERISTICS, CAPABILITY_REGISTRY)
    expect(results).toHaveLength(CAPABILITY_REGISTRY.length)
  })

  it('always-on capabilities (no boosters) are ENABLED for any characteristics', () => {
    const results = resolveCapabilities(DEFAULT_CHARACTERISTICS, CAPABILITY_REGISTRY)
    const alwaysOn = CAPABILITY_REGISTRY.filter((c) => c.boosters.length === 0 && c.threshold === 0)
    for (const cap of alwaysOn) {
      const resolved = results.find((r) => r.id === cap.id)
      expect(resolved?.state, `${cap.id} should be ENABLED for any business`).toBe('ENABLED')
    }
  })

  it('solo + immediate + no inventory → CREATE_ORDER is DEFERRED or NOT_APPLICABLE', () => {
    const chars: BusinessCharacteristics = {
      ...DEFAULT_CHARACTERISTICS,
      teamSize: 'solo',
      paymentTiming: 'immediate',
      tracksInventory: false,
      usesSuppliers: false,
    }
    const results = resolveCapabilities(chars, CAPABILITY_REGISTRY)
    const orderResult = results.find((r) => r.id === 'CREATE_ORDER')
    // immediate payment → required() = false → NOT_APPLICABLE
    expect(orderResult?.state).toBe('NOT_APPLICABLE')
  })

  it('restaurant path → CREATE_ORDER is ENABLED', () => {
    const chars: BusinessCharacteristics = {
      ...DEFAULT_CHARACTERISTICS,
      sellsPreparedFood: true,
      paymentTiming: 'deferred',
      requiresTableManagement: true,
      hasOrderCustomization: true,
    }
    const results = resolveCapabilities(chars, CAPABILITY_REGISTRY)
    const orderResult = results.find((r) => r.id === 'CREATE_ORDER')
    expect(orderResult?.state).toBe('ENABLED')
  })
})
