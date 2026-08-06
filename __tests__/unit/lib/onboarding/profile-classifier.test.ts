/**
 * profile-classifier.test.ts — Pattern A unit tests for ProfileClassifier
 *
 * Coverage:
 *  - LITE_POS: solo + immediate + no inventory + no suppliers
 *  - SIMPLE_RETAILER: physical goods + immediate + solo/small + no raw materials
 *  - FOOD_AND_BEVERAGE: prepared food + deferred/mixed payment
 *  - SERVICE_BUSINESS: services only + no physical goods + no inventory
 *  - WHOLESALE_DISTRIBUTION: raw materials + formal suppliers + strict inventory
 *  - QUICK_SERVICE: high/medium volume + immediate + small/medium team
 *  - MULTI_BRANCH_ENTERPRISE: multiple locations OR expansion + medium/large team
 *  - GENERAL: fallback for mixed/unclear signals
 *  - Classification priority order (MULTI_BRANCH_ENTERPRISE wins over F&B)
 *  - getSuppressedCapabilities returns correct sets per profile
 */

import { describe, expect, it } from 'vitest'
import { classifyProfile, getSuppressedCapabilities } from '@/lib/onboarding/profile-classifier'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'
import type { BusinessCharacteristics, ResolvedCapability } from '@/lib/onboarding/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chars(overrides: Partial<BusinessCharacteristics>): BusinessCharacteristics {
  return { ...DEFAULT_CHARACTERISTICS, ...overrides }
}

function noResolved(): ResolvedCapability[] {
  return []
}

function withEnabled(ids: string[]): ResolvedCapability[] {
  return ids.map((id) => ({
    id,
    state: 'ENABLED' as const,
    confidence: 1,
    outputs: [],
    rollbackOutputs: [],
  }))
}

// ---------------------------------------------------------------------------
// Profile classification rules
// ---------------------------------------------------------------------------

describe('classifyProfile — LITE_POS', () => {
  it('solo + immediate + no inventory + no suppliers → LITE_POS', () => {
    const result = classifyProfile(
      chars({ teamSize: 'solo', paymentTiming: 'immediate', tracksInventory: false, usesSuppliers: false }),
      noResolved(),
    )
    expect(result).toBe('LITE_POS')
  })

  it('solo + immediate + inventory tracking → NOT LITE_POS (inventory changes profile)', () => {
    const result = classifyProfile(
      chars({ teamSize: 'solo', paymentTiming: 'immediate', tracksInventory: true, usesSuppliers: false }),
      noResolved(),
    )
    expect(result).not.toBe('LITE_POS')
  })
})

describe('classifyProfile — SIMPLE_RETAILER', () => {
  it('physical goods + immediate + solo/small + CREATE_ORDER not enabled → SIMPLE_RETAILER', () => {
    const result = classifyProfile(
      chars({
        sellsPhysicalGoods: true,
        sellsRawMaterials: false,
        paymentTiming: 'immediate',
        teamSize: 'small',
        tracksInventory: true, // has inventory so not LITE_POS
      }),
      noResolved(),
    )
    expect(result).toBe('SIMPLE_RETAILER')
  })
})

describe('classifyProfile — FOOD_AND_BEVERAGE', () => {
  it('prepared food + deferred payment → FOOD_AND_BEVERAGE', () => {
    const result = classifyProfile(
      chars({ sellsPreparedFood: true, paymentTiming: 'deferred' }),
      noResolved(),
    )
    expect(result).toBe('FOOD_AND_BEVERAGE')
  })

  it('prepared food + mixed payment → FOOD_AND_BEVERAGE', () => {
    const result = classifyProfile(
      chars({ sellsPreparedFood: true, paymentTiming: 'mixed' }),
      noResolved(),
    )
    expect(result).toBe('FOOD_AND_BEVERAGE')
  })

  it('prepared food + immediate → NOT FOOD_AND_BEVERAGE (fast food counts as immediate)', () => {
    const result = classifyProfile(
      chars({ sellsPreparedFood: true, sellsPhysicalGoods: false, paymentTiming: 'immediate', teamSize: 'solo', tracksInventory: false }),
      noResolved(),
    )
    // Solo + immediate + no inventory → LITE_POS (higher priority)
    expect(result).toBe('LITE_POS')
  })
})

describe('classifyProfile — WHOLESALE_DISTRIBUTION', () => {
  it('raw materials + formal suppliers + strict inventory → WHOLESALE_DISTRIBUTION', () => {
    const result = classifyProfile(
      chars({
        sellsRawMaterials: true,
        usesSuppliers: true,
        inventoryCriticality: 'strict',
        tracksInventory: true,
      }),
      noResolved(),
    )
    expect(result).toBe('WHOLESALE_DISTRIBUTION')
  })

  it('raw materials + suppliers + non-strict inventory → NOT WHOLESALE_DISTRIBUTION', () => {
    const result = classifyProfile(
      chars({
        sellsRawMaterials: true,
        usesSuppliers: true,
        inventoryCriticality: 'standard',
        tracksInventory: true,
        teamSize: 'small',
        paymentTiming: 'immediate',
      }),
      noResolved(),
    )
    expect(result).not.toBe('WHOLESALE_DISTRIBUTION')
  })
})

describe('classifyProfile — SERVICE_BUSINESS', () => {
  it('services only, no physical goods, no inventory → SERVICE_BUSINESS', () => {
    const result = classifyProfile(
      chars({
        sellsServices: true,
        sellsPhysicalGoods: false,
        sellsRawMaterials: false,
        tracksInventory: false,
      }),
      noResolved(),
    )
    expect(result).toBe('SERVICE_BUSINESS')
  })

  it('services + physical goods → NOT SERVICE_BUSINESS', () => {
    const result = classifyProfile(
      chars({
        sellsServices: true,
        sellsPhysicalGoods: true,
        sellsRawMaterials: false,
        tracksInventory: false,
        teamSize: 'solo',
        paymentTiming: 'immediate',
      }),
      noResolved(),
    )
    expect(result).not.toBe('SERVICE_BUSINESS')
  })
})

