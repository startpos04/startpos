/**
 * observation-rules.ts — Full observation rule registry (Phase 2 + Phase 3b + Phase 5)
 *
 * Each rule describes a condition on BusinessUsageSummaryData that updates
 * one BusinessCharacteristics field when the condition is met.
 *
 * Full rule set (21 rules):
 *
 * Phase 2 (7 rules — high confidence, high impact):
 *   1.  usesSuppliers            — supplierCount ≥ 1                    (0.95)
 *   2.  tracksInventory          — purchaseOrderCount ≥ 3               (0.95)
 *   3.  teamSize = small         — employeeCount 2–5                    (0.99)
 *   4.  teamSize = medium        — employeeCount 6–20                   (0.99)
 *   5.  teamSize = large         — employeeCount > 20                   (0.99)
 *   6.  locationCount = multiple — branchCount ≥ 2                     (1.00)
 *   7.  tracksCustomers          — customerCount ≥ 10                   (0.85)
 *
 * Phase 3b (10 rules — secondary signals):
 *   8.  inventoryCriticality = strict   — adjustments/30d > 4           (0.85)
 *   9.  inventoryCriticality = strict   — inventoryAdjustmentCount ≥ 10 (0.80)
 *   10. hasProductComponents            — componentRecipeCount ≥ 3      (0.95)
 *   11. hasRegularWaste                 — wasteRecordCount ≥ 2          (0.80)
 *   12. reconcilesCash                  — reconciliationCount ≥ 5       (0.90)
 *   13. requiresApprovals               — approvalWorkflowUsageCount ≥ 3(0.85)
 *   14. offersDelivery                  — deliveryOrderCount ≥ 3        (0.90)
 *   15. dailyTransactionVolume = medium — avgDailyTransactions 11–100   (0.90)
 *   16. dailyTransactionVolume = high   — avgDailyTransactions > 100    (0.90)
 *   17. hasProductVariants              — productVariantCount ≥ 3       (0.90)
 *
 * Phase 5 (4 new rules — growth threshold category):
 *   18. catalogueSize = medium         — productCount 25–99             (0.95)
 *   19. catalogueSize = large          — productCount ≥ 100             (0.99)
 *   20. dailyTransactionVolume = high  — volume doubled in 30 days      (0.88)
 *       (rapid-growth variant; fires when transactionsLast30Days ≥ 2× transactionsPrev30Days)
 *
 * Growth threshold aliases (reference existing rules, not extra registry entries):
 *   teamSize small     — first employee hired  (alias of rule 3)
 *   teamSize medium    — team reaches 6 people (alias of rule 4)
 *   locationCount multi — second branch opened  (alias of rule 6)
 *
 * Rules are evaluated by CharacteristicsEngine in OBSERVATION_RULES array order.
 * Multiple rules can update the same field — the highest-confidence value wins
 * (resolution handled by the engine, not here).
 *
 * Adding a new rule = one entry in this file. No engine changes needed.
 */

import type { ObservationRule } from './types'

// ---------------------------------------------------------------------------
// Phase 2 rules
// ---------------------------------------------------------------------------

/**
 * Rule: usesSuppliers = true when supplierCount ≥ 1
 * Source: BUSINESS_EVENT (high confidence from a single meaningful event)
 */
const ruleUsesSuppliers: ObservationRule<'usesSuppliers'> = {
  label: 'Uses suppliers (has at least one supplier record)',
  characteristic: 'usesSuppliers',
  value: true,
  condition: s => (s.supplierCount ?? 0) >= 1,
  confidence: 0.95,
  evidence: 'Based on {count} supplier record(s) in your account',
}

/**
 * Rule: tracksInventory = true when purchaseOrderCount ≥ 3
 * Sustained purchasing is strong evidence of inventory tracking intent.
 * Source: USAGE_OBSERVATION (multiple purchase orders = sustained usage)
 */
const ruleTracksInventoryFromPurchases: ObservationRule<'tracksInventory'> = {
  label: 'Tracks inventory (has created 3+ purchase orders)',
  characteristic: 'tracksInventory',
  value: true,
  condition: s => (s.purchaseOrderCount ?? 0) >= 3,
  confidence: 0.95,
  evidence: 'Based on {count} purchase order(s) recorded',
}

/**
 * Rule: teamSize = 'small' when employeeCount ≥ 2 AND ≤ 5
 * Employee count is directly observable and highly reliable.
 */
const ruleTeamSizeSmall: ObservationRule<'teamSize'> = {
  label: 'Team size: small (2–5 employees)',
  characteristic: 'teamSize',
  value: 'small',
  condition: s => (s.employeeCount ?? 0) >= 2 && (s.employeeCount ?? 0) <= 5,
  confidence: 0.99,
  evidence: 'Based on {count} active employee account(s)',
}

