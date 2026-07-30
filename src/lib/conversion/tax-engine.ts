/**
 * tax-engine
 *
 * BIR-compliant VAT calculation engine for Philippine POS systems.
 * Mirrors the InventoryEngine pattern: pure static functions, no side effects,
 * fully testable, and safe to call from any layer (server, client, worker).
 *
 * References:
 *  - NIRC Section 106/108 (VAT on goods/services)
 *  - RR 7-2024 (EOPT Act implementing rules)
 *  - RR 16-2005 (VAT regulations, as amended)
 *  - RA 9994 / RA 7277 (Senior Citizen / PWD discount)
 *  - RA 10963 TRAIN Law (VAT threshold, 12% rate)
 */

import { type PriceConfiguration, TaxCategory } from 'prisma/generated/prisma/enums'
import type { posItem } from './pos-stock-engine'
import { PriceEngine } from './price-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaxEngineConfig = {
  /** VAT rate as a decimal fraction, e.g. 0.12 for 12% */
  vatRate: number
  /** Whether prices already include VAT (retail) or are pre-tax (corporate) */
  priceConfiguration: PriceConfiguration
  /** Whether this org/branch is VAT-registered */
  isVatRegistered: boolean
}

export type LineItem = {
  /** Amount in CENTS (integer). Already quantity-multiplied. */
  grossAmount: number
  taxCategory: TaxCategory
}

/**
 * The raw, unrounded breakdown of a single line item.
 * All values in CENTS.
 */
export type LineBreakdown = {
  grossAmount: number
  netAmount: number // Pre-tax base (vatableSales equivalent per line)
  vatAmount: number
  vatExemptAmount: number
  zeroRatedAmount: number
  taxCategory: TaxCategory
}

/**
 * The final, rounded summary of a full transaction.
 * Maps 1:1 to Transaction model fields.
 * All values in CENTS.
 */
export type VatSummary = {
  vatableSales: number // Net of VAT (BIR field: gross / 1.12)
  vatAmount: number // 12% component
  vatExemptSales: number // VAT-exempt line totals
  zeroRatedSales: number // Zero-rated line totals
  taxAmount: number // == vatAmount (convenience alias for Transaction.taxAmount)
  subtotal: number // Sum of all grossAmounts before discounts
  totalAmount: number // Final amount charged to customer, after discounts
  isVatApplied: boolean // Snapshot flag for Transaction.isVatApplied
  vatRate: number // Snapshot of rate used (e.g. 0.12) → store as 12.0 in DB
}

export type DiscountInput = {
  /** General discount in cents */
  discount?: number
  /** SC/PWD discount in cents. Applied BEFORE VAT per BIR rules. */
  scPwdDiscount?: number
}

export type ScPwdInput = {
  /** 20% of the selling price EXCLUDING VAT (RA 9994 / RA 7277) */
  sellingPriceExVat: number
}

// ---------------------------------------------------------------------------
// TaxEngine
// ---------------------------------------------------------------------------

