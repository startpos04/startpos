/**
 * observation-rules-phase3b.test.ts — Pattern A unit tests for the 10 Phase 3b rules
 *
 * Coverage (boundary conditions per rule):
 *  - inventoryCriticality = strict: fires when > 4 adjustments, not at ≤ 4
 *  - inventoryCriticality = standard: fires at ≥ 10, not at 9; lower confidence than strict
 *  - strict beats standard for same field (higher confidence wins in engine)
 *  - hasProductComponents: fires at ≥ 3 recipes, not at 2
 *  - hasRegularWaste: fires at ≥ 2, not at 1
 *  - reconcilesCash: fires at ≥ 5, not at 4
 *  - requiresApprovals: fires at ≥ 3, not at 2
 *  - offersDelivery: fires at ≥ 3 delivery orders, not at 2
 *  - dailyTransactionVolume = medium: fires 11–100, not at 10 or 101
 *  - dailyTransactionVolume = high: fires > 100, not at 100
 *  - volume rules: mutual exclusion (only one fires per avgDailyTransactions value)
 *  - hasProductVariants: fires at ≥ 3, not at 2
 *  - OBSERVATION_RULES now has 17 total entries
 *  - getRulesForCharacteristic returns correct subsets for new characteristics
 */

import { describe, expect, it } from 'vitest'
import { OBSERVATION_RULES, getRulesForCharacteristic } from '@/lib/evolution/observation-rules'
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
    componentRecipeCount: 0,
    wasteRecordCount: 0,
    reconciliationCount: 0,
    approvalWorkflowUsageCount: 0,
    deliveryOrderCount: 0,
    avgDailyTransactions: 0,
    productVariantCount: 0,
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
// Registry completeness
// ---------------------------------------------------------------------------

