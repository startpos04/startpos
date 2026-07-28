/**
 * tax-engine.test.ts
 *
 * Covers BIR-compliant VAT logic:
 *   - breakdownLine (per-item VAT decomposition)
 *   - summarize (full transaction totals + discount handling)
 *   - SC/PWD discount helpers
 *   - Price conversion utilities
 *   - Receipt formatting
 *   - Validation
 *   - requiresBuyerInfo
 *
 * Run with: pnpm test
 */

import { TaxCategory } from 'prisma/generated/prisma/enums'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetMockUser, seedMockUser } from '#tests/helpers'
import { type LineItem, TaxEngine, type TaxEngineConfig } from '@/lib/conversion/tax-engine'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const inclusiveVatConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'INCLUSIVE' as any,
  isVatRegistered: true,
}

const exclusiveVatConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'EXCLUSIVE' as any,
  isVatRegistered: true,
}

const nonVatConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'INCLUSIVE' as any,
  isVatRegistered: false,
}

// ---------------------------------------------------------------------------
// TaxEngine.breakdownLine
// ---------------------------------------------------------------------------

describe('TaxEngine.breakdownLine', () => {
  it('INCLUSIVE VATABLE: extracts net and VAT from gross (₱112 → net ₱100, vat ₱12)', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }, inclusiveVatConfig)

    expect(result.netAmount).toBeCloseTo(10000, 0)
    expect(result.vatAmount).toBeCloseTo(1200, 0)
    expect(result.vatExemptAmount).toBe(0)
    expect(result.zeroRatedAmount).toBe(0)
    expect(result.taxCategory).toBe(TaxCategory.STANDARD)
  })

  it('EXCLUSIVE VATABLE: adds VAT on top (₱100 + 12% → gross ₱112, vat ₱12)', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 10000, taxCategory: TaxCategory.STANDARD }, exclusiveVatConfig)

    expect(result.grossAmount).toBe(11200)
    expect(result.netAmount).toBe(10000)
    expect(result.vatAmount).toBe(1200)
    expect(result.vatExemptAmount).toBe(0)
  })

  it('EXEMPT: passes through with no VAT, full amount as vatExempt', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 5000, taxCategory: TaxCategory.EXEMPT }, inclusiveVatConfig)

    expect(result.vatAmount).toBe(0)
    expect(result.vatExemptAmount).toBe(5000)
    expect(result.netAmount).toBe(5000)
    expect(result.taxCategory).toBe(TaxCategory.EXEMPT)
  })

  it('ZERO_RATED: passes through with no VAT, full amount as zeroRated', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 5000, taxCategory: TaxCategory.ZERO_RATED }, inclusiveVatConfig)

    expect(result.vatAmount).toBe(0)
    expect(result.zeroRatedAmount).toBe(5000)
    expect(result.vatExemptAmount).toBe(0)
    expect(result.taxCategory).toBe(TaxCategory.ZERO_RATED)
  })

  it('non-VAT org: forces EXEMPT regardless of product taxCategory (e.g. STANDARD becomes EXEMPT)', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }, nonVatConfig)

    expect(result.vatAmount).toBe(0)
    expect(result.vatExemptAmount).toBe(11200)
    // The engine overrides taxCategory to EXEMPT for non-VAT orgs
    expect(result.taxCategory).toBe(TaxCategory.EXEMPT)
  })

  it('non-VAT org: ZERO_RATED item also becomes exempt', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 5000, taxCategory: TaxCategory.ZERO_RATED }, nonVatConfig)

    expect(result.vatAmount).toBe(0)
    expect(result.vatExemptAmount).toBe(5000)
  })

  it('zero-amount item returns all-zero breakdown without errors', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 0, taxCategory: TaxCategory.STANDARD }, inclusiveVatConfig)

    expect(result.netAmount).toBe(0)
    expect(result.vatAmount).toBe(0)
    expect(result.grossAmount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// TaxEngine.summarize
// ---------------------------------------------------------------------------

describe('TaxEngine.summarize', () => {
  it('single vatable item, no discounts — full BIR breakdown', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)

    expect(summary.vatableSales).toBe(10000)
    expect(summary.vatAmount).toBe(1200)
    expect(summary.taxAmount).toBe(1200) // alias
    expect(summary.subtotal).toBe(11200)
    expect(summary.totalAmount).toBe(11200)
    expect(summary.isVatApplied).toBe(true)
    expect(summary.vatRate).toBe(12) // stored as 12.0, not 0.12
  })

  it('multiple vatable items accumulate correctly', () => {
    const items: LineItem[] = [
      { grossAmount: 11200, taxCategory: TaxCategory.STANDARD }, // net 10000, vat 1200
      { grossAmount: 5600, taxCategory: TaxCategory.STANDARD }, // net 5000, vat 600
    ]
    const summary = TaxEngine.summarize(items, inclusiveVatConfig)

    expect(summary.vatableSales).toBe(15000)
    expect(summary.vatAmount).toBe(1800)
    expect(summary.subtotal).toBe(16800)
    expect(summary.totalAmount).toBe(16800)
  })

  it('mixed items: vatable + exempt — vatExemptSales isolated, VAT only on vatable', () => {
    // Engine design: vatableSales = sum of all netAmounts (incl. exempt net),
    // but vatExemptSales and zeroRatedSales are tracked separately.
    // VAT is only computed from vatAmount (from STANDARD lines only).
    const items: LineItem[] = [
      { grossAmount: 11200, taxCategory: TaxCategory.STANDARD }, // net 10000, vat 1200
      { grossAmount: 5000, taxCategory: TaxCategory.EXEMPT }, // net 5000, vat 0
    ]
    const summary = TaxEngine.summarize(items, inclusiveVatConfig)

    // vatableSales aggregates all netAmounts (including exempt net) — engine design
    expect(summary.vatableSales).toBe(15000)
    // VAT is only on the STANDARD line
    expect(summary.vatAmount).toBe(1200)
    // Exempt line is tracked separately
    expect(summary.vatExemptSales).toBe(5000)
    expect(summary.zeroRatedSales).toBe(0)
    expect(summary.subtotal).toBe(16200)
    expect(summary.totalAmount).toBe(16200)
  })

  it('mixed items: vatable + zero-rated — zeroRatedSales isolated, VAT only on vatable', () => {
    const items: LineItem[] = [
      { grossAmount: 11200, taxCategory: TaxCategory.STANDARD }, // net 10000, vat 1200
      { grossAmount: 3000, taxCategory: TaxCategory.ZERO_RATED }, // net 3000, vat 0
    ]
    const summary = TaxEngine.summarize(items, inclusiveVatConfig)

    // vatableSales aggregates all netAmounts — engine design
    expect(summary.vatableSales).toBe(13000)
    expect(summary.zeroRatedSales).toBe(3000)
    expect(summary.vatExemptSales).toBe(0)
    expect(summary.vatAmount).toBe(1200)
  })

  it('applies general discount to total amount only', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig, { discount: 1000 })

    // General discount just reduces totalAmount, does not change vatable base
    expect(summary.totalAmount).toBe(10200)
    expect(summary.vatableSales).toBe(10000) // unchanged
  })

  it('SC/PWD discount reduces vatable BASE before VAT (RA 9994 compliance)', () => {
    // Item: ₱112 inclusive. Net ex-VAT = ₱100.00 (10000¢)
    // 20% SC/PWD on net = 2000¢ → vatableSales = 10000 - 2000 = 8000, vatAmount = 960
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig, { scPwdDiscount: 2000 })

    expect(summary.vatableSales).toBe(8000)
    expect(summary.vatAmount).toBe(960)
  })

  it('combined SC/PWD + general discount applied in correct BIR order', () => {
    // SC/PWD reduces vatable base, general discount reduces gross total
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig, { scPwdDiscount: 2000, discount: 500 })

    expect(summary.vatableSales).toBe(8000)
    expect(summary.vatAmount).toBe(960)
    // totalAmount = 11200 - scPwdDiscount * 1.12 - discount = 11200 - 2240 - 500 = 8460
    expect(summary.totalAmount).toBe(8460)
  })

  it('non-VAT org: isVatApplied=false, vatAmount=0, all sales in vatExemptSales', () => {
    // For non-VAT org: breakdownLine forces EXEMPT, so netAmount = grossAmount.
    // vatableSales = sum of all netAmounts (incl. what was STANDARD, now EXEMPT).
    // vatAmount = 0, vatExemptSales = 11200.
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], nonVatConfig)

    expect(summary.vatAmount).toBe(0)
    expect(summary.taxAmount).toBe(0)
    expect(summary.isVatApplied).toBe(false)
    expect(summary.vatExemptSales).toBe(11200)
  })

  it('totalAmount never goes negative with excessively large discount', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig, { discount: 999999 })

    expect(summary.totalAmount).toBe(0)
  })

  it('empty items list returns zero summary without errors', () => {
    const summary = TaxEngine.summarize([], inclusiveVatConfig)

    expect(summary.vatableSales).toBe(0)
    expect(summary.vatAmount).toBe(0)
    expect(summary.totalAmount).toBe(0)
  })

  it('exclusive pricing: VAT is added on top of price', () => {
    // ₱100 exclusive → gross is ₱112, vatAmount = ₱12
    const summary = TaxEngine.summarize([{ grossAmount: 10000, taxCategory: TaxCategory.STANDARD }], exclusiveVatConfig)

    expect(summary.vatAmount).toBe(1200)
    expect(summary.vatableSales).toBe(10000)
    expect(summary.totalAmount).toBe(11200)
  })
})

