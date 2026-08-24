/**
 * configuration-engine.test.ts — Pattern A unit tests for ConfigurationEngine
 *
 * Coverage:
 *  - Safe defaults produce a LITE_POS config (EXCLUSIVE pricing)
 *  - F&B profile + VAT registered → INCLUSIVE pricing override
 *  - Wholesale profile → EXCLUSIVE pricing override
 *  - VAT registered → IS_VAT_REGISTERED=true in output
 *  - enabledCapabilities list matches ENABLED resolved capabilities
 *  - deferredCapabilities list matches DEFERRED resolved capabilities
 *  - operationalProfile is preserved in output
 *  - summarizeConfiguration returns readable summary
 */

import { describe, expect, it } from 'vitest'
import { buildConfiguration, summarizeConfiguration } from '@/lib/onboarding/configuration-engine'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'
import type { BusinessCharacteristics, ResolvedCapability } from '@/lib/onboarding/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chars(overrides: Partial<BusinessCharacteristics> = {}): BusinessCharacteristics {
  return { ...DEFAULT_CHARACTERISTICS, ...overrides }
}

function enabled(id: string, outputs: Array<{ key: string; value: string }> = []): ResolvedCapability {
  return { id, state: 'ENABLED', confidence: 1, outputs, rollbackOutputs: [] }
}

function deferred(id: string): ResolvedCapability {
  return { id, state: 'DEFERRED', confidence: 0.3, outputs: [], rollbackOutputs: [] }
}

function notApplicable(id: string): ResolvedCapability {
  return { id, state: 'NOT_APPLICABLE', confidence: 0, outputs: [], rollbackOutputs: [] }
}

// ---------------------------------------------------------------------------
// Safe defaults (LITE_POS config)
// ---------------------------------------------------------------------------

