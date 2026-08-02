/**
 * partner-reseller-pricing-strategy.ts
 *
 * PartnerResellerPricingStrategy
 *
 * Calculates pricing for partner/reseller scenarios where a margin is added
 * on top of the standard catalog price. The partner sees cost price;
 * their customer sees retail price (cost + margin).
 *
 * Implementation:
 *   - Runs FeatureBasedPricingStrategy with the base catalog prices
 *   - Adds a SURCHARGE line representing the partner margin
 *   - grandTotal = base grand total + margin surcharge
 *
 * config.partnerMarginPct determines the margin in basis points (e.g. 2000 = 20%).
 * If partnerMarginPct = 0, this strategy is equivalent to FeatureBasedPricingStrategy.
 *
 * Architectural contract: zero infrastructure imports.
 */

import type { PricingCatalogDTO, PricingConfig, PricingInput, QuoteLineItemDTO } from '../types'
import { QuoteLineType } from '../types'
import { PricingResultFactory } from '../value-objects/pricing-result'
import { FeatureBasedPricingStrategy } from './feature-based-pricing-strategy'

export const PartnerResellerPricingStrategy = {
  /**
   * Calculate partner/reseller pricing with a margin surcharge.
   *
   * @param input   - Standard pricing input
   * @param config  - Must have partnerMarginPct > 0 to add margin (basis points)
   * @param catalog - Active catalog DTO
   */
  calculate(input: PricingInput, config: PricingConfig, catalog: PricingCatalogDTO) {
    if (config.partnerMarginPct === 0) {
      // No margin — identical to standard feature-based pricing
      return FeatureBasedPricingStrategy.calculate(input, config, catalog)
    }

    // Get the base calculation from FeatureBasedPricingStrategy
    const base = FeatureBasedPricingStrategy.calculate(input, config, catalog)

    // Compute the partner margin on top of the base grand total (post-tax)
    const marginAmount = Math.round((base.grandTotal * config.partnerMarginPct) / 10000)

    if (marginAmount === 0) {
      return base
    }

    // Build the margin surcharge line
    const marginLine: QuoteLineItemDTO = {
      lineType: QuoteLineType.SURCHARGE,
      featureKey: null,
      description: `Partner margin (${config.partnerMarginPct / 100}%)`,
      quantity: 1,
      unitAmount: marginAmount,
      lineAmount: marginAmount,
      negotiatedPrice: null,
      sortOrder: base.lineItems.length,
    }

    const newGrandTotal = base.grandTotal + marginAmount

    // Rebuild the result with the margin line and updated grand total.
    // We need to adjust the subtotal field so the invariant holds:
    // subtotalMonthly - discountAmount + taxAmount = grandTotal
    // Simplest: treat margin as part of subtotal
    const newSubtotal = base.subtotalMonthly + marginAmount

    return PricingResultFactory.create({
      calculatedAt: base.calculatedAt,
      catalogVersion: base.catalogVersion,
      lineItems: [...base.lineItems, marginLine],
      subtotalMonthly: newSubtotal,
      discountAmount: base.discountAmount,
      taxAmount: base.taxAmount,
      grandTotal: newGrandTotal,
      taxBreakdown: [...base.taxBreakdown],
      annualGrandTotal: base.annualGrandTotal !== null ? base.annualGrandTotal + marginAmount * 12 : null,
      annualSavings: base.annualSavings,
      oneTimeFees: base.oneTimeFees,
      resolvedFeatureKeys: [...base.resolvedFeatureKeys],
      appliedBundleKey: base.appliedBundleKey,
    })
  },
}
