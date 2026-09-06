/**
 * feature-based-pricing-strategy.ts
 *
 * FeatureBasedPricingStrategy
 *
 * The primary strategy for COMPOSABLE_FEATURES subscriptions. Prices are
 * derived from the active PricingCatalog's FeaturePrice records for each
 * selected feature. Bundle detection and discount application are built in.
 *
 * Pipeline:
 *   1. Map selected features â†’ FeaturePriceDTO entries from the catalog
 *   2. Build FEATURE line items (one per selected feature)
 *   3. Run bundle detection â†’ apply highest-saving qualifying bundle discount
 *   4. Apply branch surcharge if branchCount > 1
 *   5. Calculate tax
 *   6. Optionally compute annual totals with annual discount
 *
 * Architectural contract: zero infrastructure imports.
 */

import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import type { FeatureBundleVersionDTO, FeaturePriceDTO, PricingCatalogDTO, PricingConfig, PricingInput, QuoteLineItemDTO } from '../types'
import { BundlePricingType, QuoteLineType } from '../types'
import { PricingResultFactory } from '../value-objects/pricing-result'
import { type TaxBreakdownLine, TaxBreakdownLineFactory } from '../value-objects/tax-breakdown-line'

export const FeatureBasedPricingStrategy = {
  /**
   * Calculate composable feature-based pricing.
   *
   * @param input   - Selected features, branch count, annual flag, etc.
   * @param config  - Policy: tax rate, annual discount, branch rate
   * @param catalog - Full catalog DTO with feature prices and bundle versions
   */
  calculate(input: PricingInput, config: PricingConfig, catalog: PricingCatalogDTO) {
    const { selectedFeatureKeys, calculatedAt, requestAnnual, branchCount } = input

    // -----------------------------------------------------------------------
    // Step 1: Build FEATURE line items from catalog prices
    // -----------------------------------------------------------------------
    const featurePriceMap = new Map<CapabilityKey, FeaturePriceDTO>(catalog.featurePrices.map(fp => [fp.featureKey, fp]))

    const featureLines: QuoteLineItemDTO[] = []
    let subtotalBeforeDiscount = 0
    let sortOrder = 0

    for (const key of selectedFeatureKeys) {
      const fp = featurePriceMap.get(key)
      if (!fp) continue // Feature not priced in this catalog — skip

      // Negotiated price override (enterprise path uses this)
      const effectivePrice = input.negotiatedPrices?.[key] ?? fp.monthlyPrice

      featureLines.push({
        lineType: QuoteLineType.FEATURE,
        featureKey: key,
        description: fp.featureLabel,
        quantity: 1,
        unitAmount: effectivePrice,
        lineAmount: effectivePrice,
        negotiatedPrice: input.negotiatedPrices?.[key] ?? null,
        sortOrder: sortOrder++,
      })

      if (!fp.isIncludedInBase) {
        subtotalBeforeDiscount += effectivePrice
      }
    }

    // -----------------------------------------------------------------------
    // Step 2: Bundle detection — find the highest-saving qualifying bundle
    // -----------------------------------------------------------------------
    const selectedSet = new Set(selectedFeatureKeys)
    const { bundleKey, discountLine } = detectAndApplyBundle(selectedSet, subtotalBeforeDiscount, catalog.bundleVersions, sortOrder)
    const discountAmount = discountLine ? Math.abs(discountLine.lineAmount) : 0
    if (discountLine) sortOrder++

    // -----------------------------------------------------------------------
    // Step 3: Branch surcharge
    // -----------------------------------------------------------------------
    let branchSurchargeLine: QuoteLineItemDTO | null = null
    if (branchCount > 1 && config.branchMonthlyRate > 0) {
      const extraBranches = branchCount - 1
      const surchargeAmount = extraBranches * config.branchMonthlyRate
      branchSurchargeLine = {
        lineType: QuoteLineType.SURCHARGE,
        featureKey: null,
        description: `Branch surcharge (${extraBranches} additional branch${extraBranches > 1 ? 'es' : ''})`,
        quantity: extraBranches,
        unitAmount: config.branchMonthlyRate,
        lineAmount: surchargeAmount,
        negotiatedPrice: null,
        sortOrder: sortOrder++,
      }
    }
    const branchSurcharge = branchSurchargeLine?.lineAmount ?? 0

    // -----------------------------------------------------------------------
    // Step 4: Tax
    // -----------------------------------------------------------------------
    const subtotalAfterDiscount = subtotalBeforeDiscount - discountAmount + branchSurcharge
    const taxBreakdownLines: TaxBreakdownLine[] = []
    let taxAmount = 0
    let taxLine: QuoteLineItemDTO | null = null

    if (config.taxRate > 0) {
      const breakdown = TaxBreakdownLineFactory.exclusive(`VAT ${config.taxRate / 100}%`, config.taxRate, subtotalAfterDiscount)
      taxBreakdownLines.push(breakdown)
      taxAmount = breakdown.taxAmount
      taxLine = {
        lineType: QuoteLineType.TAX,
        featureKey: null,
        description: `VAT ${config.taxRate / 100}%`,
        quantity: 1,
        unitAmount: taxAmount,
        lineAmount: taxAmount,
        negotiatedPrice: null,
        sortOrder: sortOrder++,
      }
    }

    const grandTotal = subtotalAfterDiscount + taxAmount

    // -----------------------------------------------------------------------
    // Step 5: Assemble all line items in display order
    // -----------------------------------------------------------------------
    const allLines: QuoteLineItemDTO[] = [
      ...featureLines,
      ...(discountLine ? [discountLine] : []),
      ...(branchSurchargeLine ? [branchSurchargeLine] : []),
      ...(taxLine ? [taxLine] : []),
    ]

    // -----------------------------------------------------------------------
    // Step 6: Annual pricing
    // -----------------------------------------------------------------------
    let annualGrandTotal: number | null = null
    let annualSavings: number | null = null
    if (requestAnnual) {
      const grossAnnual = grandTotal * 12
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
      calculatedAt,
      catalogVersion: catalog.version,
      lineItems: allLines,
      subtotalMonthly: subtotalBeforeDiscount,
      discountAmount,
      taxAmount,
      grandTotal,
      taxBreakdown: taxBreakdownLines,
      annualGrandTotal,
      annualSavings,
      oneTimeFees: 0,
      resolvedFeatureKeys: selectedFeatureKeys as CapabilityKey[],
      appliedBundleKey: bundleKey,
    })
  },
}

