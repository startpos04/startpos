/**
 * survey-interpreter.ts — Pure function: SurveyAnswers → BusinessCharacteristics
 *
 * Translates raw survey answers into the stable BusinessCharacteristics contract.
 * This is the initial hypothesis about what the business needs.
 *
 * Design:
 *   - Pure function: no IO, no side effects, deterministic output
 *   - Missing/skipped answers resolve to safe defaults from DEFAULT_CHARACTERISTICS
 *   - Q1 (business type) is validated: registration should require it
 *
 * Validation rule (enforced at the registration layer, not here):
 *   Q1 must have at least one answer. If the survey is submitted without Q1,
 *   complete-registration.ts must reject it before calling this function.
 */

import { DEFAULT_CHARACTERISTICS } from './defaults'
import type { BusinessCharacteristics, SurveyAnswers } from './types'
import {
  Q1_OPTIONS,
  Q2_OPTIONS,
  Q3_OPTIONS,
  Q3A_OPTIONS,
  Q3B_OPTIONS,
  Q4_OPTIONS,
  Q4A_OPTIONS,
  Q4B_OPTIONS,
  Q4C_OPTIONS,
  Q5_OPTIONS,
  Q5A_OPTIONS,
  Q6_OPTIONS,
  Q6A_OPTIONS,
  Q6B_OPTIONS,
  Q7_OPTIONS,
  Q8_OPTIONS,
  Q9_OPTIONS,
  Q10_OPTIONS,
  Q11_OPTIONS,
  Q12_OPTIONS,
} from './types'

/**
 * Translates SurveyAnswers into a BusinessCharacteristics object.
 *
 * Any unanswered question resolves to its safe default. The result is always
 * a complete BusinessCharacteristics — no optional fields.
 *
 * @param answers - Raw survey answers keyed by question ID
 * @returns Complete BusinessCharacteristics with defaults for any gaps
 */