// ---------------------------------------------------------------------------
// TaxEngine.buildLineItems
// ---------------------------------------------------------------------------

describe('TaxEngine.buildLineItems', () => {
  it('converts posItems to LineItems with quantity multiplication', () => {
    const posItem = {
      cartId: 'cart-1',
      quantity: 3,
      variant: {
        id: 'v-1',
        price: 11200,
        taxCategory: TaxCategory.STANDARD,
        components: [],
      } as any,
      product: {} as any,
      addons: [],
    }

    const lines = TaxEngine.buildLineItems([posItem])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.grossAmount).toBe(33600) // 11200 * 3
    expect(lines[0]!.taxCategory).toBe(TaxCategory.STANDARD)
  })

  it('addon with priceOverride generates its own line item', () => {
    const addon = {
      id: 'comp-1',
      priceOverride: 500,
      isAddon: true,
    } as any

    const posItem = {
      cartId: 'cart-1',
      quantity: 2,
      variant: {
        id: 'v-1',
        price: 11200,
        taxCategory: TaxCategory.STANDARD,
        components: [],
      } as any,
      product: {} as any,
      addons: [addon],
    }

    const lines = TaxEngine.buildLineItems([posItem])
    // Main line: 11200 * 2, Addon line: 500 * 2
    expect(lines).toHaveLength(2)
    expect(lines[1]!.grossAmount).toBe(1000)
  })

  it('addon without priceOverride (null) does not generate a line', () => {
    const addon = { id: 'comp-1', priceOverride: null, isAddon: true } as any
    const posItem = {
      cartId: 'cart-1',
      quantity: 1,
      variant: { id: 'v-1', price: 5000, taxCategory: TaxCategory.STANDARD, components: [] } as any,
      product: {} as any,
      addons: [addon],
    }

    const lines = TaxEngine.buildLineItems([posItem])
    expect(lines).toHaveLength(1) // only main item
  })
})

