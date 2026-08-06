/**
 * milestone-engine.test.ts — Pattern A unit tests
 *
 * Coverage:
 *  - FIRST_EMPLOYEE_HIRED fires when teamSize changes to 'small'
 *  - FIRST_EMPLOYEE_HIRED does NOT fire when teamSize is already 'small' but unchanged
 *  - TEAM_REACHED_SIX fires when teamSize changes to 'medium'
 *  - TRANSACTIONS_CROSS_100_DAY fires when dailyTransactionVolume→'high' + avgDailyTransactions > 100
 *  - TRANSACTIONS_CROSS_100_DAY does NOT fire when avgDailyTransactions ≤ 100 (rapid growth path)
 *  - RAPID_GROWTH_DETECTED fires when dailyTransactionVolume→'high' + volume doubled
 *  - RAPID_GROWTH_DETECTED does NOT fire when base < 10
 *  - CATALOGUE_CROSSED_100_ITEMS fires when catalogueSize changes to 'large'
 *  - SECOND_BRANCH_OPENED fires when locationCount changes to 'multiple'
 *  - ONE_YEAR_ANNIVERSARY fires within ±7 days of the 1-year mark
 *  - ONE_YEAR_ANNIVERSARY does NOT fire outside the ±7 day window
 *  - Multiple milestones can fire in the same cycle
 *  - No milestones fire when changedFields is empty (except anniversary)
 *  - detectMilestones returns empty array when nothing crosses
 */

import { describe, expect, it } from 'vitest'
import { detectMilestones, getAllMilestoneDefinitions } from '@/lib/evolution/milestone-engine'
import type { MilestoneEngineInput } from '@/lib/evolution/milestone-engine'
import type { BusinessCharacteristics } from '@/lib/onboarding/types'
import type { BusinessUsageSummaryData } from '@/lib/evolution/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_NOW = new Date('2026-08-04T12:00:00Z')
const CREATED_TWO_YEARS_AGO = new Date('2024-08-04T12:00:00Z')
const CREATED_ONE_YEAR_AGO = new Date('2025-08-04T12:00:00Z')
// Just inside ±7-day window
const CREATED_ONE_YEAR_MINUS_6_DAYS = new Date('2025-07-29T12:00:00Z')
const CREATED_ONE_YEAR_PLUS_6_DAYS = new Date('2025-08-10T12:00:00Z')
// Just outside ±7-day window
const CREATED_ONE_YEAR_MINUS_8_DAYS = new Date('2025-07-27T12:00:00Z')

function baseCharacteristics(
  overrides: Partial<BusinessCharacteristics> = {},
): BusinessCharacteristics {
  return {
    dailyTransactionVolume: 'low',
    teamSize: 'solo',
    locationCount: 'one',
    sellsPhysicalGoods: true,
    sellsPreparedFood: false,
    sellsServices: false,
    sellsRawMaterials: false,
    catalogueSize: 'small',
    hasProductVariants: false,
    hasProductComponents: false,
    hasPerishables: false,
    paymentTiming: 'immediate',
    requiresTableManagement: false,
    hasOrderCustomization: false,
    offersDelivery: false,
    tracksInventory: false,
    inventoryCriticality: 'none',
    hasMultipleStockLocations: false,
    usesSuppliers: false,
    requiresGoodsReceipt: false,
    hasRegularWaste: false,
    hasRoleSeparation: false,
    requiresApprovals: false,
    usesOperationalTasks: false,
    handlesCash: true,
    reconcilesCash: false,
    isVatRegistered: false,
    taxDisplayMode: 'inclusive',
    requiresOfficialReceipts: false,
    hasCorporateBuyers: false,
    tracksCustomers: false,
    hasLoyaltyIntent: false,
    plansExpansion: false,
    needsExternalIntegrations: false,
    intentToAddMoreStaff: false,
    intentToTrackInventory: false,
    intentToManageSuppliers: false,
    intentToOfferDelivery: false,
    intentToOpenMoreLocations: false,
    intentToIntegrateExternalSystems: false,
    ...overrides,
  }
}

