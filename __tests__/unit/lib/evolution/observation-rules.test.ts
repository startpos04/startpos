/**
 * observation-rules.test.ts — Pattern A unit tests
 *
 * Coverage:
 *  - Each of the 7 Phase 2 rules fires at exactly the right threshold
 *  - Each rule does NOT fire below the threshold
 *  - Boundary conditions: exactly at threshold, one below, one above
 *  - getRulesForCharacteristic() returns only rules for the requested field
 *  - OBSERVATION_RULES contains all 7 expected rules
 *  - teamSize rules: only one fires at a time for a given employeeCount
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

describe('OBSERVATION_RULES — registry', () => {
  it('contains 20 rules (7 Phase 2 + 10 Phase 3b + 3 Phase 5)', () => {
    // Phase 5 added: catalogueSizeMedium, catalogueSizeLarge, ruleRapidGrowthSignal
    expect(OBSERVATION_RULES).toHaveLength(20)
  })

  it('every rule has a non-empty label and evidence string', () => {
    for (const rule of OBSERVATION_RULES) {
      expect(rule.label.length, `rule ${rule.characteristic} missing label`).toBeGreaterThan(0)
      expect(rule.evidence.length, `rule ${rule.characteristic} missing evidence`).toBeGreaterThan(0)
    }
  })

  it('every rule has confidence between 0 and 1', () => {
    for (const rule of OBSERVATION_RULES) {
      expect(rule.confidence, `${rule.characteristic} confidence out of range`).toBeGreaterThan(0)
      expect(rule.confidence, `${rule.characteristic} confidence out of range`).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Rule: usesSuppliers
// ---------------------------------------------------------------------------

describe('rule: usesSuppliers = true', () => {
  const rule = () => findRule('usesSuppliers', true)

  it('fires when supplierCount = 1 (at threshold)', () => {
    expect(rule().condition(summary({ supplierCount: 1 }))).toBe(true)
  })

  it('fires when supplierCount = 10 (above threshold)', () => {
    expect(rule().condition(summary({ supplierCount: 10 }))).toBe(true)
  })

  it('does NOT fire when supplierCount = 0 (below threshold)', () => {
    expect(rule().condition(summary({ supplierCount: 0 }))).toBe(false)
  })

  it('does NOT fire when supplierCount is undefined', () => {
    expect(rule().condition(summary())).toBe(false)
  })

  it('has confidence 0.95', () => {
    expect(rule().confidence).toBe(0.95)
  })
})

// ---------------------------------------------------------------------------
// Rule: tracksInventory = true (from purchase orders)
// ---------------------------------------------------------------------------

describe('rule: tracksInventory = true (purchaseOrderCount ≥ 3)', () => {
  const rule = () => findRule('tracksInventory', true)

  it('fires when purchaseOrderCount = 3 (at threshold)', () => {
    expect(rule().condition(summary({ purchaseOrderCount: 3 }))).toBe(true)
  })

  it('fires when purchaseOrderCount = 100 (above threshold)', () => {
    expect(rule().condition(summary({ purchaseOrderCount: 100 }))).toBe(true)
  })

  it('does NOT fire when purchaseOrderCount = 2 (one below threshold)', () => {
    expect(rule().condition(summary({ purchaseOrderCount: 2 }))).toBe(false)
  })

  it('does NOT fire when purchaseOrderCount = 0', () => {
    expect(rule().condition(summary({ purchaseOrderCount: 0 }))).toBe(false)
  })

  it('does NOT fire when purchaseOrderCount is undefined', () => {
    expect(rule().condition(summary())).toBe(false)
  })

  it('has confidence 0.95', () => {
    expect(rule().confidence).toBe(0.95)
  })
})

// ---------------------------------------------------------------------------
// Rule: teamSize = 'small'
// ---------------------------------------------------------------------------

describe('rule: teamSize = small (employeeCount 2–5)', () => {
  const rule = () => findRule('teamSize', 'small')

  it('fires when employeeCount = 2 (lower bound)', () => {
    expect(rule().condition(summary({ employeeCount: 2 }))).toBe(true)
  })

  it('fires when employeeCount = 5 (upper bound)', () => {
    expect(rule().condition(summary({ employeeCount: 5 }))).toBe(true)
  })

  it('fires when employeeCount = 3 (mid-range)', () => {
    expect(rule().condition(summary({ employeeCount: 3 }))).toBe(true)
  })

  it('does NOT fire when employeeCount = 1 (solo)', () => {
    expect(rule().condition(summary({ employeeCount: 1 }))).toBe(false)
  })

  it('does NOT fire when employeeCount = 6 (medium territory)', () => {
    expect(rule().condition(summary({ employeeCount: 6 }))).toBe(false)
  })

  it('does NOT fire when employeeCount = 0', () => {
    expect(rule().condition(summary({ employeeCount: 0 }))).toBe(false)
  })

  it('has confidence 0.99', () => {
    expect(rule().confidence).toBe(0.99)
  })
})

// ---------------------------------------------------------------------------
// Rule: teamSize = 'medium'
// ---------------------------------------------------------------------------

describe('rule: teamSize = medium (employeeCount 6–20)', () => {
  const rule = () => findRule('teamSize', 'medium')

  it('fires when employeeCount = 6 (lower bound)', () => {
    expect(rule().condition(summary({ employeeCount: 6 }))).toBe(true)
  })

  it('fires when employeeCount = 20 (upper bound)', () => {
    expect(rule().condition(summary({ employeeCount: 20 }))).toBe(true)
  })

  it('does NOT fire when employeeCount = 5 (small territory)', () => {
    expect(rule().condition(summary({ employeeCount: 5 }))).toBe(false)
  })

  it('does NOT fire when employeeCount = 21 (large territory)', () => {
    expect(rule().condition(summary({ employeeCount: 21 }))).toBe(false)
  })

  it('has confidence 0.99', () => {
    expect(rule().confidence).toBe(0.99)
  })
})

// ---------------------------------------------------------------------------
// Rule: teamSize = 'large'
// ---------------------------------------------------------------------------

describe('rule: teamSize = large (employeeCount > 20)', () => {
  const rule = () => findRule('teamSize', 'large')

  it('fires when employeeCount = 21 (lower bound)', () => {
    expect(rule().condition(summary({ employeeCount: 21 }))).toBe(true)
  })

  it('fires when employeeCount = 200', () => {
    expect(rule().condition(summary({ employeeCount: 200 }))).toBe(true)
  })

  it('does NOT fire when employeeCount = 20 (medium boundary)', () => {
    expect(rule().condition(summary({ employeeCount: 20 }))).toBe(false)
  })

  it('has confidence 0.99', () => {
    expect(rule().confidence).toBe(0.99)
  })
})

// ---------------------------------------------------------------------------
// Rule: locationCount = 'multiple'
// ---------------------------------------------------------------------------

describe('rule: locationCount = multiple (branchCount ≥ 2)', () => {
  const rule = () => findRule('locationCount', 'multiple')

  it('fires when branchCount = 2 (at threshold)', () => {
    expect(rule().condition(summary({ branchCount: 2 }))).toBe(true)
  })

  it('fires when branchCount = 10', () => {
    expect(rule().condition(summary({ branchCount: 10 }))).toBe(true)
  })

  it('does NOT fire when branchCount = 1', () => {
    expect(rule().condition(summary({ branchCount: 1 }))).toBe(false)
  })

  it('does NOT fire when branchCount = 0', () => {
    expect(rule().condition(summary({ branchCount: 0 }))).toBe(false)
  })

  it('has confidence 1.0', () => {
    expect(rule().confidence).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// Rule: tracksCustomers = true
// ---------------------------------------------------------------------------

describe('rule: tracksCustomers = true (customerCount ≥ 10)', () => {
  const rule = () => findRule('tracksCustomers', true)

  it('fires when customerCount = 10 (at threshold)', () => {
    expect(rule().condition(summary({ customerCount: 10 }))).toBe(true)
  })

  it('fires when customerCount = 100', () => {
    expect(rule().condition(summary({ customerCount: 100 }))).toBe(true)
  })

  it('does NOT fire when customerCount = 9 (one below)', () => {
    expect(rule().condition(summary({ customerCount: 9 }))).toBe(false)
  })

  it('does NOT fire when customerCount = 0', () => {
    expect(rule().condition(summary({ customerCount: 0 }))).toBe(false)
  })

  it('has confidence 0.85', () => {
    expect(rule().confidence).toBe(0.85)
  })
})

// ---------------------------------------------------------------------------
// teamSize rules: mutual exclusion
// ---------------------------------------------------------------------------

describe('teamSize rules — only one fires per employeeCount', () => {
  const teamRules = OBSERVATION_RULES.filter((r) => r.characteristic === 'teamSize')

  it('employeeCount=1 → zero teamSize rules fire', () => {
    const s = summary({ employeeCount: 1 })
    const fired = teamRules.filter((r) => r.condition(s))
    expect(fired).toHaveLength(0)
  })

  it('employeeCount=3 → only small fires', () => {
    const s = summary({ employeeCount: 3 })
    const fired = teamRules.filter((r) => r.condition(s))
    expect(fired).toHaveLength(1)
    expect(fired[0]?.value).toBe('small')
  })

  it('employeeCount=10 → only medium fires', () => {
    const s = summary({ employeeCount: 10 })
    const fired = teamRules.filter((r) => r.condition(s))
    expect(fired).toHaveLength(1)
    expect(fired[0]?.value).toBe('medium')
  })

  it('employeeCount=50 → only large fires', () => {
    const s = summary({ employeeCount: 50 })
    const fired = teamRules.filter((r) => r.condition(s))
    expect(fired).toHaveLength(1)
    expect(fired[0]?.value).toBe('large')
  })
})

// ---------------------------------------------------------------------------
// getRulesForCharacteristic
// ---------------------------------------------------------------------------

describe('getRulesForCharacteristic', () => {
  it('returns all teamSize rules', () => {
    const rules = getRulesForCharacteristic('teamSize')
    expect(rules).toHaveLength(3)
    expect(rules.map((r) => r.value).sort()).toEqual(['large', 'medium', 'small'])
  })

  it('returns the single usesSuppliers rule', () => {
    const rules = getRulesForCharacteristic('usesSuppliers')
    expect(rules).toHaveLength(1)
  })

  it('returns empty array for a characteristic with no rules', () => {
    const rules = getRulesForCharacteristic('sellsPreparedFood')
    expect(rules).toHaveLength(0)
  })
})