describe('OBSERVATION_RULES — Phase 3b completeness', () => {
  it('contains 20 total rules (7 Phase 2 + 10 Phase 3b + 3 Phase 5)', () => {
    // Phase 5 added: catalogueSizeMedium, catalogueSizeLarge, ruleRapidGrowthSignal
    expect(OBSERVATION_RULES).toHaveLength(20)
  })

  it('every rule has confidence between 0 and 1', () => {
    for (const rule of OBSERVATION_RULES) {
      expect(rule.confidence, `${rule.characteristic} out of range`).toBeGreaterThan(0)
      expect(rule.confidence, `${rule.characteristic} out of range`).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// inventoryCriticality = strict
// ---------------------------------------------------------------------------

describe('rule: inventoryCriticality = strict (> 4 adjustments)', () => {
  const rule = () => findRule('inventoryCriticality', 'strict')

  it('fires when inventoryAdjustmentCount = 5 (at threshold)', () => {
    expect(rule().condition(summary({ inventoryAdjustmentCount: 5 }))).toBe(true)
  })

  it('fires when inventoryAdjustmentCount = 50', () => {
    expect(rule().condition(summary({ inventoryAdjustmentCount: 50 }))).toBe(true)
  })

  it('does NOT fire when inventoryAdjustmentCount = 4 (boundary)', () => {
    expect(rule().condition(summary({ inventoryAdjustmentCount: 4 }))).toBe(false)
  })

  it('does NOT fire when inventoryAdjustmentCount = 0', () => {
    expect(rule().condition(summary({ inventoryAdjustmentCount: 0 }))).toBe(false)
  })

  it('has confidence 0.85', () => {
    expect(rule().confidence).toBe(0.85)
  })
})

// ---------------------------------------------------------------------------
// inventoryCriticality = standard
// ---------------------------------------------------------------------------

describe('rule: inventoryCriticality = standard (≥ 10 adjustments)', () => {
  const rule = () => findRule('inventoryCriticality', 'standard')

  it('fires when inventoryAdjustmentCount = 10 (at threshold)', () => {
    expect(rule().condition(summary({ inventoryAdjustmentCount: 10 }))).toBe(true)
  })

  it('fires when inventoryAdjustmentCount = 20', () => {
    expect(rule().condition(summary({ inventoryAdjustmentCount: 20 }))).toBe(true)
  })

  it('does NOT fire when inventoryAdjustmentCount = 9 (one below)', () => {
    expect(rule().condition(summary({ inventoryAdjustmentCount: 9 }))).toBe(false)
  })

  it('has confidence 0.80 (lower than strict)', () => {
    expect(rule().confidence).toBe(0.80)
  })
})

describe('inventoryCriticality priority: strict (0.85) beats standard (0.80)', () => {
  it('both rules fire when adjustmentCount = 10, strict has higher confidence', () => {
    const s = summary({ inventoryAdjustmentCount: 10 })
    const strictRule = findRule('inventoryCriticality', 'strict')
    const standardRule = findRule('inventoryCriticality', 'standard')
    // At count=10 strict fires (>4), standard fires (≥10)
    expect(strictRule.condition(s)).toBe(true)
    expect(standardRule.condition(s)).toBe(true)
    // Strict has higher confidence — engine will use it
    expect(strictRule.confidence).toBeGreaterThan(standardRule.confidence)
  })
})

// ---------------------------------------------------------------------------
// hasProductComponents
// ---------------------------------------------------------------------------

describe('rule: hasProductComponents = true (≥ 3 recipes)', () => {
  const rule = () => findRule('hasProductComponents', true)

  it('fires when componentRecipeCount = 3 (at threshold)', () => {
    expect(rule().condition(summary({ componentRecipeCount: 3 }))).toBe(true)
  })

  it('does NOT fire when componentRecipeCount = 2 (one below)', () => {
    expect(rule().condition(summary({ componentRecipeCount: 2 }))).toBe(false)
  })

  it('has confidence 0.95', () => {
    expect(rule().confidence).toBe(0.95)
  })
})

// ---------------------------------------------------------------------------
// hasRegularWaste
// ---------------------------------------------------------------------------

describe('rule: hasRegularWaste = true (≥ 2 waste records)', () => {
  const rule = () => findRule('hasRegularWaste', true)

  it('fires when wasteRecordCount = 2 (at threshold)', () => {
    expect(rule().condition(summary({ wasteRecordCount: 2 }))).toBe(true)
  })

  it('does NOT fire when wasteRecordCount = 1 (one below)', () => {
    expect(rule().condition(summary({ wasteRecordCount: 1 }))).toBe(false)
  })

  it('has confidence 0.80', () => {
    expect(rule().confidence).toBe(0.80)
  })
})

// ---------------------------------------------------------------------------
// reconcilesCash
// ---------------------------------------------------------------------------

describe('rule: reconcilesCash = true (≥ 5 reconciliations)', () => {
  const rule = () => findRule('reconcilesCash', true)

  it('fires when reconciliationCount = 5 (at threshold)', () => {
    expect(rule().condition(summary({ reconciliationCount: 5 }))).toBe(true)
  })

  it('fires when reconciliationCount = 100', () => {
    expect(rule().condition(summary({ reconciliationCount: 100 }))).toBe(true)
  })

  it('does NOT fire when reconciliationCount = 4 (one below)', () => {
    expect(rule().condition(summary({ reconciliationCount: 4 }))).toBe(false)
  })

  it('does NOT fire when reconciliationCount = 0', () => {
    expect(rule().condition(summary({ reconciliationCount: 0 }))).toBe(false)
  })

  it('has confidence 0.90', () => {
    expect(rule().confidence).toBe(0.90)
  })
})

// ---------------------------------------------------------------------------
// requiresApprovals
// ---------------------------------------------------------------------------

describe('rule: requiresApprovals = true (≥ 3 approval events)', () => {
  const rule = () => findRule('requiresApprovals', true)

  it('fires when approvalWorkflowUsageCount = 3 (at threshold)', () => {
    expect(rule().condition(summary({ approvalWorkflowUsageCount: 3 }))).toBe(true)
  })

  it('does NOT fire when approvalWorkflowUsageCount = 2 (one below)', () => {
    expect(rule().condition(summary({ approvalWorkflowUsageCount: 2 }))).toBe(false)
  })

  it('has confidence 0.85', () => {
    expect(rule().confidence).toBe(0.85)
  })
})

// ---------------------------------------------------------------------------
// offersDelivery
// ---------------------------------------------------------------------------

describe('rule: offersDelivery = true (≥ 3 delivery orders)', () => {
  const rule = () => findRule('offersDelivery', true)

  it('fires when deliveryOrderCount = 3 (at threshold)', () => {
    expect(rule().condition(summary({ deliveryOrderCount: 3 }))).toBe(true)
  })

  it('does NOT fire when deliveryOrderCount = 2 (one below)', () => {
    expect(rule().condition(summary({ deliveryOrderCount: 2 }))).toBe(false)
  })

  it('has confidence 0.90', () => {
    expect(rule().confidence).toBe(0.90)
  })
})

// ---------------------------------------------------------------------------
// dailyTransactionVolume = medium
// ---------------------------------------------------------------------------

describe('rule: dailyTransactionVolume = medium (11–100 avg/day)', () => {
  const rule = () => findRule('dailyTransactionVolume', 'medium')

  it('fires when avgDailyTransactions = 11 (lower bound)', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 11 }))).toBe(true)
  })

  it('fires when avgDailyTransactions = 50 (mid-range)', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 50 }))).toBe(true)
  })

  it('fires when avgDailyTransactions = 100 (upper bound)', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 100 }))).toBe(true)
  })

  it('does NOT fire when avgDailyTransactions = 10 (one below lower bound)', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 10 }))).toBe(false)
  })

  it('does NOT fire when avgDailyTransactions = 101 (high territory)', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 101 }))).toBe(false)
  })

  it('has confidence 0.90', () => {
    expect(rule().confidence).toBe(0.90)
  })
})