function baseSummary(overrides: Partial<BusinessUsageSummaryData> = {}): BusinessUsageSummaryData {
  return {
    supplierCount: 0,
    employeeCount: 1,
    branchCount: 1,
    customerCount: 0,
    purchaseOrderCount: 0,
    inventoryAdjustmentCount: 0,
    productCount: 0,
    transactionsLast30Days: 0,
    transactionsPrev30Days: 0,
    avgDailyTransactions: 0,
    ...overrides,
  }
}

function input(
  overrides: Partial<MilestoneEngineInput> = {},
): MilestoneEngineInput {
  return {
    changedFields: [],
    characteristics: baseCharacteristics(),
    usageSummary: baseSummary(),
    businessCreatedAt: CREATED_TWO_YEARS_AGO,
    now: BASE_NOW,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// FIRST_EMPLOYEE_HIRED
// ---------------------------------------------------------------------------

describe('FIRST_EMPLOYEE_HIRED milestone', () => {
  it('fires when teamSize changes to small', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ teamSize: 'small' }),
      }),
    )
    expect(result.some((m) => m.id === 'FIRST_EMPLOYEE_HIRED')).toBe(true)
  })

  it('does NOT fire when teamSize is small but not in changedFields', () => {
    const result = detectMilestones(
      input({
        changedFields: ['tracksInventory'],
        characteristics: baseCharacteristics({ teamSize: 'small' }),
      }),
    )
    expect(result.some((m) => m.id === 'FIRST_EMPLOYEE_HIRED')).toBe(false)
  })

  it('does NOT fire when teamSize changes to solo (downgrade path)', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ teamSize: 'solo' }),
      }),
    )
    expect(result.some((m) => m.id === 'FIRST_EMPLOYEE_HIRED')).toBe(false)
  })

  it('includes MANAGE_EMPLOYEES in relatedCapabilityIds', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ teamSize: 'small' }),
      }),
    )
    const milestone = result.find((m) => m.id === 'FIRST_EMPLOYEE_HIRED')!
    expect(milestone.relatedCapabilityIds).toContain('MANAGE_EMPLOYEES')
  })
})

// ---------------------------------------------------------------------------
// TEAM_REACHED_SIX
// ---------------------------------------------------------------------------

