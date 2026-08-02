/**
 * tax-breakdown-line.ts
 *
 * TaxBreakdownLine — immutable value object representing a single tax
 * component within a PricingResult.
 *
 * Tax-system-agnostic: supports VAT-inclusive, VAT-exclusive, and
 * multi-rate scenarios (e.g. reduced-rate tiers alongside standard rate).
 *
 * Architectural contract:
 *   - Zero infrastructure imports.
 *   - Immutable after construction — all fields are readonly.
 *   - All amounts are integers in cents.
 */

// ---------------------------------------------------------------------------
// TaxApplicationMode
// VAT_INCLUSIVE  = tax is already embedded in the pre-tax subtotal
//                  (retail standard; price shown to customer includes tax)
// VAT_EXCLUSIVE  = tax is added on top of the pre-tax subtotal
//                  (B2B/corporate standard; price shown excludes tax)
// ---------------------------------------------------------------------------
export const TaxApplicationMode = {
  VAT_INCLUSIVE: 'VAT_INCLUSIVE',
  VAT_EXCLUSIVE: 'VAT_EXCLUSIVE',
} as const
export type TaxApplicationMode = (typeof TaxApplicationMode)[keyof typeof TaxApplicationMode]

// ---------------------------------------------------------------------------
// TaxBreakdownLine
// ---------------------------------------------------------------------------
export type TaxBreakdownLine = {
  /** Human-readable label (e.g. "VAT 12%", "GST 9%") */
  readonly label: string
  /** Rate as basis points (e.g. 1200 = 12%, 900 = 9%) */
  readonly rateBps: number
  /** The amount the rate was applied to (cents) */
  readonly taxableAmount: number
  /** Computed tax amount (cents) */
  readonly taxAmount: number
  readonly mode: TaxApplicationMode
}

// ---------------------------------------------------------------------------
// TaxBreakdownLineFactory
// Pure factory functions — no class instances, no mutation.
// ---------------------------------------------------------------------------
export const TaxBreakdownLineFactory = {
  /**
   * Create a VAT-inclusive line.
   * The pre-tax subtotal already contains the tax; this extracts the tax component.
   *
   * @param label       - e.g. "VAT 12%"
   * @param rateBps     - e.g. 1200 (= 12%)
   * @param grossAmount - The gross (tax-inclusive) amount in cents
   */
  inclusive(label: string, rateBps: number, grossAmount: number): TaxBreakdownLine {
    // VAT-inclusive: taxAmount = grossAmount × rate / (100 + rate)
    const rateDecimal = rateBps / 10000
    const taxAmount = Math.round((grossAmount * rateDecimal) / (1 + rateDecimal))
    const taxableAmount = grossAmount - taxAmount
    return { label, rateBps, taxableAmount, taxAmount, mode: TaxApplicationMode.VAT_INCLUSIVE }
  },

  /**
   * Create a VAT-exclusive line.
   * Tax is added on top of the net subtotal.
   *
   * @param label      - e.g. "VAT 12%"
   * @param rateBps    - e.g. 1200 (= 12%)
   * @param netAmount  - The net (pre-tax) amount in cents
   */
  exclusive(label: string, rateBps: number, netAmount: number): TaxBreakdownLine {
    const rateDecimal = rateBps / 10000
    const taxAmount = Math.round(netAmount * rateDecimal)
    return { label, rateBps, taxableAmount: netAmount, taxAmount, mode: TaxApplicationMode.VAT_EXCLUSIVE }
  },

  /**
   * Zero-rate line — no tax applied but still recorded for audit completeness.
   */
  zeroRate(label: string, netAmount: number): TaxBreakdownLine {
    return {
      label,
      rateBps: 0,
      taxableAmount: netAmount,
      taxAmount: 0,
      mode: TaxApplicationMode.VAT_EXCLUSIVE,
    }
  },
}