/**
 * Rule: teamSize = 'medium' when employeeCount ≥ 6
 * Evaluated after ruleTeamSizeSmall — if both conditions were met, the engine
 * takes the higher-confidence or later-fired value (medium wins when count ≥ 6).
 */
const ruleTeamSizeMedium: ObservationRule<'teamSize'> = {
  label: 'Team size: medium (6+ employees)',
  characteristic: 'teamSize',
  value: 'medium',
  condition: s => (s.employeeCount ?? 0) >= 6 && (s.employeeCount ?? 0) <= 20,
  confidence: 0.99,
  evidence: 'Based on {count} active employee account(s)',
}

/**
 * Rule: teamSize = 'large' when employeeCount > 20
 */
const ruleTeamSizeLarge: ObservationRule<'teamSize'> = {
  label: 'Team size: large (21+ employees)',
  characteristic: 'teamSize',
  value: 'large',
  condition: s => (s.employeeCount ?? 0) > 20,
  confidence: 0.99,
  evidence: 'Based on {count} active employee account(s)',
}

/**
 * Rule: locationCount = 'multiple' when branchCount ≥ 2
 * Creating a second branch is a definitive, irreversible event — confidence 1.0.
 */
const ruleLocationCountMultiple: ObservationRule<'locationCount'> = {
  label: 'Multiple locations (2+ branches)',
  characteristic: 'locationCount',
  value: 'multiple',
  condition: s => (s.branchCount ?? 0) >= 2,
  confidence: 1.0,
  evidence: 'Based on {count} active branch(es) in your account',
}

/**
 * Rule: tracksCustomers = true when customerCount ≥ 10
 * 10 customers is a meaningful threshold — enough to show deliberate tracking intent.
 */
const ruleTracksCustomers: ObservationRule<'tracksCustomers'> = {
  label: 'Tracks customers (10+ customer records)',
  characteristic: 'tracksCustomers',
  value: true,
  condition: s => (s.customerCount ?? 0) >= 10,
  confidence: 0.85,
  evidence: 'Based on {count} customer record(s) in your account',
}

// ---------------------------------------------------------------------------
// Phase 3b rules
// ---------------------------------------------------------------------------

/**
 * Rule: inventoryCriticality = 'strict' when > 4 inventory adjustments in last 30 days.
 * High-frequency adjustments signal that stock accuracy is business-critical.
 * inventoryAdjustmentCount in the summary is a 30-day rolling count.
 */
const ruleInventoryCriticalityStrict: ObservationRule<'inventoryCriticality'> = {
  label: 'Strict inventory criticality (4+ adjustments in 30 days)',
  characteristic: 'inventoryCriticality',
  value: 'strict',
  condition: s => (s.inventoryAdjustmentCount ?? 0) > 4,
  confidence: 0.85,
  evidence: 'Based on frequent stock adjustments in your account',
}

/**
 * Rule: inventoryCriticality = 'strict' when ≥ 10 inventory adjustments total.
 * Strict criticality variant with lower frequency: the business clearly cares about stock.
 * Lower confidence than high-frequency strict — this is a floor, not a ceiling.
 */
const ruleInventoryCriticalityStrictLowFreq: ObservationRule<'inventoryCriticality'> = {
  label: 'Strict inventory criticality (10+ total adjustments)',
  characteristic: 'inventoryCriticality',
  value: 'strict',
  condition: s => (s.inventoryAdjustmentCount ?? 0) >= 10,
  confidence: 0.8,
  evidence: 'Based on {count} inventory adjustment(s) recorded',
}

/**
 * Rule: hasProductComponents = true when componentRecipeCount ≥ 3.
 * 3+ recipes is clear evidence of intentional component/recipe usage.
 */
const ruleHasProductComponents: ObservationRule<'hasProductComponents'> = {
  label: 'Has product components/recipes (3+ recipes defined)',
  characteristic: 'hasProductComponents',
  value: true,
  condition: s => (s.componentRecipeCount ?? 0) >= 3,
  confidence: 0.95,
  evidence: 'Based on {count} product recipe(s) in your catalogue',
}

/**
 * Rule: hasRegularWaste = true when wasteRecordCount ≥ 2.
 * 2 waste disposal records shows it's a recurring operation, not a one-off.
 */
const ruleHasRegularWaste: ObservationRule<'hasRegularWaste'> = {
  label: 'Has regular waste (2+ waste disposal records)',
  characteristic: 'hasRegularWaste',
  value: true,
  condition: s => (s.wasteRecordCount ?? 0) >= 2,
  confidence: 0.8,
  evidence: 'Based on {count} waste disposal record(s)',
}

/**
 * Rule: reconcilesCash = true when reconciliationCount ≥ 5.
 * 5 reconciliations shows a habitual end-of-day cash reconciliation workflow.
 */