describe('TEAM_REACHED_SIX milestone', () => {
  it('fires when teamSize changes to medium', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ teamSize: 'medium' }),
      }),
    )
    expect(result.some((m) => m.id === 'TEAM_REACHED_SIX')).toBe(true)
  })

  it('does NOT fire when teamSize changes to small (wrong target)', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ teamSize: 'small' }),
      }),
    )
    expect(result.some((m) => m.id === 'TEAM_REACHED_SIX')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TRANSACTIONS_CROSS_100_DAY
// ---------------------------------------------------------------------------

describe('TRANSACTIONS_CROSS_100_DAY milestone', () => {
  it('fires when dailyTransactionVolume changes to high and avgDailyTransactions > 100', () => {
    const result = detectMilestones(
      input({
        changedFields: ['dailyTransactionVolume'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({ avgDailyTransactions: 120 }),
      }),
    )
    expect(result.some((m) => m.id === 'TRANSACTIONS_CROSS_100_DAY')).toBe(true)
  })

  it('does NOT fire when avgDailyTransactions is exactly 100 (boundary — not above)', () => {
    const result = detectMilestones(
      input({
        changedFields: ['dailyTransactionVolume'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({ avgDailyTransactions: 100 }),
      }),
    )
    expect(result.some((m) => m.id === 'TRANSACTIONS_CROSS_100_DAY')).toBe(false)
  })

  it('does NOT fire when dailyTransactionVolume not in changedFields', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({ avgDailyTransactions: 150 }),
      }),
    )
    expect(result.some((m) => m.id === 'TRANSACTIONS_CROSS_100_DAY')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// RAPID_GROWTH_DETECTED
// ---------------------------------------------------------------------------

describe('RAPID_GROWTH_DETECTED milestone', () => {
  it('fires when volume doubled and both windows ≥ 10', () => {
    const result = detectMilestones(
      input({
        changedFields: ['dailyTransactionVolume'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({
          transactionsLast30Days: 40,
          transactionsPrev30Days: 15,
          avgDailyTransactions: 40,
        }),
      }),
    )
    expect(result.some((m) => m.id === 'RAPID_GROWTH_DETECTED')).toBe(true)
  })

  it('fires at exactly 2× (boundary)', () => {
    const result = detectMilestones(
      input({
        changedFields: ['dailyTransactionVolume'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({
          transactionsLast30Days: 20,
          transactionsPrev30Days: 10,
        }),
      }),
    )
    expect(result.some((m) => m.id === 'RAPID_GROWTH_DETECTED')).toBe(true)
  })

  it('does NOT fire when ratio is 1.9×', () => {
    const result = detectMilestones(
      input({
        changedFields: ['dailyTransactionVolume'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({
          transactionsLast30Days: 19,
          transactionsPrev30Days: 10,
        }),
      }),
    )
    expect(result.some((m) => m.id === 'RAPID_GROWTH_DETECTED')).toBe(false)
  })

  it('does NOT fire when previous window < 10 (tiny base)', () => {
    const result = detectMilestones(
      input({
        changedFields: ['dailyTransactionVolume'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({
          transactionsLast30Days: 20,
          transactionsPrev30Days: 9,
        }),
      }),
    )
    expect(result.some((m) => m.id === 'RAPID_GROWTH_DETECTED')).toBe(false)
  })

  it('does NOT fire when current window < 10', () => {
    const result = detectMilestones(
      input({
        changedFields: ['dailyTransactionVolume'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({
          transactionsLast30Days: 8,
          transactionsPrev30Days: 4,
        }),
      }),
    )
    expect(result.some((m) => m.id === 'RAPID_GROWTH_DETECTED')).toBe(false)
  })

  it('does NOT fire when dailyTransactionVolume not in changedFields', () => {
    const result = detectMilestones(
      input({
        changedFields: ['tracksInventory'],
        characteristics: baseCharacteristics({ dailyTransactionVolume: 'high' }),
        usageSummary: baseSummary({
          transactionsLast30Days: 40,
          transactionsPrev30Days: 15,
        }),
      }),
    )
    expect(result.some((m) => m.id === 'RAPID_GROWTH_DETECTED')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CATALOGUE_CROSSED_100_ITEMS
// ---------------------------------------------------------------------------

describe('CATALOGUE_CROSSED_100_ITEMS milestone', () => {
  it('fires when catalogueSize changes to large', () => {
    const result = detectMilestones(
      input({
        changedFields: ['catalogueSize'],
        characteristics: baseCharacteristics({ catalogueSize: 'large' }),
      }),
    )
    expect(result.some((m) => m.id === 'CATALOGUE_CROSSED_100_ITEMS')).toBe(true)
  })

  it('does NOT fire when catalogueSize changes to medium (not large)', () => {
    const result = detectMilestones(
      input({
        changedFields: ['catalogueSize'],
        characteristics: baseCharacteristics({ catalogueSize: 'medium' }),
      }),
    )
    expect(result.some((m) => m.id === 'CATALOGUE_CROSSED_100_ITEMS')).toBe(false)
  })

  it('does NOT fire when catalogueSize not in changedFields', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ catalogueSize: 'large' }),
      }),
    )
    expect(result.some((m) => m.id === 'CATALOGUE_CROSSED_100_ITEMS')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SECOND_BRANCH_OPENED
// ---------------------------------------------------------------------------

describe('SECOND_BRANCH_OPENED milestone', () => {
  it('fires when locationCount changes to multiple', () => {
    const result = detectMilestones(
      input({
        changedFields: ['locationCount'],
        characteristics: baseCharacteristics({ locationCount: 'multiple' }),
      }),
    )
    expect(result.some((m) => m.id === 'SECOND_BRANCH_OPENED')).toBe(true)
  })

  it('does NOT fire when locationCount is multiple but unchanged', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize'],
        characteristics: baseCharacteristics({ locationCount: 'multiple' }),
      }),
    )
    expect(result.some((m) => m.id === 'SECOND_BRANCH_OPENED')).toBe(false)
  })

  it('includes MANAGE_BRANCHES in relatedCapabilityIds', () => {
    const result = detectMilestones(
      input({
        changedFields: ['locationCount'],
        characteristics: baseCharacteristics({ locationCount: 'multiple' }),
      }),
    )
    const milestone = result.find((m) => m.id === 'SECOND_BRANCH_OPENED')!
    expect(milestone.relatedCapabilityIds).toContain('MANAGE_BRANCHES')
  })
})

// ---------------------------------------------------------------------------
// ONE_YEAR_ANNIVERSARY
// ---------------------------------------------------------------------------

describe('ONE_YEAR_ANNIVERSARY milestone', () => {
  it('fires exactly on the 1-year anniversary', () => {
    const result = detectMilestones(
      input({
        businessCreatedAt: CREATED_ONE_YEAR_AGO,
        now: BASE_NOW,
      }),
    )
    expect(result.some((m) => m.id === 'ONE_YEAR_ANNIVERSARY')).toBe(true)
  })

  it('fires 6 days before the anniversary (within ±7 day window)', () => {
    const result = detectMilestones(
      input({
        businessCreatedAt: CREATED_ONE_YEAR_MINUS_6_DAYS,
        now: BASE_NOW,
      }),
    )
    expect(result.some((m) => m.id === 'ONE_YEAR_ANNIVERSARY')).toBe(true)
  })

  it('fires 6 days after the anniversary (within ±7 day window)', () => {
    const result = detectMilestones(
      input({
        businessCreatedAt: CREATED_ONE_YEAR_PLUS_6_DAYS,
        now: BASE_NOW,
      }),
    )
    expect(result.some((m) => m.id === 'ONE_YEAR_ANNIVERSARY')).toBe(true)
  })

  it('does NOT fire 8 days before the anniversary (outside ±7 day window)', () => {
    const result = detectMilestones(
      input({
        businessCreatedAt: CREATED_ONE_YEAR_MINUS_8_DAYS,
        now: BASE_NOW,
      }),
    )
    expect(result.some((m) => m.id === 'ONE_YEAR_ANNIVERSARY')).toBe(false)
  })

  it('does NOT fire when business was created 2 years ago', () => {
    const result = detectMilestones(
      input({
        businessCreatedAt: CREATED_TWO_YEARS_AGO,
        now: BASE_NOW,
      }),
    )
    expect(result.some((m) => m.id === 'ONE_YEAR_ANNIVERSARY')).toBe(false)
  })

  it('fires regardless of changedFields (date-triggered, not field-triggered)', () => {
    const result = detectMilestones(
      input({
        changedFields: [],
        businessCreatedAt: CREATED_ONE_YEAR_AGO,
        now: BASE_NOW,
      }),
    )
    expect(result.some((m) => m.id === 'ONE_YEAR_ANNIVERSARY')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Multiple milestones in one cycle
// ---------------------------------------------------------------------------

describe('detectMilestones — multiple milestones in one cycle', () => {
  it('returns both FIRST_EMPLOYEE_HIRED and SECOND_BRANCH_OPENED when both trigger', () => {
    const result = detectMilestones(
      input({
        changedFields: ['teamSize', 'locationCount'],
        characteristics: baseCharacteristics({
          teamSize: 'small',
          locationCount: 'multiple',
        }),
      }),
    )
    expect(result.some((m) => m.id === 'FIRST_EMPLOYEE_HIRED')).toBe(true)
    expect(result.some((m) => m.id === 'SECOND_BRANCH_OPENED')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Empty / no-op cases
// ---------------------------------------------------------------------------

describe('detectMilestones — no milestones triggered', () => {
  it('returns empty array when changedFields is empty and business is not near anniversary', () => {
    const result = detectMilestones(input())
    expect(result).toHaveLength(0)
  })

  it('returns empty array when a different unrelated field changed', () => {
    const result = detectMilestones(
      input({
        changedFields: ['isVatRegistered'],
        characteristics: baseCharacteristics({ isVatRegistered: true }),
      }),
    )
    // None of the non-anniversary milestones involve isVatRegistered
    const nonAnniversary = result.filter((m) => m.id !== 'ONE_YEAR_ANNIVERSARY')
    expect(nonAnniversary).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getAllMilestoneDefinitions
// ---------------------------------------------------------------------------

describe('getAllMilestoneDefinitions', () => {
  it('returns exactly 7 milestone definitions', () => {
    expect(getAllMilestoneDefinitions()).toHaveLength(7)
  })

  it('all milestones have non-empty title and message', () => {
    for (const def of getAllMilestoneDefinitions()) {
      expect(def.title.length).toBeGreaterThan(0)
      expect(def.message.length).toBeGreaterThan(0)
    }
  })

  it('all milestones have unique ids', () => {
    const ids = getAllMilestoneDefinitions().map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