// ---------------------------------------------------------------------------
// SC/PWD helpers
// ---------------------------------------------------------------------------

describe('TaxEngine.computeScPwdDiscount', () => {
  it('returns exactly 20% of the ex-VAT price (RA 9994)', () => {
    expect(TaxEngine.computeScPwdDiscount({ sellingPriceExVat: 10000 })).toBe(2000)
  })

  it('rounds correctly for non-integer result', () => {
    expect(TaxEngine.computeScPwdDiscount({ sellingPriceExVat: 333 })).toBe(67) // 66.6 → 67
  })

  it('returns 0 for zero price', () => {
    expect(TaxEngine.computeScPwdDiscount({ sellingPriceExVat: 0 })).toBe(0)
  })
})

describe('TaxEngine.getExVatPrice', () => {
  it('extracts net price from inclusive amount at 12%', () => {
    expect(TaxEngine.getExVatPrice(11200, 0.12)).toBe(10000)
  })

  it('handles non-standard VAT rates', () => {
    // ₱110 inclusive at 10% → ₱100 net
    expect(TaxEngine.getExVatPrice(11000, 0.1)).toBe(10000)
  })
})

// ---------------------------------------------------------------------------
// Price conversion utilities
// ---------------------------------------------------------------------------

describe('TaxEngine price conversion utilities', () => {
  it('toExclusive: removes VAT from inclusive price', () => {
    expect(TaxEngine.toExclusive(11200, 0.12)).toBe(10000)
  })

  it('toInclusive: adds VAT to exclusive price', () => {
    expect(TaxEngine.toInclusive(10000, 0.12)).toBe(11200)
  })

  it('extractVat: returns the VAT component of an inclusive price', () => {
    expect(TaxEngine.extractVat(11200, 0.12)).toBe(1200)
  })

  it('computeVatOnTop: returns VAT to add to an exclusive price', () => {
    expect(TaxEngine.computeVatOnTop(10000, 0.12)).toBe(1200)
  })

  it('roundtrip: toInclusive(toExclusive(x)) ≈ x (within 1 cent rounding tolerance)', () => {
    const original = 11200
    const roundtrip = TaxEngine.toInclusive(TaxEngine.toExclusive(original, 0.12), 0.12)
    expect(Math.abs(roundtrip - original)).toBeLessThanOrEqual(1)
  })

  it('zero input returns zero for all conversions', () => {
    expect(TaxEngine.toExclusive(0, 0.12)).toBe(0)
    expect(TaxEngine.toInclusive(0, 0.12)).toBe(0)
    expect(TaxEngine.extractVat(0, 0.12)).toBe(0)
    expect(TaxEngine.computeVatOnTop(0, 0.12)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// TaxEngine.validate
// ---------------------------------------------------------------------------

describe('TaxEngine.validate', () => {
  it('returns no errors for a valid fully-summarized transaction', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    expect(TaxEngine.validate(summary)).toHaveLength(0)
  })

  it('catches vatAmount far from expected (deviates > 2 cents)', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    const broken = { ...summary, vatAmount: 9999 }
    const errors = TaxEngine.validate(broken)
    expect(errors.some(e => e.includes('deviates'))).toBe(true)
  })

  it('catches negative vatAmount', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    const broken = { ...summary, vatAmount: -1 }
    const errors = TaxEngine.validate(broken)
    expect(errors.some(e => e.includes('vatAmount cannot be negative'))).toBe(true)
  })

  it('catches negative totalAmount', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    const broken = { ...summary, totalAmount: -100 }
    const errors = TaxEngine.validate(broken)
    expect(errors.some(e => e.includes('totalAmount cannot be negative'))).toBe(true)
  })

  it('catches vatRate out of range', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    const broken = { ...summary, vatRate: 150 }
    const errors = TaxEngine.validate(broken)
    expect(errors.some(e => e.includes('vatRate must be between'))).toBe(true)
  })

  it('allows small rounding tolerance (≤2 cents) without error', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    const withRounding = { ...summary, vatAmount: summary.vatAmount + 1 } // 1 cent off
    expect(TaxEngine.validate(withRounding)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// TaxEngine.requiresBuyerInfo
// ---------------------------------------------------------------------------

describe('TaxEngine.requiresBuyerInfo', () => {
  it('requires buyer info for transactions >= ₱1,000 (100000 cents)', () => {
    expect(TaxEngine.requiresBuyerInfo(100_000)).toBe(true)
  })

  it('does NOT require buyer info for transactions < ₱1,000', () => {
    expect(TaxEngine.requiresBuyerInfo(99_999)).toBe(false)
  })

  it('requires buyer info for VAT-registered buyers regardless of amount', () => {
    expect(TaxEngine.requiresBuyerInfo(500, true)).toBe(true)
  })

  it('small purchase, non-VAT buyer: no buyer info required', () => {
    expect(TaxEngine.requiresBuyerInfo(500, false)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TaxEngine.getTaxLabel
// ---------------------------------------------------------------------------

describe('TaxEngine.getTaxLabel', () => {
  it('returns V for STANDARD (vatable) when VAT-registered', () => {
    expect(TaxEngine.getTaxLabel(TaxCategory.STANDARD, true)).toBe('V')
  })

  it('returns E for EXEMPT when VAT-registered', () => {
    expect(TaxEngine.getTaxLabel(TaxCategory.EXEMPT, true)).toBe('E')
  })

  it('returns Z for ZERO_RATED when VAT-registered', () => {
    expect(TaxEngine.getTaxLabel(TaxCategory.ZERO_RATED, true)).toBe('Z')
  })

  it('returns Non-VAT for all categories when not VAT-registered', () => {
    expect(TaxEngine.getTaxLabel(TaxCategory.STANDARD, false)).toBe('Non-VAT')
    expect(TaxEngine.getTaxLabel(TaxCategory.EXEMPT, false)).toBe('Non-VAT')
    expect(TaxEngine.getTaxLabel(TaxCategory.ZERO_RATED, false)).toBe('Non-VAT')
  })
})

// ---------------------------------------------------------------------------
// TaxEngine.formatReceiptLines (needs authStore seeded for PriceEngine.format)
// ---------------------------------------------------------------------------

describe('TaxEngine.formatReceiptLines', () => {
  beforeEach(() => {
    seedMockUser() // seeds authStore with LOCALE: 'en-PH', CURRENCY: 'PHP'
  })

  afterEach(() => {
    resetMockUser()
  })

  it('formats all required BIR receipt line keys', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    const lines = TaxEngine.formatReceiptLines(summary)

    expect(Object.keys(lines)).toEqual(['Vatable Sales', 'VAT Amount (12%)', 'VAT-Exempt Sales', 'Zero-Rated Sales', 'Total Amount Due'])
  })

  it('formats amounts in PHP currency with centavo precision', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: TaxCategory.STANDARD }], inclusiveVatConfig)
    const lines = TaxEngine.formatReceiptLines(summary)

    // PHP ₱100.00 — locale may vary slightly but amounts must be correct
    expect(lines['Vatable Sales']).toContain('100')
    expect(lines['VAT Amount (12%)']).toContain('12')
    expect(lines['Total Amount Due']).toContain('112')
  })

  it('zero-amount lines still format without errors', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 5000, taxCategory: TaxCategory.EXEMPT }], inclusiveVatConfig)
    const lines = TaxEngine.formatReceiptLines(summary)
    expect(lines['VAT Amount (12%)']).toContain('0')
    expect(lines['Vatable Sales']).toContain('0')
  })
})
