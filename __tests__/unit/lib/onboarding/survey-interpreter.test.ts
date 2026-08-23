/**
 * survey-interpreter.test.ts — Pattern A unit tests for SurveyInterpreter
 *
 * Coverage:
 *  - Every Q1 multi-select answer maps to the correct characteristic
 *  - Q2 team size mappings
 *  - Q3 payment timing mappings
 *  - Q3a fulfillment → requiresTableManagement, offersDelivery
 *  - Q3b order customization → hasOrderCustomization
 *  - Q4 inventory tracking level → tracksInventory + inventoryCriticality
 *  - Q4a restock method → usesSuppliers + requiresGoodsReceipt
 *  - Q4b stock locations → hasMultipleStockLocations
 *  - Q4c expiry → hasPerishables
 *  - Q5/Q5a role separation and approvals
 *  - Q6/Q6a/Q6b VAT registration and compliance
 *  - Q7/Q8 location count and expansion
 *  - Missing answers resolve to safe defaults
 *  - Solo + immediate + no inventory = LITE_POS signal (correct characteristics)
 *  - F&B survey path produces inclusive tax display mode
 *  - Skipped survey (empty answers) returns safe defaults
 */

import { describe, expect, it } from 'vitest'
import { interpretSurvey } from '@/lib/onboarding/survey-interpreter'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'
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
} from '@/lib/onboarding/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a complete survey with all the default answers for a simple solo retailer */
function baseSurvey() {
  return {
    q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
    q2_team_size: Q2_OPTIONS.JUST_ME,
    q3_payment_timing: Q3_OPTIONS.IMMEDIATE,
    q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
    q4a_restock_method: Q4A_OPTIONS.INFORMAL,
    q6_vat_registered: Q6_OPTIONS.NO,
    q7_location_count: Q7_OPTIONS.ONE,
  }
}

// ---------------------------------------------------------------------------
// Q1 — business type multi-select
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q1 business type', () => {
  it('physical_goods → sellsPhysicalGoods=true', () => {
    const result = interpretSurvey({ q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS] })
    expect(result.sellsPhysicalGoods).toBe(true)
    expect(result.sellsPreparedFood).toBe(false)
    expect(result.sellsServices).toBe(false)
    expect(result.sellsRawMaterials).toBe(false)
  })

  it('food_beverage → sellsPreparedFood=true', () => {
    const result = interpretSurvey({ q1_business_type: [Q1_OPTIONS.FOOD_BEVERAGE] })
    expect(result.sellsPreparedFood).toBe(true)
    expect(result.sellsPhysicalGoods).toBe(false)
  })

  it('services → sellsServices=true', () => {
    const result = interpretSurvey({ q1_business_type: [Q1_OPTIONS.SERVICES] })
    expect(result.sellsServices).toBe(true)
  })

  it('raw_materials → sellsRawMaterials=true', () => {
    const result = interpretSurvey({ q1_business_type: [Q1_OPTIONS.RAW_MATERIALS] })
    expect(result.sellsRawMaterials).toBe(true)
  })

  it('multi-select: physical_goods + food_beverage → both true', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS, Q1_OPTIONS.FOOD_BEVERAGE],
    })
    expect(result.sellsPhysicalGoods).toBe(true)
    expect(result.sellsPreparedFood).toBe(true)
  })

  it('empty Q1 → defaults: sellsPhysicalGoods=true (safe default)', () => {
    const result = interpretSurvey({ q1_business_type: [] })
    expect(result.sellsPhysicalGoods).toBe(DEFAULT_CHARACTERISTICS.sellsPhysicalGoods)
  })

  it('missing Q1 → sellsPhysicalGoods=true (safe default)', () => {
    const result = interpretSurvey({})
    expect(result.sellsPhysicalGoods).toBe(DEFAULT_CHARACTERISTICS.sellsPhysicalGoods)
  })
})