describe('buildConfiguration — safe defaults', () => {
  it('produces EXCLUSIVE pricing when no VAT signal', () => {
    const config = buildConfiguration(chars(), [], 'LITE_POS')
    const price = config.systemConfigs.find((c) => c.key === 'PRICE_CONFIGURATION')
    expect(price?.value).toBe('EXCLUSIVE')
  })

  it('produces IS_VAT_REGISTERED=false when not VAT registered', () => {
    const config = buildConfiguration(chars({ isVatRegistered: false }), [], 'LITE_POS')
    const vat = config.systemConfigs.find((c) => c.key === 'IS_VAT_REGISTERED')
    expect(vat?.value).toBe('false')
  })

  it('returns LITE_POS as operationalProfile', () => {
    const config = buildConfiguration(chars(), [], 'LITE_POS')
    expect(config.operationalProfile).toBe('LITE_POS')
  })

  it('empty resolved → no enabled or deferred capabilities', () => {
    const config = buildConfiguration(chars(), [], 'LITE_POS')
    expect(config.enabledCapabilities).toEqual([])
    expect(config.deferredCapabilities).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Capability outputs applied
// ---------------------------------------------------------------------------

describe('buildConfiguration — capability outputs', () => {
  it('ENABLED capability output is written to systemConfigs', () => {
    const resolved = [
      enabled('CREATE_ORDER', [{ key: 'SOME_CONFIG_KEY', value: 'true' }]),
    ]
    const config = buildConfiguration(chars({ paymentTiming: 'deferred' }), resolved, 'FOOD_AND_BEVERAGE')
    const someConfig = config.systemConfigs.find((c) => c.key === 'SOME_CONFIG_KEY')
    expect(someConfig?.value).toBe('true')
  })

  it('DEFERRED capability does not write outputs', () => {
    const resolved = [
      deferred('CREATE_ORDER'),
    ]
    const config = buildConfiguration(chars(), resolved, 'LITE_POS')
    // No capability-specific configs should be written for DEFERRED
    expect(config.systemConfigs.every(c => c.key === 'PRICE_CONFIGURATION' || c.key === 'IS_VAT_REGISTERED')).toBe(true)
  })

  it('NOT_APPLICABLE capability does not write outputs', () => {
    const resolved = [notApplicable('CREATE_ORDER')]
    const config = buildConfiguration(chars(), resolved, 'LITE_POS')
    // Only operational configs should exist
    expect(config.systemConfigs.every(c => c.key === 'PRICE_CONFIGURATION' || c.key === 'IS_VAT_REGISTERED')).toBe(true)
  })

  it('enabledCapabilities lists only ENABLED ids', () => {
    const resolved = [
      enabled('COMPLETE_CHECKOUT'),
      deferred('CREATE_ORDER'),
      notApplicable('MANAGE_INVENTORY'),
    ]
    const config = buildConfiguration(chars(), resolved, 'GENERAL')
    expect(config.enabledCapabilities).toContain('COMPLETE_CHECKOUT')
    expect(config.enabledCapabilities).not.toContain('CREATE_ORDER')
    expect(config.enabledCapabilities).not.toContain('MANAGE_INVENTORY')
  })

  it('deferredCapabilities lists only DEFERRED ids', () => {
    const resolved = [
      enabled('COMPLETE_CHECKOUT'),
      deferred('MANAGE_INVENTORY'),
      deferred('CREATE_PURCHASE'),
    ]
    const config = buildConfiguration(chars(), resolved, 'LITE_POS')
    expect(config.deferredCapabilities).toContain('MANAGE_INVENTORY')
    expect(config.deferredCapabilities).toContain('CREATE_PURCHASE')
    expect(config.deferredCapabilities).not.toContain('COMPLETE_CHECKOUT')
  })
})

// ---------------------------------------------------------------------------
// Profile-level overrides
// ---------------------------------------------------------------------------

describe('buildConfiguration — profile overrides', () => {
  it('F&B profile + VAT registered → INCLUSIVE pricing', () => {
    const config = buildConfiguration(
      chars({ isVatRegistered: true, taxDisplayMode: 'inclusive' }),
      [],
      'FOOD_AND_BEVERAGE',
    )
    const price = config.systemConfigs.find((c) => c.key === 'PRICE_CONFIGURATION')
    expect(price?.value).toBe('INCLUSIVE')
  })

  it('F&B profile without VAT → keeps EXCLUSIVE pricing (no VAT = no inclusive)', () => {
    const config = buildConfiguration(
      chars({ isVatRegistered: false }),
      [],
      'FOOD_AND_BEVERAGE',
    )
    const price = config.systemConfigs.find((c) => c.key === 'PRICE_CONFIGURATION')
    expect(price?.value).toBe('EXCLUSIVE')
  })

  it('WHOLESALE_DISTRIBUTION → forces EXCLUSIVE pricing even if capability output says INCLUSIVE', () => {
    const resolved = [
      enabled('SOME_CAP', [{ key: 'PRICE_CONFIGURATION', value: 'INCLUSIVE' }]),
    ]
    const config = buildConfiguration(chars(), resolved, 'WHOLESALE_DISTRIBUTION')
    const price = config.systemConfigs.find((c) => c.key === 'PRICE_CONFIGURATION')
    expect(price?.value).toBe('EXCLUSIVE')
  })

  it('VAT registered + inclusive taxDisplayMode → INCLUSIVE + IS_VAT_REGISTERED=true', () => {
    const config = buildConfiguration(
      chars({ isVatRegistered: true, taxDisplayMode: 'inclusive' }),
      [],
      'GENERAL',
    )
    const price = config.systemConfigs.find((c) => c.key === 'PRICE_CONFIGURATION')
    const vat = config.systemConfigs.find((c) => c.key === 'IS_VAT_REGISTERED')
    expect(price?.value).toBe('INCLUSIVE')
    expect(vat?.value).toBe('true')
  })

  it('VAT registered + exclusive taxDisplayMode → EXCLUSIVE + IS_VAT_REGISTERED=true', () => {
    const config = buildConfiguration(
      chars({ isVatRegistered: true, taxDisplayMode: 'exclusive' }),
      [],
      'GENERAL',
    )
    const price = config.systemConfigs.find((c) => c.key === 'PRICE_CONFIGURATION')
    const vat = config.systemConfigs.find((c) => c.key === 'IS_VAT_REGISTERED')
    expect(price?.value).toBe('EXCLUSIVE')
    expect(vat?.value).toBe('true')
  })
})

// ---------------------------------------------------------------------------
// summarizeConfiguration
// ---------------------------------------------------------------------------

describe('summarizeConfiguration', () => {
  it('returns profile and capability lists', () => {
    const config = buildConfiguration(
      chars(),
      [enabled('COMPLETE_CHECKOUT'), deferred('MANAGE_INVENTORY')],
      'LITE_POS',
    )
    const summary = summarizeConfiguration(config)
    expect(summary.profile).toBe('LITE_POS')
    expect((summary.enabledCapabilities as string[]).includes('COMPLETE_CHECKOUT')).toBe(true)
    expect((summary.deferredCapabilities as string[]).includes('MANAGE_INVENTORY')).toBe(true)
  })
})
