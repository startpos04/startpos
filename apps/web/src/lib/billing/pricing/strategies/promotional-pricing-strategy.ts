/**
 * promotional-pricing-strategy.ts
 *
 * PromotionalPricingStrategy
 *
 * Wraps FeatureBasedPricingStrategy and applies an additional promotional
 * discount on top of any bundle discounts already calculated.
 *
 * The promo discount is:
 *   - Applied to the post-bundle subtotal (after bundle discount, before tax)
 *   - Added as a PROMO_DISCOUNT line item (negative amount)
 *   - Only active when config.promoCodeEnabled = true
 *   - Discount percentage provided via input.promoDiscountPct (basis points)
 *
 * Architectural contract: zero infrastructure imports.
 */

import type { PricingCatalogDTO, PricingConfig, PricingInput, QuoteLineItemDTO } from '../types'
import { QuoteLineType } from '../types'
import { PricingResultFactory } from '../value-objects/pricing-result'
import { TaxBreakdownLineFactory } from '../value-objects/tax-breakdown-line'
import { FeatureBasedPricingStrategy } from './feature-based-pricing-strategy'

export const PromotionalPricingStrategy = {
  /**
   * Calculate pricing with an additional promotional discount.
   *
   * @param input   - Must include promoDiscountPct (basis points) for the promo to apply
   * @param config  - promoCodeEnabled must be true, or promo is skipped
   * @param catalog - Active catalog DTO
   */
  calculate(input: PricingInput, config: PricingConfig, catalog: PricingCatalogDTO) {
    const promoDiscountPct = input.promoDiscountPct ?? 0

    if (!config.promoCodeEnabled || promoDiscountPct === 0) {
      // No promo active — delegate to standard feature-based pricing
      return FeatureBasedPricingStrategy.calculate(input, config, catalog)
    }

    // Get the base calculation (includes bundle discount already)
    const base = FeatureBasedPricingStrategy.calculate(input, config, catalog)

    // Apply promo discount on the post-bundle, pre-tax subtotal
    // base.grandTotal = subtotal - bundleDiscount + tax
    // We want to discount the pre-tax net: base.subtotalMonthly - base.discountAmount
    const prePromoNet = base.subtotalMonthly - base.discountAmount
    const promoAmount = Math.round((prePromoNet * promoDiscountPct) / 10000)

    if (promoAmount === 0) {
      return base
    }

    // Build promo line
    const promoLine: QuoteLineItemDTO = {
      lineType: QuoteLineType.PROMO_DISCOUNT,
      featureKey: null,
      description: `Promotional discount (${promoDiscountPct / 100}%)`,
      quantity: 1,
      unitAmount: -promoAmount,
      lineAmount: -promoAmount,
      negotiatedPrice: null,
      sortOrder: base.lineItems.length,
    }

    const newDiscountAmount = base.discountAmount + promoAmount
    const postPromoNet = prePromoNet - promoAmount

    // Recalculate tax on the new net
    let taxAmount = 0
    const taxBreakdown = [...base.taxBreakdown]
    const newLineItems = base.lineItems.filter(l => l.lineType !== QuoteLineType.TAX) // Remove old tax line
    newLineItems.push(promoLine)

    if (config.taxRate > 0) {
      const breakdown = TaxBreakdownLineFactory.exclusive(`VAT ${config.taxRate / 100}%`, config.taxRate, postPromoNet)
      taxAmount = breakdown.taxAmount
      taxBreakdown.splice(0, taxBreakdown.length, breakdown)
      newLineItems.push({
        lineType: QuoteLineType.TAX,
        featureKey: null,
        description: `VAT ${config.taxRate / 100}%`,
        quantity: 1,
        unitAmount: taxAmount,
        lineAmount: taxAmount,
        negotiatedPrice: null,
        sortOrder: newLineItems.length,
      })
    }

    const newGrandTotal = postPromoNet + taxAmount

    // Annual recalculation
    let annualGrandTotal: number | null = null
    let annualSavings: number | null = null
    if (input.requestAnnual) {
      const grossAnnual = newGrandTotal * 12
      if (config.annualDiscountPct > 0) {
        const saving = Math.round((grossAnnual * config.annualDiscountPct) / 10000)
        annualSavings = saving
        annualGrandTotal = grossAnnual - saving
      } else {
        annualSavings = 0
        annualGrandTotal = grossAnnual
      }
    }

    return PricingResultFactory.create({
      calculatedAt: base.calculatedAt,
      catalogVersion: base.catalogVersion,
      lineItems: newLineItems,
      subtotalMonthly: base.subtotalMonthly,
      discountAmount: newDiscountAmount,
      taxAmount,
      grandTotal: newGrandTotal,
      taxBreakdown,
      annualGrandTotal,
      annualSavings,
      oneTimeFees: base.oneTimeFees,
      resolvedFeatureKeys: [...base.resolvedFeatureKeys],
      appliedBundleKey: base.appliedBundleKey,
    })
  },
}