// ---------------------------------------------------------------------------
// Bundle detection helper
// Finds the single highest-saving qualifying bundle from the catalog.
// ---------------------------------------------------------------------------
function detectAndApplyBundle(
  selectedSet: Set<CapabilityKey>,
  subtotal: number,
  bundleVersions: FeatureBundleVersionDTO[],
  sortOrder: number,
): { bundleKey: string | null; discountLine: QuoteLineItemDTO | null } {
  let bestSaving = 0
  let bestBundle: FeatureBundleVersionDTO | null = null
  let bestDiscountLine: QuoteLineItemDTO | null = null

  for (const bv of bundleVersions) {
    // Count how many of the bundle's features are in the selection
    const matchCount = bv.featureKeys.filter(k => selectedSet.has(k)).length
    const required = bv.minimumItems > 0 ? bv.minimumItems : bv.featureKeys.length
    if (matchCount < required) continue

    // Calculate the saving this bundle provides
    const saving = computeBundleSaving(subtotal, bv)
    if (saving <= 0) continue

    if (saving > bestSaving) {
      bestSaving = saving
      bestBundle = bv
      bestDiscountLine = {
        lineType: QuoteLineType.BUNDLE_DISCOUNT,
        featureKey: null,
        description: `${bv.bundleLabel} (bundle discount)`,
        quantity: 1,
        unitAmount: -saving,
        lineAmount: -saving,
        negotiatedPrice: null,
        sortOrder,
      }
    }
  }

  return { bundleKey: bestBundle?.bundleKey ?? null, discountLine: bestDiscountLine }
}

function computeBundleSaving(subtotal: number, bv: FeatureBundleVersionDTO): number {
  switch (bv.pricingType) {
    case BundlePricingType.PERCENTAGE_DISCOUNT:
      return Math.round((subtotal * bv.discountValue) / 10000)
    case BundlePricingType.FLAT_DISCOUNT:
      return Math.min(bv.discountValue, subtotal) // Never exceed subtotal
    case BundlePricingType.FIXED_PRICE:
      // Saving = subtotal - fixed price (only positive if fixed < subtotal)
      return Math.max(0, subtotal - bv.discountValue)
    default:
      return 0
  }
}
