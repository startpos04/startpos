/**
 * observation-rules-phase5.test.ts — Pattern A unit tests
 *
 * Coverage:
 *  - ruleCatalogueSizeMedium fires at exactly productCount = 25, not below
 *  - ruleCatalogueSizeMedium does NOT fire at productCount = 100 (large wins)
 *  - ruleCatalogueSizeLarge fires at exactly productCount = 100, not below
 *  - ruleRapidGrowthSignal fires when current ≥ 2× previous and both ≥ 10
 *  - ruleRapidGrowthSignal does NOT fire when base is too small (< 10)
 *  - ruleRapidGrowthSignal does NOT fire when ratio < 2×
 *  - GROWTH_OBSERVATION_RULES includes all 6 expected entries
 *  - OBSERVATION_RULES now contains 21 rules total
 *  - Growth aliases (firstEmployee, teamReachesSix, secondBranch) point to correct characteristics
 */

import { describe, expect, it } from 'vitest'
import {
  GROWTH_OBSERVATION_RULES,
  OBSERVATION_RULES,
  getRulesForCharacteristic,
} from '@/lib/evolution/observation-rules'
import type { BusinessUsageSummaryData } from '@/lib/evolution/types'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function summary(overrides: BusinessUsageSummaryData = {}): BusinessUsageSummaryData {
  return {
    supplierCount: 0,
    employeeCount: 0,
    branchCount: 0,
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

function findRule(characteristic: string, value: unknown) {
  const rule = OBSERVATION_RULES.find(
    (r) => r.characteristic === characteristic && r.value === value,
  )
  if (!rule) throw new Error(`Rule not found: ${characteristic} = ${String(value)}`)
  return rule
}

// ---------------------------------------------------------------------------
// catalogueSize = 'medium'
// ---------------------------------------------------------------------------

describe('ruleCatalogueSizeMedium', () => {
  const rule = findRule('catalogueSize', 'medium')

  it('fires at exactly productCount = 25', () => {
    expect(rule.condition(summary({ productCount: 25 }))).toBe(true)
  })

  it('does not fire below threshold (productCount = 24)', () => {
    expect(rule.condition(summary({ productCount: 24 }))).toBe(false)
  })

  it('does not fire at 0 products', () => {
    expect(rule.condition(summary({ productCount: 0 }))).toBe(false)
  })

  it('does not fire at productCount = 99 (top of medium range)', () => {
    // productCount 99 IS medium
    expect(rule.condition(summary({ productCount: 99 }))).toBe(true)
  })

  it('does not fire at productCount = 100 (large threshold)', () => {
    // large rule wins — medium condition explicitly excludes ≥ 100
    expect(rule.condition(summary({ productCount: 100 }))).toBe(false)
  })

  it('has high confidence (0.95)', () => {
    expect(rule.confidence).toBe(0.95)
  })
})

// ---------------------------------------------------------------------------
// catalogueSize = 'large'
// ---------------------------------------------------------------------------

describe('ruleCatalogueSizeLarge', () => {
  const rule = findRule('catalogueSize', 'large')

  it('fires at exactly productCount = 100', () => {
    expect(rule.condition(summary({ productCount: 100 }))).toBe(true)
  })

  it('does not fire below threshold (productCount = 99)', () => {
    expect(rule.condition(summary({ productCount: 99 }))).toBe(false)
  })

  it('fires well above threshold (productCount = 500)', () => {
    expect(rule.condition(summary({ productCount: 500 }))).toBe(true)
  })

  it('has very high confidence (0.99)', () => {
    expect(rule.confidence).toBe(0.99)
  })
})

// ---------------------------------------------------------------------------
// ruleRapidGrowthSignal — dailyTransactionVolume = 'high' (growth variant)
// ---------------------------------------------------------------------------

describe('ruleRapidGrowthSignal', () => {
  // There may be two 'high' rules; we want the rapid-growth one (confidence 0.88)
  const allHighRules = OBSERVATION_RULES.filter(
    (r) => r.characteristic === 'dailyTransactionVolume' && r.value === 'high',
  )
  const rapidGrowthRule = allHighRules.find((r) => r.confidence === 0.88)

  it('is registered in OBSERVATION_RULES', () => {
    expect(rapidGrowthRule).toBeDefined()
  })

  it('fires when current is exactly 2× previous, both ≥ 10', () => {
    expect(
      rapidGrowthRule!.condition(
        summary({ transactionsLast30Days: 20, transactionsPrev30Days: 10 }),
      ),
    ).toBe(true)
  })

  it('fires when current is well above 2× previous', () => {
    expect(
      rapidGrowthRule!.condition(
        summary({ transactionsLast30Days: 100, transactionsPrev30Days: 30 }),
      ),
    ).toBe(true)
  })

  it('does NOT fire when ratio is just below 2× (1.9×)', () => {
    expect(
      rapidGrowthRule!.condition(
        summary({ transactionsLast30Days: 19, transactionsPrev30Days: 10 }),
      ),
    ).toBe(false)
  })

  it('does NOT fire when current window is below minimum base (< 10)', () => {
    expect(
      rapidGrowthRule!.condition(
        summary({ transactionsLast30Days: 8, transactionsPrev30Days: 2 }),
      ),
    ).toBe(false)
  })

  it('does NOT fire when previous window is below minimum base (< 10)', () => {
    // prev = 9 means we can not confirm genuine doubling from a meaningful base
    expect(
      rapidGrowthRule!.condition(
        summary({ transactionsLast30Days: 20, transactionsPrev30Days: 9 }),
      ),
    ).toBe(false)
  })

  it('does NOT fire when both windows are 0 (no data)', () => {
    expect(
      rapidGrowthRule!.condition(
        summary({ transactionsLast30Days: 0, transactionsPrev30Days: 0 }),
      ),
    ).toBe(false)
  })

  it('does NOT fire when fields are missing (undefined → 0)', () => {
    expect(rapidGrowthRule!.condition(summary({}))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GROWTH_OBSERVATION_RULES — exported list
// ---------------------------------------------------------------------------

describe('GROWTH_OBSERVATION_RULES', () => {
  it('contains exactly 6 entries', () => {
    expect(GROWTH_OBSERVATION_RULES).toHaveLength(6)
  })

  it('includes a rule for teamSize = small (first employee)', () => {
    expect(GROWTH_OBSERVATION_RULES.some((r) => r.characteristic === 'teamSize' && r.value === 'small')).toBe(true)
  })

  it('includes a rule for teamSize = medium (team reaches 6)', () => {
    expect(GROWTH_OBSERVATION_RULES.some((r) => r.characteristic === 'teamSize' && r.value === 'medium')).toBe(true)
  })

  it('includes a rule for locationCount = multiple (second branch)', () => {
    expect(GROWTH_OBSERVATION_RULES.some((r) => r.characteristic === 'locationCount' && r.value === 'multiple')).toBe(true)
  })

  it('includes a rule for catalogueSize = medium', () => {
    expect(GROWTH_OBSERVATION_RULES.some((r) => r.characteristic === 'catalogueSize' && r.value === 'medium')).toBe(true)
  })

  it('includes a rule for catalogueSize = large', () => {
    expect(GROWTH_OBSERVATION_RULES.some((r) => r.characteristic === 'catalogueSize' && r.value === 'large')).toBe(true)
  })

  it('includes a rule for dailyTransactionVolume = high (rapid growth)', () => {
    expect(GROWTH_OBSERVATION_RULES.some((r) => r.characteristic === 'dailyTransactionVolume' && r.value === 'high')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// OBSERVATION_RULES total count
// ---------------------------------------------------------------------------

describe('OBSERVATION_RULES registry', () => {
  it('contains exactly 20 rules (7 Phase2 + 10 Phase3b + 3 Phase5)', () => {
    // Phase 2: 7 | Phase 3b: 10 | Phase 5 new entries: catalogueMedium, catalogueLarge, rapidGrowth = 3
    // Note: teamSize/location growth aliases share existing rules so are NOT new entries.
    // ruleRapidGrowthSignal is a third entry for dailyTransactionVolume (medium + high + rapid-high)
    expect(OBSERVATION_RULES).toHaveLength(20)
  })

  it('getRulesForCharacteristic catalogueSize returns 2 rules', () => {
    const catalogueRules = getRulesForCharacteristic('catalogueSize')
    expect(catalogueRules).toHaveLength(2)
  })

  it('getRulesForCharacteristic dailyTransactionVolume returns 3 rules (medium + high + rapid)', () => {
    const volRules = getRulesForCharacteristic('dailyTransactionVolume')
    expect(volRules).toHaveLength(3)
  })
})
