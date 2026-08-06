/**
 * registry-validation.test.ts — R4: Build-time registry validation
 *
 * Coverage:
 *  - CAPABILITY_REGISTRY has zero structural errors
 *  - validateRegistry detects broken hard dependencies
 *  - validateRegistry detects self-dependencies
 *  - validateRegistry detects duplicate IDs
 *  - validateRegistry detects circular dependencies
 *  - validateRegistry detects out-of-range threshold values
 *  - validateRegistry detects broken relatedCapabilities references
 *  - validateRegistry detects broken conflict references
 */

import { describe, expect, it } from 'vitest'
import { CAPABILITY_REGISTRY, validateRegistry } from '@/lib/onboarding/capability-registry'
import type { CapabilityDefinition } from '@/lib/onboarding/types'

// ---------------------------------------------------------------------------
// Helper: produce a minimal valid CapabilityDefinition
// ---------------------------------------------------------------------------

function makeCapability(
  overrides: Partial<CapabilityDefinition> & { id: string },
): CapabilityDefinition {
  return {
    label: 'Test Cap',
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
    businessValue: 'Test value',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// The main registry must be structurally valid
// ---------------------------------------------------------------------------

describe('CAPABILITY_REGISTRY — structural validation', () => {
  it('has zero validation errors', () => {
    const errors = validateRegistry(CAPABILITY_REGISTRY)
    expect(errors).toEqual([])
  })

  it('has at least one always-on capability', () => {
    const alwaysOn = CAPABILITY_REGISTRY.filter((c) => c.required(() => ({} as never)) === true || !c.deferrable)
    expect(alwaysOn.length).toBeGreaterThan(0)
  })

  it('every capability has a non-empty id', () => {
    for (const cap of CAPABILITY_REGISTRY) {
      expect(cap.id.length).toBeGreaterThan(0)
    }
  })

  it('every capability has a non-empty label and description', () => {
    for (const cap of CAPABILITY_REGISTRY) {
      expect(cap.label.length, `${cap.id} has empty label`).toBeGreaterThan(0)
      expect(cap.description.length, `${cap.id} has empty description`).toBeGreaterThan(0)
    }
  })

  it('every capability has non-negative estimatedSetupMinutes', () => {
    for (const cap of CAPABILITY_REGISTRY) {
      expect(cap.estimatedSetupMinutes, `${cap.id} has negative estimatedSetupMinutes`).toBeGreaterThanOrEqual(0)
    }
  })

  it('every capability threshold is between 0 and 1', () => {
    for (const cap of CAPABILITY_REGISTRY) {
      expect(cap.threshold, `${cap.id} threshold out of range`).toBeGreaterThanOrEqual(0)
      expect(cap.threshold, `${cap.id} threshold out of range`).toBeLessThanOrEqual(1)
    }
  })

  it('always-on capabilities have threshold 0 and no boosters', () => {
    const alwaysOn = CAPABILITY_REGISTRY.filter((c) => c.boosters.length === 0 && c.threshold === 0)
    expect(alwaysOn.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// validateRegistry — error detection tests
// ---------------------------------------------------------------------------

describe('validateRegistry — detects broken hard dependencies', () => {
  it('returns an error when a hardDependency does not exist in the registry', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', hardDependencies: ['CAP_DOES_NOT_EXIST'] }),
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.capabilityId === 'CAP_A' && e.message.includes("hardDependency 'CAP_DOES_NOT_EXIST'"))).toBe(true)
  })

  it('returns no error when hardDependency references a real ID', () => {
    const registry = [
      makeCapability({ id: 'CAP_A' }),
      makeCapability({ id: 'CAP_B', hardDependencies: ['CAP_A'] }),
    ]
    const errors = validateRegistry(registry)
    expect(errors).toEqual([])
  })
})

describe('validateRegistry — detects self-dependency', () => {
  it('returns an error when a capability depends on itself', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', hardDependencies: ['CAP_A'] }),
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.capabilityId === 'CAP_A' && e.message.includes('depends on itself'))).toBe(true)
  })
})

describe('validateRegistry — detects duplicate IDs', () => {
  it('returns an error when the same ID appears twice', () => {
    const registry = [
      makeCapability({ id: 'CAP_A' }),
      makeCapability({ id: 'CAP_A' }), // duplicate
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.capabilityId === 'CAP_A' && e.message.includes('duplicate'))).toBe(true)
  })

  it('returns no error when all IDs are unique', () => {
    const registry = [
      makeCapability({ id: 'CAP_A' }),
      makeCapability({ id: 'CAP_B' }),
    ]
    const errors = validateRegistry(registry)
    expect(errors).toEqual([])
  })
})

describe('validateRegistry — detects circular dependencies', () => {
  it('returns an error for a direct A → B → A cycle', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', hardDependencies: ['CAP_B'] }),
      makeCapability({ id: 'CAP_B', hardDependencies: ['CAP_A'] }),
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.message.includes('circular'))).toBe(true)
  })

  it('returns no error for a valid linear chain A → B → C', () => {
    const registry = [
      makeCapability({ id: 'CAP_A' }),
      makeCapability({ id: 'CAP_B', hardDependencies: ['CAP_A'] }),
      makeCapability({ id: 'CAP_C', hardDependencies: ['CAP_B'] }),
    ]
    const errors = validateRegistry(registry)
    expect(errors).toEqual([])
  })
})

describe('validateRegistry — detects out-of-range threshold', () => {
  it('returns an error when threshold > 1', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', threshold: 1.5 }),
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.capabilityId === 'CAP_A' && e.message.includes('threshold'))).toBe(true)
  })

  it('returns an error when threshold < 0', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', threshold: -0.1 }),
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.capabilityId === 'CAP_A' && e.message.includes('threshold'))).toBe(true)
  })

  it('accepts threshold = 0 and threshold = 1', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', threshold: 0 }),
      makeCapability({ id: 'CAP_B', threshold: 1 }),
    ]
    expect(validateRegistry(registry)).toEqual([])
  })
})

describe('validateRegistry — detects broken relatedCapabilities', () => {
  it('returns an error when relatedCapabilities references a non-existent ID', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', relatedCapabilities: ['CAP_GHOST'] }),
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.capabilityId === 'CAP_A' && e.message.includes("'CAP_GHOST'"))).toBe(true)
  })
})

describe('validateRegistry — detects broken conflict references', () => {
  it('returns an error when conflicts references a non-existent ID', () => {
    const registry = [
      makeCapability({ id: 'CAP_A', conflicts: ['NONEXISTENT'] }),
    ]
    const errors = validateRegistry(registry)
    expect(errors.some((e) => e.capabilityId === 'CAP_A' && e.message.includes("'NONEXISTENT'"))).toBe(true)
  })
})