export const TaxEngine = {
  // -------------------------------------------------------------------------
  // CORE: Line-item breakdown
  // -------------------------------------------------------------------------

  buildLineItems: (items: posItem[]): LineItem[] => {
    return items.flatMap(item => {
      const lines: LineItem[] = []

      // Main variant line — quantity-multiplied
      lines.push({
        grossAmount: item.variant.price * item.quantity,
        taxCategory: item.variant.taxCategory,
      })

      // Each selected addon — quantity-multiplied
      for (const addon of item.addons) {
        if (addon.priceOverride != null) {
          lines.push({
            grossAmount: addon.priceOverride * item.quantity,
            // Addons inherit host variant's taxCategory; adjust if your model differs
            taxCategory: item.variant.taxCategory,
          })
        }
      }

      return lines
    })
  },

  /**
   * Breaks down a single line item into its VAT components.
   * Returns unrounded values — rounding happens once at summary level.
   *
   * @example
   * // Inclusive, vatable, ₱112.00 item (11200 cents)
   * TaxEngine.breakdownLine({ grossAmount: 11200, taxCategory: 'VATABLE' }, config)
   * // → { netAmount: 10000, vatAmount: 1200, ... }
   */
  breakdownLine: (item: LineItem, config: TaxEngineConfig): LineBreakdown => {
    const { grossAmount, taxCategory } = item
    const { vatRate, priceConfiguration, isVatRegistered } = config

    // Non-VAT orgs: treat everything as exempt regardless of product taxCategory
    if (!isVatRegistered) {
      return {
        grossAmount,
        netAmount: grossAmount,
        vatAmount: 0,
        vatExemptAmount: grossAmount,
        zeroRatedAmount: 0,
        taxCategory: TaxCategory.EXEMPT,
      }
    }

    if (taxCategory === TaxCategory.EXEMPT) {
      return {
        grossAmount,
        netAmount: grossAmount,
        vatAmount: 0,
        vatExemptAmount: grossAmount,
        zeroRatedAmount: 0,
        taxCategory,
      }
    }

    if (taxCategory === 'ZERO_RATED') {
      return {
        grossAmount,
        netAmount: grossAmount,
        vatAmount: 0,
        vatExemptAmount: 0,
        zeroRatedAmount: grossAmount,
        taxCategory,
      }
    }

    // VATABLE
    const divisor = 1 + vatRate

    if (priceConfiguration === 'INCLUSIVE') {
      // Price already contains VAT: net = gross / 1.12
      const netAmount = grossAmount / divisor
      const vatAmount = grossAmount - netAmount
      return {
        grossAmount,
        netAmount,
        vatAmount,
        vatExemptAmount: 0,
        zeroRatedAmount: 0,
        taxCategory,
      }
    }

    // EXCLUSIVE: VAT is added on top
    const vatAmount = grossAmount * vatRate
    return {
      grossAmount: grossAmount + vatAmount,
      netAmount: grossAmount,
      vatAmount,
      vatExemptAmount: 0,
      zeroRatedAmount: 0,
      taxCategory,
    }
  },
  // -------------------------------------------------------------------------
  // CORE: Full transaction summary
  // -------------------------------------------------------------------------

  /**
   * Computes the complete BIR-required VAT breakdown for a transaction.
   * This is what you persist to the Transaction model.
   *
   * Discount order (BIR-compliant):
   *   1. Apply SC/PWD discount to the vatable base BEFORE VAT (RA 9994)
   *   2. Apply general discount
   *   3. Compute VAT on the discounted base
   *
   * @example
   * const summary = TaxEngine.summarize(
   *   [{ grossAmount: 11200, taxCategory: 'VATABLE' }],
   *   config,
   *   { discount: 500, scPwdDiscount: 2000 }
   * )
   */
  summarize: (items: LineItem[], config: TaxEngineConfig, discounts?: DiscountInput): VatSummary => {
    const { vatRate, isVatRegistered } = config
    const discount = discounts?.discount ?? 0
    const scPwdDiscount = discounts?.scPwdDiscount ?? 0

    // Step 1: Break down each line
    const breakdowns = items.map(item => TaxEngine.breakdownLine(item, config))

    // Step 2: Aggregate unrounded
    let rawVatableSales = breakdowns.reduce((acc, b) => acc + b.netAmount, 0)
    let rawVatAmount = breakdowns.reduce((acc, b) => acc + b.vatAmount, 0)
    const rawVatExempt = breakdowns.reduce((acc, b) => acc + b.vatExemptAmount, 0)
    const rawZeroRated = breakdowns.reduce((acc, b) => acc + b.zeroRatedAmount, 0)
    const subtotal = breakdowns.reduce((acc, b) => acc + b.grossAmount, 0)

    // Step 3: SC/PWD discount reduces the vatable BASE (pre-VAT), per RA 9994
    // The 20% is computed on the net (ex-VAT) selling price.
    // We subtract it from vatableSales and recompute vatAmount.
    if (scPwdDiscount > 0 && isVatRegistered) {
      rawVatableSales = Math.max(0, rawVatableSales - scPwdDiscount)
      rawVatAmount = rawVatableSales * vatRate
    }

    // Step 4: General discount reduces the gross total
    const discountedTotal = Math.max(0, subtotal - scPwdDiscount * (1 + vatRate) - discount)

    // Step 5: Round everything to integers (cents)
    const vatableSales = Math.round(rawVatableSales)
    const vatAmount = Math.round(rawVatAmount)
    const vatExemptSales = Math.round(rawVatExempt)
    const zeroRatedSales = Math.round(rawZeroRated)
    const totalAmount = Math.round(discountedTotal)

    return {
      vatableSales,
      vatAmount,
      vatExemptSales,
      zeroRatedSales,
      taxAmount: vatAmount,
      subtotal: Math.round(subtotal),
      totalAmount,
      isVatApplied: isVatRegistered,
      vatRate: vatRate * 100, // Store as 12.0, not 0.12, to match DB schema
    }
  },

  // -------------------------------------------------------------------------
  // SC / PWD DISCOUNT (RA 9994 / RA 7277)
  // -------------------------------------------------------------------------

  /**
   * Computes the 20% SC/PWD discount amount.
   * BIR requires discount to be on the PRICE EXCLUDING VAT.
   *
   * @example
   * // Item priced at ₱112 inclusive → net = ₱100 → discount = ₱20
   * TaxEngine.computeScPwdDiscount({ sellingPriceExVat: 10000 })
   * // → 2000 (₱20.00 in cents)
   */
  computeScPwdDiscount: (input: ScPwdInput): number => {
    return Math.round(input.sellingPriceExVat * 0.2)
  },

  /**
   * Given an inclusive gross price, extracts the ex-VAT price for SC/PWD calc.
   *
   * @example
   * TaxEngine.getExVatPrice(11200, 0.12) // → 10000
   */
  getExVatPrice: (inclusivePrice: number, vatRate: number): number => {
    return Math.round(inclusivePrice / (1 + vatRate))
  },

  // -------------------------------------------------------------------------
  // PRICE CONVERSION UTILITIES
  // -------------------------------------------------------------------------

  /**
   * Converts an inclusive price to its exclusive (pre-tax) equivalent.
   * Useful when displaying "price before tax" in exclusive-mode UIs.
   */
  toExclusive: (inclusiveAmount: number, vatRate: number): number => {
    return Math.round(inclusiveAmount / (1 + vatRate))
  },

  /**
   * Converts an exclusive (pre-tax) price to its inclusive equivalent.
   */
  toInclusive: (exclusiveAmount: number, vatRate: number): number => {
    return Math.round(exclusiveAmount * (1 + vatRate))
  },

  /**
   * Extracts only the VAT component from an inclusive price.
   */
  extractVat: (inclusiveAmount: number, vatRate: number): number => {
    return inclusiveAmount - TaxEngine.toExclusive(inclusiveAmount, vatRate)
  },

  /**
   * Computes the VAT to ADD on top of an exclusive price.
   */
  computeVatOnTop: (exclusiveAmount: number, vatRate: number): number => {
    return Math.round(exclusiveAmount * vatRate)
  },

  // -------------------------------------------------------------------------
  // RECEIPT / PRINT HELPERS
  // -------------------------------------------------------------------------

  /**
   * Formats a VatSummary into the exact line items required on a BIR invoice.
   * All amounts are divided by 100 (cents → pesos) for display.
   *
   * @example
   * TaxEngine.formatReceiptLines(summary)
   * // → { vatableSales: 'PHP 100.00', vatAmount: 'PHP 12.00', ... }
   */
  formatReceiptLines: (summary: VatSummary): Record<string, string> => {
    return {
      'Vatable Sales': PriceEngine.format(summary.vatableSales),
      'VAT Amount (12%)': PriceEngine.format(summary.vatAmount),
      'VAT-Exempt Sales': PriceEngine.format(summary.vatExemptSales),
      'Zero-Rated Sales': PriceEngine.format(summary.zeroRatedSales),
      'Total Amount Due': PriceEngine.format(summary.totalAmount),
    }
  },

  /**
   * Returns the BIR-required label for a tax type on the receipt line.
   * Exempt items must be clearly marked per RR 7-2024.
   */
  getTaxLabel: (taxCategory: TaxCategory, isVatRegistered: boolean): string => {
    if (!isVatRegistered) return 'Non-VAT'
    switch (taxCategory) {
      case TaxCategory.STANDARD:
        return 'V'
      case TaxCategory.EXEMPT:
        return 'E'
      case TaxCategory.ZERO_RATED:
        return 'Z'
      default:
        return 'V'
    }
  },

  // -------------------------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------------------------

  /**
   * Sanity-checks a VatSummary.
   * Useful in tests and before persisting to DB.
   * Returns an array of error strings; empty array = valid.
   */
  validate: (summary: VatSummary): string[] => {
    const errors: string[] = []

    if (summary.vatAmount < 0) errors.push('vatAmount cannot be negative')
    if (summary.vatableSales < 0) errors.push('vatableSales cannot be negative')
    if (summary.totalAmount < 0) errors.push('totalAmount cannot be negative')
    if (summary.vatRate < 0 || summary.vatRate > 100) errors.push('vatRate must be between 0 and 100')

    // BIR integrity check: vatAmount should equal vatableSales * (vatRate/100)
    // Allow ±2 cent rounding tolerance
    if (summary.isVatApplied) {
      const expectedVat = Math.round(summary.vatableSales * (summary.vatRate / 100))
      if (Math.abs(summary.vatAmount - expectedVat) > 2) {
        errors.push(`vatAmount (${summary.vatAmount}) deviates too far from expected (${expectedVat}). Check rounding.`)
      }
    }

    return errors
  },

  /**
   * Checks if a transaction requires buyer TIN/address capture.
   * Under RR 7-2024: mandatory for sales ≥ ₱1,000 to VAT-registered buyers.
   */
  requiresBuyerInfo: (totalAmountCents: number, buyerIsVatRegistered = false): boolean => {
    const threshold = 100_000 // ₱1,000.00 in cents
    return totalAmountCents >= threshold || buyerIsVatRegistered
  },
}