// ---------------------------------------------------------------------------
// Q2 — team size
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q2 team size', () => {
  it('just_me → teamSize=solo', () => {
    expect(interpretSurvey({ q2_team_size: Q2_OPTIONS.JUST_ME }).teamSize).toBe('solo')
  })

  it('2_to_5 → teamSize=small', () => {
    expect(interpretSurvey({ q2_team_size: Q2_OPTIONS.TWO_TO_FIVE }).teamSize).toBe('small')
  })

  it('6_to_20 → teamSize=medium', () => {
    expect(interpretSurvey({ q2_team_size: Q2_OPTIONS.SIX_TO_TWENTY }).teamSize).toBe('medium')
  })

  it('more_than_20 → teamSize=large', () => {
    expect(interpretSurvey({ q2_team_size: Q2_OPTIONS.MORE_THAN_TWENTY }).teamSize).toBe('large')
  })

  it('missing Q2 → teamSize=solo (safe default)', () => {
    expect(interpretSurvey({}).teamSize).toBe(DEFAULT_CHARACTERISTICS.teamSize)
  })
})

// ---------------------------------------------------------------------------
// Q3 — payment timing
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q3 payment timing', () => {
  it('pay_right_away → paymentTiming=immediate', () => {
    expect(interpretSurvey({ q3_payment_timing: Q3_OPTIONS.IMMEDIATE }).paymentTiming).toBe('immediate')
  })

  it('order_then_pay → paymentTiming=deferred', () => {
    expect(interpretSurvey({ q3_payment_timing: Q3_OPTIONS.DEFERRED }).paymentTiming).toBe('deferred')
  })

  it('both → paymentTiming=mixed', () => {
    expect(interpretSurvey({ q3_payment_timing: Q3_OPTIONS.MIXED }).paymentTiming).toBe('mixed')
  })

  it('missing Q3 → paymentTiming=immediate (safe default)', () => {
    expect(interpretSurvey({}).paymentTiming).toBe(DEFAULT_CHARACTERISTICS.paymentTiming)
  })
})