// ---------------------------------------------------------------------------
// dailyTransactionVolume = high
// ---------------------------------------------------------------------------

describe('rule: dailyTransactionVolume = high (> 100 avg/day)', () => {
  const rule = () => findRule('dailyTransactionVolume', 'high')

  it('fires when avgDailyTransactions = 101 (at threshold)', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 101 }))).toBe(true)
  })

  it('fires when avgDailyTransactions = 500', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 500 }))).toBe(true)
  })

  it('does NOT fire when avgDailyTransactions = 100 (medium boundary)', () => {
    expect(rule().condition(summary({ avgDailyTransactions: 100 }))).toBe(false)
  })

  it('has confidence 0.90', () => {
    expect(rule().confidence).toBe(0.90)
  })
})

describe('dailyTransactionVolume rules — mutual exclusion', () => {
  const volRules = OBSERVATION_RULES.filter((r) => r.characteristic === 'dailyTransactionVolume')

  it('avgDailyTransactions=10 → zero volume rules fire', () => {
    const s = summary({ avgDailyTransactions: 10 })
    expect(volRules.filter((r) => r.condition(s))).toHaveLength(0)
  })

  it('avgDailyTransactions=50 → only medium fires', () => {
    const s = summary({ avgDailyTransactions: 50 })
    const fired = volRules.filter((r) => r.condition(s))
    expect(fired).toHaveLength(1)
    expect(fired[0]?.value).toBe('medium')
  })

  it('avgDailyTransactions=200 → only high fires', () => {
    const s = summary({ avgDailyTransactions: 200 })
    const fired = volRules.filter((r) => r.condition(s))
    expect(fired).toHaveLength(1)
    expect(fired[0]?.value).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// hasProductVariants
// ---------------------------------------------------------------------------

describe('rule: hasProductVariants = true (≥ 3 variants)', () => {
  const rule = () => findRule('hasProductVariants', true)

  it('fires when productVariantCount = 3 (at threshold)', () => {
    expect(rule().condition(summary({ productVariantCount: 3 }))).toBe(true)
  })

  it('fires when productVariantCount = 100', () => {
    expect(rule().condition(summary({ productVariantCount: 100 }))).toBe(true)
  })

  it('does NOT fire when productVariantCount = 2 (one below)', () => {
    expect(rule().condition(summary({ productVariantCount: 2 }))).toBe(false)
  })

  it('does NOT fire when productVariantCount = 0', () => {
    expect(rule().condition(summary({ productVariantCount: 0 }))).toBe(false)
  })

  it('has confidence 0.90', () => {
    expect(rule().confidence).toBe(0.90)
  })
})

// ---------------------------------------------------------------------------
// getRulesForCharacteristic — Phase 3b characteristics
// ---------------------------------------------------------------------------

describe('getRulesForCharacteristic — Phase 3b', () => {
  it('returns 2 rules for inventoryCriticality (strict + standard)', () => {
    const rules = getRulesForCharacteristic('inventoryCriticality')
    expect(rules).toHaveLength(2)
    expect(rules.map((r) => r.value).sort()).toEqual(['standard', 'strict'])
  })

  it('returns 3 rules for dailyTransactionVolume (medium + high + rapid-growth high)', () => {
    const rules = getRulesForCharacteristic('dailyTransactionVolume')
    expect(rules).toHaveLength(3)
    // Two 'high' rules: steady-state high volume + rapid-growth signal
    expect(rules.filter((r) => r.value === 'high')).toHaveLength(2)
    expect(rules.filter((r) => r.value === 'medium')).toHaveLength(1)
  })

  it('returns 1 rule for hasProductComponents', () => {
    expect(getRulesForCharacteristic('hasProductComponents')).toHaveLength(1)
  })

  it('returns 1 rule for hasRegularWaste', () => {
    expect(getRulesForCharacteristic('hasRegularWaste')).toHaveLength(1)
  })

  it('returns 1 rule for reconcilesCash', () => {
    expect(getRulesForCharacteristic('reconcilesCash')).toHaveLength(1)
  })

  it('returns 1 rule for requiresApprovals', () => {
    expect(getRulesForCharacteristic('requiresApprovals')).toHaveLength(1)
  })

  it('returns 1 rule for offersDelivery', () => {
    expect(getRulesForCharacteristic('offersDelivery')).toHaveLength(1)
  })

  it('returns 1 rule for hasProductVariants', () => {
    expect(getRulesForCharacteristic('hasProductVariants')).toHaveLength(1)
  })
})
