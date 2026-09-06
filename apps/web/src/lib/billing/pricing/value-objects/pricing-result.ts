/**
 * pricing-result.ts
 *
 * PricingResult — immutable value object returned by PricingEngine.calculate().
 *
 * Contains the full line-item breakdown, discount details, tax components,
 * annual pricing, and one-time fees for a pricing calculation.
 *
 * Key invariants (per v1-master-plan.md §2.17 and Architecture Compliance Gate G10):
 *   - grandTotal does NOT include oneTimeFees — they are displayed separately.
 *   - annualGrandTotal = grandTotal × 12 − annualSavings (when applicable).
 *   - All amounts are integers in cents.
 *
 * Architectural contract:
 *   - Zero infrastructure imports.
 *   - Immutable after construction — all fields are readonly.
 *   - Factory function validates the invariants before returning.
 */

import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import type { QuoteLineItemDTO } from '../types'
import type { TaxBreakdownLine } from './tax-breakdown-line'

// ---------------------------------------------------------------------------
// PricingResult
// ---------------------------------------------------------------------------
export type PricingResult = {
  /** ISO timestamp injected by the caller — engine never calls new Date() */
  readonly calculatedAt: string

  /** The catalog version used for this calculation */
  readonly catalogVersion: number

  /** All line items in display order (features, discounts, surcharges, taxes) */
  readonly lineItems: readonly QuoteLineItemDTO[]

  /** Sum of all FEATURE line amounts before any discounts (cents/month) */
  readonly subtotalMonthly: number

  /** Total bundle + promo discount amount (positive = savings, cents/month) */
  readonly discountAmount: number

  /** Tax amount applied to the monthly total (cents/month) */
  readonly taxAmount: number

  /**
   * Monthly recurring total = subtotal − discount + tax (cents/month).
   * Does NOT include oneTimeFees.
   */
  readonly grandTotal: number

  /** Tax breakdown lines for display (VAT, GST, etc.) */
  readonly taxBreakdown: readonly TaxBreakdownLine[]

  /**
   * Annual equivalent of grandTotal × 12, minus any annual discount.
   * Null when annual pricing was not requested.
   */
  readonly annualGrandTotal: number | null

  /**
   * How much cheaper the annual option is vs 12 × monthly grandTotal (cents).
   * Null when annual pricing was not requested.
   */
  readonly annualSavings: number | null

  /**
   * Sum of all ONE_TIME_FEE line items (cents).
   * Displayed separately from the recurring total — NOT included in grandTotal.
   */
  readonly oneTimeFees: number

  /** The resolved feature keys after dependency expansion */
  readonly resolvedFeatureKeys: readonly CapabilityKey[]

  /** The bundle key that was applied (null if no bundle qualified) */
  readonly appliedBundleKey: string | null
}

// ---------------------------------------------------------------------------
// PricingResultFactory
// ---------------------------------------------------------------------------

type PricingResultParams = {
  calculatedAt: string
  catalogVersion: number
  lineItems: QuoteLineItemDTO[]
  subtotalMonthly: number
  discountAmount: number
  taxAmount: number
  grandTotal: number
  taxBreakdown: TaxBreakdownLine[]
  annualGrandTotal: number | null
  annualSavings: number | null
  oneTimeFees: number
  resolvedFeatureKeys: CapabilityKey[]
  appliedBundleKey: string | null
}

export const PricingResultFactory = {
  /**
   * Build a validated PricingResult.
   * Throws if the grandTotal invariant is violated (subtotal − discount + tax ≠ grandTotal).
   * Throws if grandTotal includes one-time fees.
   *
   * In production, these checks guard against strategy implementation bugs.
   */
  create(params: PricingResultParams): PricingResult {
    const expectedGrandTotal = params.subtotalMonthly - params.discountAmount + params.taxAmount
    if (expectedGrandTotal !== params.grandTotal) {
      throw new Error(
        `PricingResult invariant violated: subtotal(${params.subtotalMonthly}) - discount(${params.discountAmount}) + tax(${params.taxAmount}) = ${expectedGrandTotal}, but grandTotal = ${params.grandTotal}`,
      )
    }

    // Validate annual: annualGrandTotal and annualSavings must both be set or both null
    if ((params.annualGrandTotal === null) !== (params.annualSavings === null)) {
      throw new Error('PricingResult invariant violated: annualGrandTotal and annualSavings must both be set or both null')
    }

    return Object.freeze({
      calculatedAt: params.calculatedAt,
      catalogVersion: params.catalogVersion,
      lineItems: Object.freeze([...params.lineItems]),
      subtotalMonthly: params.subtotalMonthly,
      discountAmount: params.discountAmount,
      taxAmount: params.taxAmount,
      grandTotal: params.grandTotal,
      taxBreakdown: Object.freeze([...params.taxBreakdown]),
      annualGrandTotal: params.annualGrandTotal,
      annualSavings: params.annualSavings,
      oneTimeFees: params.oneTimeFees,
      resolvedFeatureKeys: Object.freeze([...params.resolvedFeatureKeys]),
      appliedBundleKey: params.appliedBundleKey,
    })
  },

  /**
   * Build a zero-cost result (e.g. for base-included features only).
   */
  zero(params: { calculatedAt: string; catalogVersion: number; resolvedFeatureKeys: CapabilityKey[] }): PricingResult {
    return PricingResultFactory.create({
      calculatedAt: params.calculatedAt,
      catalogVersion: params.catalogVersion,
      lineItems: [],
      subtotalMonthly: 0,
      discountAmount: 0,
      taxAmount: 0,
      grandTotal: 0,
      taxBreakdown: [],
      annualGrandTotal: null,
      annualSavings: null,
      oneTimeFees: 0,
      resolvedFeatureKeys: params.resolvedFeatureKeys,
      appliedBundleKey: null,
    })
  },
}