// ---------------------------------------------------------------------------
// Q3a — fulfillment method (only relevant when payment is not immediate)
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q3a fulfillment', () => {
  it('dine_in + deferred → requiresTableManagement=true', () => {
    const result = interpretSurvey({
      q3_payment_timing: Q3_OPTIONS.DEFERRED,
      q3a_fulfillment: [Q3A_OPTIONS.DINE_IN],
    })
    expect(result.requiresTableManagement).toBe(true)
  })

  it('delivery + deferred → offersDelivery=true', () => {
    const result = interpretSurvey({
      q3_payment_timing: Q3_OPTIONS.DEFERRED,
      q3a_fulfillment: [Q3A_OPTIONS.DELIVERY],
    })
    expect(result.offersDelivery).toBe(true)
  })

  it('q3a ignored when payment is immediate', () => {
    const result = interpretSurvey({
      q3_payment_timing: Q3_OPTIONS.IMMEDIATE,
      q3a_fulfillment: [Q3A_OPTIONS.DINE_IN, Q3A_OPTIONS.DELIVERY],
    })
    expect(result.requiresTableManagement).toBe(false)
    expect(result.offersDelivery).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q3b — order customization
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q3b order customization', () => {
  it('often → hasOrderCustomization=true', () => {
    const result = interpretSurvey({
      q3_payment_timing: Q3_OPTIONS.DEFERRED,
      q3b_order_customization: Q3B_OPTIONS.OFTEN,
    })
    expect(result.hasOrderCustomization).toBe(true)
  })

  it('occasionally → hasOrderCustomization=true', () => {
    const result = interpretSurvey({
      q3_payment_timing: Q3_OPTIONS.DEFERRED,
      q3b_order_customization: Q3B_OPTIONS.OCCASIONALLY,
    })
    expect(result.hasOrderCustomization).toBe(true)
  })

  it('never → hasOrderCustomization=false', () => {
    const result = interpretSurvey({
      q3_payment_timing: Q3_OPTIONS.DEFERRED,
      q3b_order_customization: Q3B_OPTIONS.NEVER,
    })
    expect(result.hasOrderCustomization).toBe(false)
  })

  it('q3b ignored when payment is immediate', () => {
    const result = interpretSurvey({
      q3_payment_timing: Q3_OPTIONS.IMMEDIATE,
      q3b_order_customization: Q3B_OPTIONS.OFTEN,
    })
    expect(result.hasOrderCustomization).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q4 — inventory tracking
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q4 inventory tracking', () => {
  it('yes_strict → tracksInventory=true, inventoryCriticality=strict', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4_inventory_tracking: Q4_OPTIONS.YES_STRICT,
    })
    expect(result.tracksInventory).toBe(true)
    expect(result.inventoryCriticality).toBe('strict')
  })

  it('yes_relaxed → tracksInventory=true, inventoryCriticality=relaxed', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
    })
    expect(result.tracksInventory).toBe(true)
    expect(result.inventoryCriticality).toBe('relaxed')
  })

  it('periodic → tracksInventory=true, inventoryCriticality=relaxed', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4_inventory_tracking: Q4_OPTIONS.PERIODIC,
    })
    expect(result.tracksInventory).toBe(true)
    expect(result.inventoryCriticality).toBe('relaxed')
  })

  it('no → tracksInventory=false, inventoryCriticality=none', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4_inventory_tracking: Q4_OPTIONS.NO,
    })
    expect(result.tracksInventory).toBe(false)
    expect(result.inventoryCriticality).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// Q4a — restock method
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q4a restock method', () => {
  it('formal_suppliers → usesSuppliers=true', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
      q4a_restock_method: Q4A_OPTIONS.FORMAL_SUPPLIERS,
    })
    expect(result.usesSuppliers).toBe(true)
  })

  it('informal → usesSuppliers=false', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
      q4a_restock_method: Q4A_OPTIONS.INFORMAL,
    })
    expect(result.usesSuppliers).toBe(false)
  })

  it('formal_suppliers + small team → requiresGoodsReceipt=true', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q2_team_size: Q2_OPTIONS.TWO_TO_FIVE,
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
      q4a_restock_method: Q4A_OPTIONS.FORMAL_SUPPLIERS,
    })
    expect(result.requiresGoodsReceipt).toBe(true)
  })

  it('formal_suppliers + solo → requiresGoodsReceipt=false', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q2_team_size: Q2_OPTIONS.JUST_ME,
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
      q4a_restock_method: Q4A_OPTIONS.FORMAL_SUPPLIERS,
    })
    expect(result.requiresGoodsReceipt).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q4b — multiple stock locations
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q4b stock locations', () => {
  it('yes + small team + tracks inventory → hasMultipleStockLocations=true', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q2_team_size: Q2_OPTIONS.TWO_TO_FIVE,
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
      q4b_stock_locations: Q4B_OPTIONS.YES,
    })
    expect(result.hasMultipleStockLocations).toBe(true)
  })

  it('yes + solo → hasMultipleStockLocations=false (solo cannot have multiple locations)', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q2_team_size: Q2_OPTIONS.JUST_ME,
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
      q4b_stock_locations: Q4B_OPTIONS.YES,
    })
    expect(result.hasMultipleStockLocations).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q4c — expiry
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q4c product expiry', () => {
  it('yes_many + physical goods → hasPerishables=true', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4c_expiry: Q4C_OPTIONS.YES_MANY,
    })
    expect(result.hasPerishables).toBe(true)
  })

  it('some + food → hasPerishables=true', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.FOOD_BEVERAGE],
      q4c_expiry: Q4C_OPTIONS.SOME,
    })
    expect(result.hasPerishables).toBe(true)
  })

  it('no → hasPerishables=false', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q4c_expiry: Q4C_OPTIONS.NO,
    })
    expect(result.hasPerishables).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q5 — role separation
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q5 role separation', () => {
  it('yes + small team → hasRoleSeparation=true', () => {
    const result = interpretSurvey({
      q2_team_size: Q2_OPTIONS.TWO_TO_FIVE,
      q5_role_separation: Q5_OPTIONS.YES,
    })
    expect(result.hasRoleSeparation).toBe(true)
  })

  it('solo ignores role separation → hasRoleSeparation=false', () => {
    const result = interpretSurvey({
      q2_team_size: Q2_OPTIONS.JUST_ME,
      q5_role_separation: Q5_OPTIONS.YES,
    })
    expect(result.hasRoleSeparation).toBe(false)
  })

  it('yes_strict approvals + role separation + medium team → requiresApprovals=true', () => {
    const result = interpretSurvey({
      q2_team_size: Q2_OPTIONS.SIX_TO_TWENTY,
      q5_role_separation: Q5_OPTIONS.YES,
      q5a_approvals: Q5A_OPTIONS.YES_STRICT,
    })
    expect(result.requiresApprovals).toBe(true)
  })

  it('no approvals → requiresApprovals=false', () => {
    const result = interpretSurvey({
      q2_team_size: Q2_OPTIONS.SIX_TO_TWENTY,
      q5_role_separation: Q5_OPTIONS.YES,
      q5a_approvals: Q5A_OPTIONS.NO,
    })
    expect(result.requiresApprovals).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q6 — VAT registration
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q6 VAT registration', () => {
  it('yes → isVatRegistered=true', () => {
    expect(interpretSurvey({ q6_vat_registered: Q6_OPTIONS.YES }).isVatRegistered).toBe(true)
  })

  it('no → isVatRegistered=false', () => {
    expect(interpretSurvey({ q6_vat_registered: Q6_OPTIONS.NO }).isVatRegistered).toBe(false)
  })

  it('unsure → isVatRegistered=false (safe default)', () => {
    expect(interpretSurvey({ q6_vat_registered: Q6_OPTIONS.UNSURE }).isVatRegistered).toBe(false)
  })

  it('VAT registered + inclusive → taxDisplayMode=inclusive', () => {
    const result = interpretSurvey({
      q6_vat_registered: Q6_OPTIONS.YES,
      q6a_tax_display: Q6A_OPTIONS.INCLUSIVE,
    })
    expect(result.taxDisplayMode).toBe('inclusive')
  })

  it('VAT registered + exclusive → taxDisplayMode=exclusive', () => {
    const result = interpretSurvey({
      q6_vat_registered: Q6_OPTIONS.YES,
      q6a_tax_display: Q6A_OPTIONS.EXCLUSIVE,
    })
    expect(result.taxDisplayMode).toBe('exclusive')
  })

  it('not VAT registered → taxDisplayMode=exclusive (safe default)', () => {
    const result = interpretSurvey({ q6_vat_registered: Q6_OPTIONS.NO })
    expect(result.taxDisplayMode).toBe('exclusive')
  })

  it('BIR compliant receipts → requiresOfficialReceipts=true', () => {
    const result = interpretSurvey({
      q6_vat_registered: Q6_OPTIONS.YES,
      q6b_official_receipts: Q6B_OPTIONS.BIR_COMPLIANT,
    })
    expect(result.requiresOfficialReceipts).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Q7/Q8 — location
// ---------------------------------------------------------------------------

describe('interpretSurvey — Q7/Q8 location', () => {
  it('multiple → locationCount=multiple', () => {
    expect(interpretSurvey({ q7_location_count: Q7_OPTIONS.MULTIPLE }).locationCount).toBe('multiple')
  })

  it('one → locationCount=one', () => {
    expect(interpretSurvey({ q7_location_count: Q7_OPTIONS.ONE }).locationCount).toBe('one')
  })

  it('multiple locations → plansExpansion=true', () => {
    expect(interpretSurvey({ q7_location_count: Q7_OPTIONS.MULTIPLE }).plansExpansion).toBe(true)
  })

  it('expansion yes → plansExpansion=true', () => {
    const result = interpretSurvey({
      q7_location_count: Q7_OPTIONS.ONE,
      q8_expansion_plans: Q8_OPTIONS.YES,
    })
    expect(result.plansExpansion).toBe(true)
  })

  it('expansion possibly → plansExpansion=true', () => {
    const result = interpretSurvey({
      q7_location_count: Q7_OPTIONS.ONE,
      q8_expansion_plans: Q8_OPTIONS.POSSIBLY,
    })
    expect(result.plansExpansion).toBe(true)
  })

  it('expansion no → plansExpansion=false', () => {
    const result = interpretSurvey({
      q7_location_count: Q7_OPTIONS.ONE,
      q8_expansion_plans: Q8_OPTIONS.NO,
    })
    expect(result.plansExpansion).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// End-to-end business scenarios
// ---------------------------------------------------------------------------

describe('interpretSurvey — business scenarios', () => {
  it('solo vendor (6 questions) → LITE_POS signal characteristics', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.PHYSICAL_GOODS],
      q2_team_size: Q2_OPTIONS.JUST_ME,
      q3_payment_timing: Q3_OPTIONS.IMMEDIATE,
      q4_inventory_tracking: Q4_OPTIONS.NO,
      q6_vat_registered: Q6_OPTIONS.NO,
      q7_location_count: Q7_OPTIONS.ONE,
    })

    expect(result.teamSize).toBe('solo')
    expect(result.paymentTiming).toBe('immediate')
    expect(result.tracksInventory).toBe(false)
    expect(result.usesSuppliers).toBe(false)
    expect(result.isVatRegistered).toBe(false)
    expect(result.locationCount).toBe('one')
    expect(result.hasRoleSeparation).toBe(false)
    expect(result.requiresApprovals).toBe(false)
  })

  it('restaurant (full path) → F&B characteristics', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.FOOD_BEVERAGE],
      q2_team_size: Q2_OPTIONS.TWO_TO_FIVE,
      q3_payment_timing: Q3_OPTIONS.DEFERRED,
      q3a_fulfillment: [Q3A_OPTIONS.DINE_IN, Q3A_OPTIONS.TAKEOUT],
      q3b_order_customization: Q3B_OPTIONS.OFTEN,
      q4_inventory_tracking: Q4_OPTIONS.YES_RELAXED,
      q4a_restock_method: Q4A_OPTIONS.FORMAL_SUPPLIERS,
      q4c_expiry: Q4C_OPTIONS.YES_MANY,
      q5_role_separation: Q5_OPTIONS.YES,
      q6_vat_registered: Q6_OPTIONS.YES,
      q6a_tax_display: Q6A_OPTIONS.INCLUSIVE,
      q7_location_count: Q7_OPTIONS.ONE,
    })

    expect(result.sellsPreparedFood).toBe(true)
    expect(result.paymentTiming).toBe('deferred')
    expect(result.requiresTableManagement).toBe(true)
    expect(result.hasOrderCustomization).toBe(true)
    expect(result.tracksInventory).toBe(true)
    expect(result.usesSuppliers).toBe(true)
    expect(result.hasPerishables).toBe(true)
    expect(result.hasRoleSeparation).toBe(true)
    expect(result.isVatRegistered).toBe(true)
    expect(result.taxDisplayMode).toBe('inclusive')
  })

  it('empty answers → all safe defaults', () => {
    const result = interpretSurvey({})

    expect(result.teamSize).toBe(DEFAULT_CHARACTERISTICS.teamSize)
    expect(result.paymentTiming).toBe(DEFAULT_CHARACTERISTICS.paymentTiming)
    expect(result.tracksInventory).toBe(DEFAULT_CHARACTERISTICS.tracksInventory)
    expect(result.isVatRegistered).toBe(DEFAULT_CHARACTERISTICS.isVatRegistered)
    expect(result.handlesCash).toBe(DEFAULT_CHARACTERISTICS.handlesCash)
    expect(result.locationCount).toBe(DEFAULT_CHARACTERISTICS.locationCount)
  })

  it('food prep + missing Q4 → hasProductComponents=true (inferred from food business)', () => {
    const result = interpretSurvey({
      q1_business_type: [Q1_OPTIONS.FOOD_BEVERAGE],
      q2_team_size: Q2_OPTIONS.JUST_ME,
    })
    expect(result.hasProductComponents).toBe(true)
  })
})
