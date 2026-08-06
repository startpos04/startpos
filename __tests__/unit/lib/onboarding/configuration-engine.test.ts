/**
 * configuration-engine.test.ts — Pattern A unit tests for ConfigurationEngine
 *
 * Coverage:
 *  - Safe defaults produce a LITE_POS config (all features off, EXCLUSIVE pricing)
 *  - F&B profile + VAT registered → INCLUSIVE pricing override
 *  - Wholesale profile → EXCLUSIVE pricing override
 *  - VAT registered → IS_VAT_REGISTERED=true in output
 *  - ENABLE_ORDER_TAB requires ENABLE_ORDER (conflict resolution)
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

  it('all ENABLE_* defaults are false', () => {
    const config = buildConfiguration(chars(), [], 'LITE_POS')
    for (const key of ['ENABLE_ORDER', 'ENABLE_ORDER_TAB', 'ENABLE_CASH_RECONCILIATION', 'ENABLE_TASK', 'ENABLE_PRINT_RECEIPT']) {
      const entry = config.systemConfigs.find((c) => c.key === key)
      expect(entry?.value, `${key} should default to false`).toBe('false')
    }
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
  it('ENABLED capability output overrides safe default', () => {
    const resolved = [
      enabled('CREATE_ORDER', [{ key: 'ENABLE_ORDER', value: 'true' }]),
    ]
    const config = buildConfiguration(chars({ paymentTiming: 'deferred' }), resolved, 'FOOD_AND_BEVERAGE')
    const orderConfig = config.systemConfigs.find((c) => c.key === 'ENABLE_ORDER')
    expect(orderConfig?.value).toBe('true')
  })

  it('DEFERRED capability does not write outputs', () => {
    const resolved = [
      deferred('CREATE_ORDER'),
    ]
    const config = buildConfiguration(chars(), resolved, 'LITE_POS')
    const orderConfig = config.systemConfigs.find((c) => c.key === 'ENABLE_ORDER')
    expect(orderConfig?.value).toBe('false') // still the safe default
  })

  it('NOT_APPLICABLE capability does not write outputs', () => {
    const resolved = [notApplicable('CREATE_ORDER')]
    const config = buildConfiguration(chars(), resolved, 'LITE_POS')
    const orderConfig = config.systemConfigs.find((c) => c.key === 'ENABLE_ORDER')
    expect(orderConfig?.value).toBe('false')
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
// Conflict resolution
// ---------------------------------------------------------------------------

describe('buildConfiguration — conflict resolution', () => {
  it('ENABLE_ORDER_TAB=true without ENABLE_ORDER=true → ORDER_TAB forced to false', () => {
    // A capability that sets ORDER_TAB but not ORDER
    const resolved = [
      enabled('SOME_CAP', [{ key: 'ENABLE_ORDER_TAB', value: 'true' }]),
    ]
    const config = buildConfiguration(chars(), resolved, 'GENERAL')
    const orderTab = config.systemConfigs.find((c) => c.key === 'ENABLE_ORDER_TAB')
    expect(orderTab?.value).toBe('false')
  })

  it('ENABLE_ORDER=true + ENABLE_ORDER_TAB=true → both remain true', () => {
    const resolved = [
      enabled('ORDER_CAP', [
        { key: 'ENABLE_ORDER', value: 'true' },
        { key: 'ENABLE_ORDER_TAB', value: 'true' },
      ]),
    ]
    const config = buildConfiguration(chars({ paymentTiming: 'deferred' }), resolved, 'FOOD_AND_BEVERAGE')
    const order = config.systemConfigs.find((c) => c.key === 'ENABLE_ORDER')
    const orderTab = config.systemConfigs.find((c) => c.key === 'ENABLE_ORDER_TAB')
    expect(order?.value).toBe('true')
    expect(orderTab?.value).toBe('true')
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