const ruleReconcilesCash: ObservationRule<'reconcilesCash'> = {
  label: 'Reconciles cash (5+ cash reconciliation sessions)',
  characteristic: 'reconcilesCash',
  value: true,
  condition: s => (s.reconciliationCount ?? 0) >= 5,
  confidence: 0.9,
  evidence: 'Based on {count} cash reconciliation session(s)',
}

/**
 * Rule: requiresApprovals = true when approvalWorkflowUsageCount ≥ 3.
 * 3+ approval uses shows the workflow is part of the operating rhythm.
 */
const ruleRequiresApprovals: ObservationRule<'requiresApprovals'> = {
  label: 'Requires approvals (3+ approval workflow events)',
  characteristic: 'requiresApprovals',
  value: true,
  condition: s => (s.approvalWorkflowUsageCount ?? 0) >= 3,
  confidence: 0.85,
  evidence: 'Based on {count} approval workflow event(s)',
}

/**
 * Rule: offersDelivery = true when deliveryOrderCount ≥ 3.
 * 3 delivery orders is enough to confirm delivery is part of the business model.
 */
const ruleOffersDelivery: ObservationRule<'offersDelivery'> = {
  label: 'Offers delivery (3+ delivery orders processed)',
  characteristic: 'offersDelivery',
  value: true,
  condition: s => (s.deliveryOrderCount ?? 0) >= 3,
  confidence: 0.9,
  evidence: 'Based on {count} delivery order(s) processed',
}

/**
 * Rule: dailyTransactionVolume = 'medium' when avgDailyTransactions is 11–100.
 * Medium volume: busy enough to matter, not high-frequency.
 */
const ruleDailyVolumeMedium: ObservationRule<'dailyTransactionVolume'> = {
  label: 'Medium transaction volume (11–100 transactions/day average)',
  characteristic: 'dailyTransactionVolume',
  value: 'medium',
  condition: s => (s.avgDailyTransactions ?? 0) >= 11 && (s.avgDailyTransactions ?? 0) <= 100,
  confidence: 0.9,
  evidence: 'Based on an average of {count} transactions per day',
}

/**
 * Rule: dailyTransactionVolume = 'high' when avgDailyTransactions > 100.
 * High volume: well above 100/day, operational pressures are significant.
 */
const ruleDailyVolumeHigh: ObservationRule<'dailyTransactionVolume'> = {
  label: 'High transaction volume (100+ transactions/day average)',
  characteristic: 'dailyTransactionVolume',
  value: 'high',
  condition: s => (s.avgDailyTransactions ?? 0) > 100,
  confidence: 0.9,
  evidence: 'Based on an average of {count} transactions per day',
}

/**
 * Rule: hasProductVariants = true when productVariantCount ≥ 3.
 * 3+ variants (e.g. sizes, colors) shows variants are used intentionally.
 */
const ruleHasProductVariants: ObservationRule<'hasProductVariants'> = {
  label: 'Has product variants (3+ variant records)',
  characteristic: 'hasProductVariants',
  value: true,
  condition: s => (s.productVariantCount ?? 0) >= 3,
  confidence: 0.9,
  evidence: 'Based on {count} product variant(s) in your catalogue',
}

// ---------------------------------------------------------------------------
// Phase 5 rules — GROWTH_THRESHOLD category
// ---------------------------------------------------------------------------
//
// These rules detect growth milestones. They differ from standard rules:
//   - They set characteristics whose *change* is the signal.
//   - The CharacteristicsEngine's changedFields output drives the
//     MilestoneEngine, which boosts recommendation scores for related capabilities.
//   - Confidence is high because these are direct, countable events.
//
// Growth rules do NOT advance the lifecycle on their own — they produce
// characteristics changes that the MilestoneEngine reacts to.

/**
 * Rule: catalogueSize = 'large' when productCount ≥ 100.
 * A large product catalogue signals the need for better catalogue management,
 * reporting, and variant organisation.
 */
const ruleCatalogueSizeLarge: ObservationRule<'catalogueSize'> = {
  label: 'Large product catalogue (100+ products)',
  characteristic: 'catalogueSize',
  value: 'large',
  condition: s => (s.productCount ?? 0) >= 100,
  confidence: 0.99,
  evidence: 'Based on {count} products in your catalogue',
}

/**
 * Rule: catalogueSize = 'medium' when productCount ≥ 25.
 * Medium catalogue: enough variety to benefit from categories and search.
 * Evaluated before large so large wins when productCount ≥ 100.
 */
const ruleCatalogueSizeMedium: ObservationRule<'catalogueSize'> = {
  label: 'Medium product catalogue (25–99 products)',
  characteristic: 'catalogueSize',
  value: 'medium',
  condition: s => (s.productCount ?? 0) >= 25 && (s.productCount ?? 0) < 100,
  confidence: 0.95,
  evidence: 'Based on {count} products in your catalogue',
}