describe('classifyProfile — QUICK_SERVICE', () => {
  it('high volume + immediate + small team → QUICK_SERVICE', () => {
    const result = classifyProfile(
      chars({
        dailyTransactionVolume: 'high',
        paymentTiming: 'immediate',
        teamSize: 'small',
        sellsPhysicalGoods: true,
      }),
      noResolved(),
    )
    expect(result).toBe('QUICK_SERVICE')
  })

  it('medium volume + immediate + medium team → QUICK_SERVICE', () => {
    const result = classifyProfile(
      chars({
        dailyTransactionVolume: 'medium',
        paymentTiming: 'immediate',
        teamSize: 'medium',
      }),
      noResolved(),
    )
    expect(result).toBe('QUICK_SERVICE')
  })
})

describe('classifyProfile — MULTI_BRANCH_ENTERPRISE', () => {
  it('multiple locations → MULTI_BRANCH_ENTERPRISE', () => {
    const result = classifyProfile(
      chars({ locationCount: 'multiple' }),
      noResolved(),
    )
    expect(result).toBe('MULTI_BRANCH_ENTERPRISE')
  })

  it('expansion planned + medium team → MULTI_BRANCH_ENTERPRISE', () => {
    const result = classifyProfile(
      chars({ plansExpansion: true, teamSize: 'medium' }),
      noResolved(),
    )
    expect(result).toBe('MULTI_BRANCH_ENTERPRISE')
  })

  it('expansion planned + solo team → NOT MULTI_BRANCH_ENTERPRISE', () => {
    // Solo + expansion: the solo constraint means it is not enterprise-level yet
    const result = classifyProfile(
      chars({
        plansExpansion: true,
        teamSize: 'solo',
        paymentTiming: 'immediate',
        tracksInventory: false,
        usesSuppliers: false,
      }),
      noResolved(),
    )
    expect(result).not.toBe('MULTI_BRANCH_ENTERPRISE')
  })
})

describe('classifyProfile — GENERAL', () => {
  it('mixed signals with no dominant pattern → GENERAL', () => {
    // Services + physical + small team + medium payment + standard inventory
    // → does not match SERVICE_BUSINESS (has physical goods), not F&B, not simple retailer
    //   (has mixed payment), not wholesale (not raw materials + strict)
    const result = classifyProfile(
      chars({
        sellsServices: true,
        sellsPhysicalGoods: true,
        paymentTiming: 'mixed',
        teamSize: 'small',
        tracksInventory: true,
        inventoryCriticality: 'standard',
        usesSuppliers: false,
      }),
      noResolved(),
    )
    expect(result).toBe('GENERAL')
  })
})

// ---------------------------------------------------------------------------
// Classification priority order
// ---------------------------------------------------------------------------

describe('classifyProfile — priority order', () => {
  it('MULTI_BRANCH_ENTERPRISE takes priority over FOOD_AND_BEVERAGE', () => {
    // F&B criteria AND multi-branch criteria both met
    const result = classifyProfile(
      chars({
        sellsPreparedFood: true,
        paymentTiming: 'deferred',
        locationCount: 'multiple',
      }),
      noResolved(),
    )
    expect(result).toBe('MULTI_BRANCH_ENTERPRISE')
  })

  it('FOOD_AND_BEVERAGE takes priority over SERVICE_BUSINESS', () => {
    const result = classifyProfile(
      chars({
        sellsPreparedFood: true,
        sellsServices: true,
        sellsPhysicalGoods: false,
        paymentTiming: 'deferred',
        tracksInventory: false,
      }),
      noResolved(),
    )
    expect(result).toBe('FOOD_AND_BEVERAGE')
  })
})

// ---------------------------------------------------------------------------
// getSuppressedCapabilities
// ---------------------------------------------------------------------------

describe('getSuppressedCapabilities', () => {
  it('LITE_POS suppresses inventory, purchasing, tasks, CRM', () => {
    const suppressed = getSuppressedCapabilities('LITE_POS')
    expect(suppressed.has('MANAGE_INVENTORY')).toBe(true)
    expect(suppressed.has('CREATE_PURCHASE')).toBe(true)
    expect(suppressed.has('CREATE_TASK')).toBe(true)
    expect(suppressed.has('MANAGE_CUSTOMERS')).toBe(true)
  })

  it('SERVICE_BUSINESS suppresses inventory and purchasing', () => {
    const suppressed = getSuppressedCapabilities('SERVICE_BUSINESS')
    expect(suppressed.has('MANAGE_INVENTORY')).toBe(true)
    expect(suppressed.has('CREATE_PURCHASE')).toBe(true)
  })

  it('SIMPLE_RETAILER suppresses order queue', () => {
    const suppressed = getSuppressedCapabilities('SIMPLE_RETAILER')
    expect(suppressed.has('CREATE_ORDER')).toBe(true)
    expect(suppressed.has('EDIT_ACTIVE_ORDER')).toBe(true)
  })

  it('FOOD_AND_BEVERAGE suppresses nothing', () => {
    expect(getSuppressedCapabilities('FOOD_AND_BEVERAGE').size).toBe(0)
  })

  it('GENERAL suppresses nothing', () => {
    expect(getSuppressedCapabilities('GENERAL').size).toBe(0)
  })
})
