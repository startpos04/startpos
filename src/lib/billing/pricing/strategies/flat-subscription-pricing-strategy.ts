/**
 * flat-subscription-pricing-strategy.ts
 *
 * FlatSubscriptionPricingStrategy
 *
 * Used for standard monthly/annual subscription plans where the price is a
 * single flat fee regardless of which features are used. This is the simplest
 * strategy — it produces a single FEATURE line item at the plan's flat rate.
 *
 * When to use: BillingModel = MONTHLY_SUBSCRIPTION plans quoted via the
 * pricing calculator for comparison against composable options.
 *
 * Architectural contract: zero infrastructure imports. Receives all data
 * as plain DTOs via PricingEngine.calculate(). Returns a PricingResult.
 */

import type { CapabilityKey } from '@/lib/entitlement/capability-keys'
import type { PricingCatalogDTO, PricingConfig, PricingInput, QuoteLineItemDTO } from '../types'
import { QuoteLineType } from '../types'
import { PricingResultFactory } from '../value-objects/pricing-result'
import { TaxBreakdownLineFactory } from '../value-objects/tax-breakdown-line'

export type FlatSubscriptionInput = PricingInput & {
  /** The flat monthly price for the plan, in cents */
  flatMonthlyPrice: number
  /** Human-readable plan name for the line item description */
  planLabel: string
}

export const FlatSubscriptionPricingStrategy = {
  /**
   * Calculate pricing for a flat-rate subscription plan.
   *
   * @param input   - PricingInput extended with flatMonthlyPrice and planLabel
   * @param config  - Policy configuration (tax rate, annual discount, etc.)
   * @param catalog - PricingCatalogDTO (used for catalogVersion only in flat mode)
   */
  calculate(input: FlatSubscriptionInput, config: PricingConfig, catalog: PricingCatalogDTO) {
    const { flatMonthlyPrice, planLabel, calculatedAt, requestAnnual } = input

    // Build the single flat subscription fee line
    const featureLine: QuoteLineItemDTO = {
      lineType: QuoteLineType.FEATURE,
      featureKey: null,
      description: planLabel,
      quantity: 1,
      unitAmount: flatMonthlyPrice,
      lineAmount: flatMonthlyPrice,
      negotiatedPrice: null,
      sortOrder: 0,
    }

    const lineItems: QuoteLineItemDTO[] = [featureLine]
    const subtotalMonthly = flatMonthlyPrice

    // Tax
    const taxLine = buildTaxLine(subtotalMonthly, config, lineItems.length)
    const taxAmount = taxLine?.taxAmount ?? 0
    if (taxLine) lineItems.push(taxLine.line)

    const grandTotal = subtotalMonthly + taxAmount

    // Annual
    let annualGrandTotal: number | null = null
    let annualSavings: number | null = null
    if (requestAnnual && config.annualDiscountPct > 0) {
      const gross = grandTotal * 12
      const discount = Math.round((gross * config.annualDiscountPct) / 10000)
      annualSavings = discount
      annualGrandTotal = gross - discount
    } else if (requestAnnual) {
      annualGrandTotal = grandTotal * 12
      annualSavings = 0
    }

    return PricingResultFactory.create({
      calculatedAt,
      catalogVersion: catalog.version,
      lineItems,
      subtotalMonthly,
      discountAmount: 0,
      taxAmount,
      grandTotal,
      taxBreakdown: taxLine ? [taxLine.breakdown] : [],
      annualGrandTotal,
      annualSavings,
      oneTimeFees: 0,
      resolvedFeatureKeys: input.selectedFeatureKeys as CapabilityKey[],
      appliedBundleKey: null,
    })
  },
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildTaxLine(
  subtotal: number,
  config: PricingConfig,
  nextSortOrder: number,
): { line: QuoteLineItemDTO; breakdown: ReturnType<typeof TaxBreakdownLineFactory.exclusive>; taxAmount: number } | null {
  if (config.taxRate === 0) return null
  const breakdown = TaxBreakdownLineFactory.exclusive(`VAT ${config.taxRate / 100}%`, config.taxRate, subtotal)
  const line: QuoteLineItemDTO = {
    lineType: QuoteLineType.TAX,
    featureKey: null,
    description: `VAT ${config.taxRate / 100}%`,
    quantity: 1,
    unitAmount: breakdown.taxAmount,
    lineAmount: breakdown.taxAmount,
    negotiatedPrice: null,
    sortOrder: nextSortOrder,
  }
  return { line, breakdown, taxAmount: breakdown.taxAmount }
}