export function interpretSurvey(answers: SurveyAnswers): BusinessCharacteristics {
  const d = DEFAULT_CHARACTERISTICS

  // ── Q1: What does your business primarily do? (multi-select) ────────────────
  const q1 = answers.q1_business_type ?? []
  const sellsPhysicalGoods = q1.includes(Q1_OPTIONS.PHYSICAL_GOODS)
  const sellsPreparedFood = q1.includes(Q1_OPTIONS.FOOD_BEVERAGE)
  const sellsServices = q1.includes(Q1_OPTIONS.SERVICES)
  const sellsRawMaterials = q1.includes(Q1_OPTIONS.RAW_MATERIALS)

  // If Q1 was completely skipped (empty array), assume physical goods as a safe default
  const effectiveSellsPhysicalGoods = q1.length === 0 ? d.sellsPhysicalGoods : sellsPhysicalGoods

  // ── Q2: How many people work here? ──────────────────────────────────────────
  const q2 = answers.q2_team_size
  const teamSize: BusinessCharacteristics['teamSize'] =
    q2 === Q2_OPTIONS.JUST_ME
      ? 'solo'
      : q2 === Q2_OPTIONS.TWO_TO_FIVE
        ? 'small'
        : q2 === Q2_OPTIONS.SIX_TO_TWENTY
          ? 'medium'
          : q2 === Q2_OPTIONS.MORE_THAN_TWENTY
            ? 'large'
            : d.teamSize

  // ── Q3: When does a customer pay? ───────────────────────────────────────────
  const q3 = answers.q3_payment_timing
  const paymentTiming: BusinessCharacteristics['paymentTiming'] =
    q3 === Q3_OPTIONS.IMMEDIATE ? 'immediate' : q3 === Q3_OPTIONS.DEFERRED ? 'deferred' : q3 === Q3_OPTIONS.MIXED ? 'mixed' : d.paymentTiming

  // ── Q3a: How do customers receive what they ordered? (if deferred/mixed) ────
  const q3a = answers.q3a_fulfillment ?? []
  const requiresTableManagement = paymentTiming !== 'immediate' ? q3a.includes(Q3A_OPTIONS.DINE_IN) : d.requiresTableManagement
  const offersDelivery = paymentTiming !== 'immediate' ? q3a.includes(Q3A_OPTIONS.DELIVERY) : d.offersDelivery

  // ── Q3b: Do customers customize or add extras to orders? ───────────────────
  const q3b = answers.q3b_order_customization
  const hasOrderCustomization = paymentTiming !== 'immediate' ? q3b === Q3B_OPTIONS.OFTEN || q3b === Q3B_OPTIONS.OCCASIONALLY : d.hasOrderCustomization

  // ── Q4: Do you track stock? ─────────────────────────────────────────────────
  const q4 = answers.q4_inventory_tracking
  const tracksInventory =
    sellsPhysicalGoods || sellsRawMaterials || sellsPreparedFood || q1.length === 0 ? q4 !== Q4_OPTIONS.NO && q4 !== undefined : d.tracksInventory

  const inventoryCriticality: BusinessCharacteristics['inventoryCriticality'] =
    q4 === Q4_OPTIONS.YES_STRICT ? 'strict' : q4 === Q4_OPTIONS.YES_RELAXED ? 'relaxed' : q4 === Q4_OPTIONS.PERIODIC ? 'relaxed' : 'none'

  // ── Q4a: How do you replenish stock? ────────────────────────────────────────
  const q4a = answers.q4a_restock_method
  const usesSuppliers = tracksInventory ? q4a === Q4A_OPTIONS.FORMAL_SUPPLIERS : d.usesSuppliers
  const requiresGoodsReceipt = usesSuppliers && teamSize !== 'solo'

  // ── Q4b: Multiple stock locations? ──────────────────────────────────────────
  const q4b = answers.q4b_stock_locations
  const hasMultipleStockLocations = tracksInventory && teamSize !== 'solo' ? q4b === Q4B_OPTIONS.YES : d.hasMultipleStockLocations

  // ── Q4c: Do any products have expiry dates? ─────────────────────────────────
  const q4c = answers.q4c_expiry
  const hasPerishables =
    sellsPhysicalGoods || sellsPreparedFood || sellsRawMaterials ? q4c === Q4C_OPTIONS.YES_MANY || q4c === Q4C_OPTIONS.SOME : d.hasPerishables

  // ── Q5: Different access levels for staff? (only if team ≠ solo) ────────────
  const q5 = answers.q5_role_separation
  const hasRoleSeparation = teamSize !== 'solo' ? q5 === Q5_OPTIONS.YES : d.hasRoleSeparation

  // ── Q5a: Actions need manager approval? ─────────────────────────────────────
  const q5a = answers.q5a_approvals
  const requiresApprovals = teamSize !== 'solo' && hasRoleSeparation ? q5a === Q5A_OPTIONS.YES_STRICT || q5a === Q5A_OPTIONS.YES_SOME : d.requiresApprovals

  // Operational tasks are now asked directly via Q10 (see below)

  // ── Q6: VAT registered? ─────────────────────────────────────────────────────
  const q6 = answers.q6_vat_registered
  const isVatRegistered = q6 === Q6_OPTIONS.YES

  // ── Q6a: Tax in price or added on top? ──────────────────────────────────────
  const q6a = answers.q6a_tax_display
  const taxDisplayMode: BusinessCharacteristics['taxDisplayMode'] = isVatRegistered
    ? q6a === Q6A_OPTIONS.INCLUSIVE
      ? 'inclusive'
      : 'exclusive'
    : d.taxDisplayMode

  // ── Q6b: Official receipts required? ────────────────────────────────────────
  const q6b = answers.q6b_official_receipts
  const requiresOfficialReceipts = isVatRegistered ? q6b === Q6B_OPTIONS.BIR_COMPLIANT : d.requiresOfficialReceipts

  // Corporate buyers implied by VAT + official receipts
  const hasCorporateBuyers = isVatRegistered && requiresOfficialReceipts

  // ── Q7: One location or multiple? ───────────────────────────────────────────
  const q7 = answers.q7_location_count
  const locationCount: BusinessCharacteristics['locationCount'] = q7 === Q7_OPTIONS.MULTIPLE ? 'multiple' : 'one'

  // ── Q8: Plans to open more locations? ───────────────────────────────────────
  // Always asked — even solo users may plan to expand.
  const q8 = answers.q8_expansion_plans
  const plansExpansion = locationCount === 'multiple' || q8 === Q8_OPTIONS.YES || q8 === Q8_OPTIONS.POSSIBLY

  // ── Q9: Do you reconcile cash at end of shift? ──────────────────────────────
  const q9 = answers.q9_cash_reconciliation
  const reconcilesCash = q9 === Q9_OPTIONS.YES

  // ── Q10: Do you assign tasks to staff? ──────────────────────────────────────
  const q10 = answers.q10_operational_tasks
  // Tasks are enabled ONLY when explicitly requested (Q10 = YES).
  // No auto-enable for unanswered cases — survey is now shown to all team sizes.
  const usesOperationalTasks = q10 === Q10_OPTIONS.YES

  // ── Q11: Do you prepare items in batches? ───────────────────────────────────
  const q11 = answers.q11_batch_preparation
  const preparesBatchesWithRecipes = q11 === Q11_OPTIONS.YES_RECIPES
  const preparesBatches = q11 === Q11_OPTIONS.YES_RECIPES || q11 === Q11_OPTIONS.YES_NO_RECIPES

  // ── Derived fields ───────────────────────────────────────────────────────────

  // Daily transaction volume is not directly surveyed in Phase 1 — inferred from
  // team size and business type as a reasonable initial estimate.
  // Phase 2+ will override this with USAGE_OBSERVATION from actual transaction data.
  const dailyTransactionVolume: BusinessCharacteristics['dailyTransactionVolume'] =
    teamSize === 'large' ? 'high' : teamSize === 'medium' ? 'medium' : (sellsPreparedFood || sellsRawMaterials) && teamSize === 'small' ? 'low' : 'low'

  // Catalogue size is inferred from business type in Phase 1.
  // Phase 2+ will update this from actual product counts.
  const catalogueSize: BusinessCharacteristics['catalogueSize'] = sellsRawMaterials
    ? 'small'
    : teamSize === 'large'
      ? 'large'
      : teamSize === 'medium'
        ? 'medium'
        : 'small'

  // Product variants and components are currently not surveyed — default to false.
  // Phase 2+ will infer these from product data.
  const hasProductVariants = d.hasProductVariants
  const hasProductComponents = sellsPreparedFood // food businesses often have recipes

  // Waste is common when there are perishables
  const hasRegularWaste = hasPerishables

  // External integrations: large teams or raw material businesses often need them
  const needsExternalIntegrations = teamSize === 'large' || (sellsRawMaterials && teamSize === 'medium')

  // Loyalty intent: not currently surveyed — default false
  const hasLoyaltyIntent = d.hasLoyaltyIntent

  // Tracks customers: VAT + official receipts requires customer data
  const tracksCustomers = isVatRegistered && hasCorporateBuyers

  return {
    dailyTransactionVolume,
    teamSize,
    locationCount,
    sellsPhysicalGoods: effectiveSellsPhysicalGoods,
    sellsPreparedFood,
    sellsServices,
    sellsRawMaterials,
    catalogueSize,
    hasProductVariants,
    hasProductComponents,
    hasPerishables,
    paymentTiming,
    requiresTableManagement,
    hasOrderCustomization,
    offersDelivery,
    tracksInventory,
    inventoryCriticality,
    hasMultipleStockLocations,
    usesSuppliers,
    requiresGoodsReceipt,
    hasRegularWaste,
    hasRoleSeparation,
    requiresApprovals,
    usesOperationalTasks,
    handlesCash: d.handlesCash, // always true in Phase 1
    reconcilesCash,
    isVatRegistered,
    taxDisplayMode,
    requiresOfficialReceipts,
    hasCorporateBuyers,
    tracksCustomers,
    hasLoyaltyIntent,
    plansExpansion,
    needsExternalIntegrations,
    // Intent fields — not yet surveyed; default to false
    intentToAddMoreStaff: d.intentToAddMoreStaff,
    intentToTrackInventory: d.intentToTrackInventory,
    intentToManageSuppliers: d.intentToManageSuppliers,
    intentToOfferDelivery: d.intentToOfferDelivery,
    intentToOpenMoreLocations: d.intentToOpenMoreLocations,
    intentToIntegrateExternalSystems: d.intentToIntegrateExternalSystems,
    // Batch preparation fields
    preparesBatches,
    preparesBatchesWithRecipes,
  }
}

/**
 * Extracts the business registration status from Q12 survey answer.
 *
 * This value is stored directly on the Business model (not in BusinessCharacteristics)
 * because it's a compliance/legal status, not an operational characteristic.
 *
 * @param answers - Raw survey answers keyed by question ID
 * @returns BusinessRegistrationStatus enum value ('REGISTERED', 'PENDING', 'UNREGISTERED', or default 'UNREGISTERED')
 */
export function extractRegistrationStatus(answers: SurveyAnswers): 'REGISTERED' | 'PENDING' | 'UNREGISTERED' | 'EXPIRED' {
  const q12 = answers.q12_business_registration

  if (q12 === Q12_OPTIONS.REGISTERED) return 'REGISTERED'
  if (q12 === Q12_OPTIONS.PENDING) return 'PENDING'
  if (q12 === Q12_OPTIONS.UNREGISTERED) return 'UNREGISTERED'

  // Default to UNREGISTERED if Q12 was skipped
  return 'UNREGISTERED'
}