/**
 * Rule: dailyTransactionVolume growth signal — detects rapid growth.
 * Fires when current-period transactions are ≥ 2× the previous 30-day count.
 * Both windows must have ≥ 10 transactions to avoid false positives on tiny bases.
 *
 * NOTE: This rule sets dailyTransactionVolume = 'high' as a proxy signal.
 *       The MilestoneEngine uses the changedFields check (combined with the
 *       transactionsPrev30Days comparison) for the "rapid growth" milestone.
 *       This rule's job is to produce the characteristic change; the milestone
 *       logic in MilestoneEngine handles the doubling ratio check separately.
 */
const ruleRapidGrowthSignal: ObservationRule<'dailyTransactionVolume'> = {
  label: 'Rapid growth signal (volume doubled in 30 days)',
  characteristic: 'dailyTransactionVolume',
  value: 'high',
  condition: s => {
    const current = s.transactionsLast30Days ?? 0
    const prev = s.transactionsPrev30Days ?? 0
    // Require meaningful base (≥ 10 in both windows) and genuine doubling
    return current >= 10 && prev >= 10 && current >= prev * 2
  },
  confidence: 0.88,
  evidence: 'Your transaction volume doubled compared to the previous 30 days',
}

/**
 * Rule: teamSize = 'small' from 'solo' — first employee hired.
 * Already covered by ruleTeamSizeSmall (employeeCount 2–5).
 * This alias exists so GROWTH_OBSERVATION_RULES can export it separately,
 * making it easy to test the growth boundary in isolation.
 */
const ruleFirstEmployeeHired: ObservationRule<'teamSize'> = ruleTeamSizeSmall

/**
 * Rule: teamSize = 'medium' — team reaches 6 people.
 * Already covered by ruleTeamSizeMedium (employeeCount 6–20).
 * Aliased here for the same reason as ruleFirstEmployeeHired.
 */
const ruleTeamReachesSix: ObservationRule<'teamSize'> = ruleTeamSizeMedium

/**
 * Rule: locationCount = 'multiple' — second branch opened.
 * Already covered by ruleLocationCountMultiple.
 * Aliased here for completeness in GROWTH_OBSERVATION_RULES.
 */
const ruleSecondBranchOpened: ObservationRule<'locationCount'> = ruleLocationCountMultiple

// ---------------------------------------------------------------------------
// Full registry export (Phase 2 + Phase 3b + Phase 5 = 21 rules)
// ---------------------------------------------------------------------------

/**
 * OBSERVATION_RULES — the full observation rule registry.
 *
 * Rules are evaluated in order by the CharacteristicsEngine.
 * When multiple rules update the same field, the one with the highest
 * confidence wins. Rules with equal confidence: the last one wins.
 *
 * Count: 7 (Phase 2) + 10 (Phase 3b) + 4 new (Phase 5) = 21 rules total.
 * (teamSize and locationCount growth rules are aliases of existing rules,
 *  so they do not increase the registry count.)
 */
export const OBSERVATION_RULES: ObservationRule[] = [
  // Phase 2
  ruleUsesSuppliers,
  ruleTracksInventoryFromPurchases,
  ruleTeamSizeSmall,
  ruleTeamSizeMedium,
  ruleTeamSizeLarge,
  ruleLocationCountMultiple,
  ruleTracksCustomers,
  // Phase 3b
  ruleInventoryCriticalityStrict,
  ruleInventoryCriticalityStrictLowFreq,
  ruleHasProductComponents,
  ruleHasRegularWaste,
  ruleReconcilesCash,
  ruleRequiresApprovals,
  ruleOffersDelivery,
  ruleDailyVolumeMedium,
  ruleDailyVolumeHigh,
  ruleHasProductVariants,
  // Phase 5 — growth threshold rules (new additions)
  ruleCatalogueSizeMedium,
  ruleCatalogueSizeLarge,
  ruleRapidGrowthSignal,
]

/**
 * GROWTH_OBSERVATION_RULES — Phase 5 growth-threshold rules only.
 *
 * The MilestoneEngine uses this list to check whether a changed field
 * was triggered by a growth rule. Exported separately so callers can
 * react specifically to growth events without scanning the full registry.
 */
export const GROWTH_OBSERVATION_RULES: ObservationRule[] = [
  ruleFirstEmployeeHired,
  ruleTeamReachesSix,
  ruleSecondBranchOpened,
  ruleCatalogueSizeMedium,
  ruleCatalogueSizeLarge,
  ruleRapidGrowthSignal,
]

/**
 * Returns only the rules relevant to a specific characteristic.
 * Useful for targeted unit tests.
 */
export function getRulesForCharacteristic<K extends string>(characteristic: K): ObservationRule[] {
  return OBSERVATION_RULES.filter(r => r.characteristic === characteristic)
}
