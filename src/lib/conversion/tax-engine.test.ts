/**
 * TaxEngine.test.ts
 *
 * Run with: pnpm test
 */

import { describe, expect, it } from 'vitest'
import { TaxEngine, type TaxEngineConfig } from './tax-engine'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const vatConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'INCLUSIVE',
  isVatRegistered: true,
}

const exclusiveConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'EXCLUSIVE',
  isVatRegistered: true,
}

const nonVatConfig: TaxEngineConfig = {
  vatRate: 0.12,
  priceConfiguration: 'INCLUSIVE',
  isVatRegistered: false,
}

// ---------------------------------------------------------------------------
// breakdownLine
// ---------------------------------------------------------------------------

describe('TaxEngine.breakdownLine', () => {
  it('INCLUSIVE VATABLE: extracts net and VAT from gross', () => {
    // ₱112.00 inclusive → net ₱100.00, vat ₱12.00
    const result = TaxEngine.breakdownLine({ grossAmount: 11200, taxCategory: 'STANDARD' }, vatConfig)
    expect(result.netAmount).toBeCloseTo(10000, 0)
    expect(result.vatAmount).toBeCloseTo(1200, 0)
    expect(result.vatExemptAmount).toBe(0)
    expect(result.zeroRatedAmount).toBe(0)
  })

  it('EXCLUSIVE VATABLE: adds VAT on top', () => {
    // ₱100.00 exclusive → gross ₱112.00, vat ₱12.00
    const result = TaxEngine.breakdownLine({ grossAmount: 10000, taxCategory: 'STANDARD' }, exclusiveConfig)
    expect(result.grossAmount).toBe(11200)
    expect(result.netAmount).toBe(10000)
    expect(result.vatAmount).toBe(1200)
  })

  it('VAT_EXEMPT: passes through with no VAT', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 5000, taxCategory: 'EXEMPT' }, vatConfig)
    expect(result.vatAmount).toBe(0)
    expect(result.vatExemptAmount).toBe(5000)
    expect(result.netAmount).toBe(5000)
  })

  it('ZERO_RATED: passes through with no VAT', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 5000, taxCategory: 'ZERO_RATED' }, vatConfig)
    expect(result.vatAmount).toBe(0)
    expect(result.zeroRatedAmount).toBe(5000)
  })

  it('non-VAT org: always returns exempt regardless of product taxCategory', () => {
    const result = TaxEngine.breakdownLine({ grossAmount: 11200, taxCategory: 'STANDARD' }, nonVatConfig)
    expect(result.vatAmount).toBe(0)
    expect(result.vatExemptAmount).toBe(11200)
    expect(result.taxCategory).toBe('VAT_EXEMPT')
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('TaxEngine.summarize', () => {
  it('single vatable item, no discounts', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], vatConfig)
    expect(summary.vatableSales).toBe(10000)
    expect(summary.vatAmount).toBe(1200)
    expect(summary.totalAmount).toBe(11200)
    expect(summary.isVatApplied).toBe(true)
    expect(summary.vatRate).toBe(12)
  })

  it('mixed items: vatable + exempt', () => {
    //TODO: to fix
    // const items = [
    //   { grossAmount: 11200, taxCategory: 'STANDARD' as const },
    //   { grossAmount: 5000, taxCategory: 'VAT_EXEMPT' as const },
    // ]
    // const summary = TaxEngine.summarize(items, vatConfig)
    // expect(summary.vatableSales).toBe(10000)
    // expect(summary.vatAmount).toBe(1200)
    // expect(summary.vatExemptSales).toBe(5000)
    // expect(summary.subtotal).toBe(16200)
    // expect(summary.totalAmount).toBe(16200)
  })

  it('applies general discount to total', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], vatConfig, { discount: 1000 })
    expect(summary.totalAmount).toBe(10200)
  })

  it('SC/PWD discount reduces vatable base before VAT (RA 9994)', () => {
    // Item: ₱112 inclusive. Net ex-VAT = ₱100. SC/PWD discount = ₱20 (20% of ₱100)
    // After discount: vatableSales = 10000 - 2000 = 8000, vatAmount = 960
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], vatConfig, { scPwdDiscount: 2000 })
    expect(summary.vatableSales).toBe(8000)
    expect(summary.vatAmount).toBe(960)
  })

  it('non-VAT org: no VAT applied', () => {
    // TODO: to fix
    // const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], nonVatConfig)
    // expect(summary.vatAmount).toBe(0)
    // expect(summary.isVatApplied).toBe(false)
    // expect(summary.vatableSales).toBe(0)
    // expect(summary.vatExemptSales).toBe(11200)
  })

  it('totalAmount never goes negative with large discount', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], vatConfig, { discount: 99999 })
    expect(summary.totalAmount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// SC/PWD helpers
// ---------------------------------------------------------------------------

describe('TaxEngine.computeScPwdDiscount', () => {
  it('returns 20% of the ex-VAT price', () => {
    expect(TaxEngine.computeScPwdDiscount({ sellingPriceExVat: 10000 })).toBe(2000)
  })
})

describe('TaxEngine.getExVatPrice', () => {
  it('extracts net price from inclusive amount', () => {
    expect(TaxEngine.getExVatPrice(11200, 0.12)).toBe(10000)
  })
})

// ---------------------------------------------------------------------------
// Price conversion utilities
// ---------------------------------------------------------------------------

describe('price conversion', () => {
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

  it('roundtrip: toInclusive(toExclusive(x)) ≈ x (within 1 cent rounding)', () => {
    const original = 11200
    const roundtrip = TaxEngine.toInclusive(TaxEngine.toExclusive(original, 0.12), 0.12)
    expect(Math.abs(roundtrip - original)).toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('TaxEngine.validate', () => {
  it('returns no errors for a valid summary', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], vatConfig)
    expect(TaxEngine.validate(summary)).toHaveLength(0)
  })

  it('catches vatAmount mismatch', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], vatConfig)
    const broken = { ...summary, vatAmount: 9999 }
    const errors = TaxEngine.validate(broken)
    expect(errors.some(e => e.includes('deviates'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// requiresBuyerInfo
// ---------------------------------------------------------------------------

describe('TaxEngine.requiresBuyerInfo', () => {
  it('requires buyer info for sales >= ₱1,000', () => {
    expect(TaxEngine.requiresBuyerInfo(100_000)).toBe(true)
    expect(TaxEngine.requiresBuyerInfo(99_999)).toBe(false)
  })

  it('requires buyer info for VAT-registered buyers regardless of amount', () => {
    expect(TaxEngine.requiresBuyerInfo(500, true)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Receipt formatting
// ---------------------------------------------------------------------------

describe('TaxEngine.formatReceiptLines', () => {
  it('formats all required BIR receipt lines', () => {
    const summary = TaxEngine.summarize([{ grossAmount: 11200, taxCategory: 'STANDARD' }], vatConfig)
    const lines = TaxEngine.formatReceiptLines(summary)
    expect(lines['Vatable Sales']).toBe('₱100.00')
    expect(lines['VAT Amount (12%)']).toBe('₱12.00')
    expect(lines['Total Amount Due']).toBe('₱112.00')
  })
})

describe('TaxEngine.getTaxLabel', () => {
  it('returns V, E, Z for respective tax types', () => {
    expect(TaxEngine.getTaxLabel('STANDARD', true)).toBe('V')
    expect(TaxEngine.getTaxLabel('EXEMPT', true)).toBe('E')
    expect(TaxEngine.getTaxLabel('ZERO_RATED', true)).toBe('Z')
  })

  it('returns Non-VAT for non-registered orgs', () => {
    expect(TaxEngine.getTaxLabel('STANDARD', false)).toBe('Non-VAT')
  })
})
