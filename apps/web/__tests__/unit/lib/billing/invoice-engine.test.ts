/**
 * invoice-engine.test.ts
 *
 * Unit tests for InvoiceEngine — the pure domain engine that builds
 * BillingInvoice DTOs from a closed UsageCounter + plan data.
 *
 * All monetary values are in cents. No mocks required.
 *
 * Coverage:
 *  - buildMonthlyInvoice: subscription-only (no overage), overage present,
 *    zero monthly price (free plan), overage disabled, VAT applied correctly,
 *    zero VAT rate, correct period dates copied from counter
 *  - buildSubscriptionFeeLine: correct shape and description
 *  - buildOverageLineItem: lineAmount = count × rate, singular/plural description
 *  - computeTax: 12% VAT, zero rate, rounding of fractional cents
 *  - formatCents: basic conversion
 */

import { describe, expect, it } from 'vitest'
import { InvoiceEngine } from '@/lib/billing/invoice-engine'
import { InvoiceItemType, InvoiceStatus, type OveragePolicy, type UsageCounterSnapshot } from '@/lib/billing/types'
import type { SubscriptionPlanInput } from '@/lib/billing/invoice-engine'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BIZ_ID = 'biz-001'

const PERIOD_START = new Date('2026-06-01T00:00:00.000Z')
const PERIOD_END = new Date('2026-06-30T23:59:59.000Z')

function makeCounter(overrides: Partial<UsageCounterSnapshot> = {}): UsageCounterSnapshot {
  return {
    id: 'counter-001',
    businessId: BIZ_ID,
    billingPeriodStart: PERIOD_START,
    billingPeriodEnd: PERIOD_END,
    txCount: 100,
    overageTxCount: 0,
    isClosed: true,
    ...overrides,
  }
}

function makePlan(overrides: Partial<SubscriptionPlanInput> = {}): SubscriptionPlanInput {
  return {
    monthlyPrice: 49900, // ₱499.00
    includedTxPerMonth: 500,
    overagePerTx: 100, // ₱1.00 per overage tx
    planName: 'Starter',
    ...overrides,
  }
}

function makePolicy(overrides: Partial<OveragePolicy> = {}): OveragePolicy {
  return {
    overageBillingEnabled: true,
    overageRatePerTx: 100,
    vatRate: 0.12,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// buildMonthlyInvoice
// ---------------------------------------------------------------------------

describe('InvoiceEngine.buildMonthlyInvoice', () => {
  it('builds a DRAFT invoice with a subscription fee line and no overage', () => {
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, makeCounter(), makePlan(), makePolicy())

    expect(invoice.businessId).toBe(BIZ_ID)
    expect(invoice.status).toBe(InvoiceStatus.DRAFT)
    expect(invoice.items).toHaveLength(1)
    expect(invoice.items[0]!.type).toBe(InvoiceItemType.SUBSCRIPTION_FEE)
  })

  it('copies billingPeriod dates from the counter', () => {
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, makeCounter(), makePlan(), makePolicy())
    expect(invoice.billingPeriodStart).toBe(PERIOD_START)
    expect(invoice.billingPeriodEnd).toBe(PERIOD_END)
  })

  it('calculates subtotal, tax, and total correctly', () => {
    // monthlyPrice = 49900, vatRate = 0.12
    // subtotal = 49900, tax = Math.round(49900 * 0.12) = 5988, total = 55888
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, makeCounter(), makePlan(), makePolicy())
    expect(invoice.subtotalAmount).toBe(49900)
    expect(invoice.taxAmount).toBe(5988)
    expect(invoice.totalAmount).toBe(55888)
  })

  it('includes an overage line when overageTxCount > 0 and billing is enabled', () => {
    const counter = makeCounter({ overageTxCount: 10 })
    const policy = makePolicy({ overageRatePerTx: 100 })
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, counter, makePlan(), policy)

    expect(invoice.items).toHaveLength(2)
    const overageLine = invoice.items.find(i => i.type === InvoiceItemType.OVERAGE_CHARGE)
    expect(overageLine).toBeDefined()
    expect(overageLine!.quantity).toBe(10)
    expect(overageLine!.unitAmount).toBe(100)
    expect(overageLine!.lineAmount).toBe(1000) // 10 × 100
  })

  it('omits the overage line when overageBillingEnabled is false', () => {
    const counter = makeCounter({ overageTxCount: 50 })
    const policy = makePolicy({ overageBillingEnabled: false })
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, counter, makePlan(), policy)

    expect(invoice.items).toHaveLength(1)
    expect(invoice.items[0]!.type).toBe(InvoiceItemType.SUBSCRIPTION_FEE)
  })

  it('omits the overage line when overageTxCount is 0', () => {
    const counter = makeCounter({ overageTxCount: 0 })
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, counter, makePlan(), makePolicy())
    const overageLine = invoice.items.find(i => i.type === InvoiceItemType.OVERAGE_CHARGE)
    expect(overageLine).toBeUndefined()
  })

  it('produces a zero subtotal and no subscription line when monthlyPrice is 0 (free plan)', () => {
    const plan = makePlan({ monthlyPrice: 0 })
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, makeCounter(), plan, makePolicy({ vatRate: 0 }))

    const feeLine = invoice.items.find(i => i.type === InvoiceItemType.SUBSCRIPTION_FEE)
    expect(feeLine).toBeUndefined()
    expect(invoice.subtotalAmount).toBe(0)
    expect(invoice.taxAmount).toBe(0)
    expect(invoice.totalAmount).toBe(0)
  })

  it('applies zero VAT when vatRate is 0', () => {
    const policy = makePolicy({ vatRate: 0 })
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, makeCounter(), makePlan(), policy)
    expect(invoice.taxAmount).toBe(0)
    expect(invoice.totalAmount).toBe(invoice.subtotalAmount)
  })

  it('sums subtotal across both fee and overage lines', () => {
    // subscription fee: 49900, overage: 5 × 100 = 500, subtotal = 50400
    const counter = makeCounter({ overageTxCount: 5 })
    const policy = makePolicy({ overageRatePerTx: 100, vatRate: 0 })
    const invoice = InvoiceEngine.buildMonthlyInvoice(BIZ_ID, counter, makePlan(), policy)
    expect(invoice.subtotalAmount).toBe(50400)
    expect(invoice.totalAmount).toBe(50400)
  })
})

// ---------------------------------------------------------------------------
// buildSubscriptionFeeLine
// ---------------------------------------------------------------------------

describe('InvoiceEngine.buildSubscriptionFeeLine', () => {
  it('builds a correctly shaped SUBSCRIPTION_FEE line item', () => {
    const item = InvoiceEngine.buildSubscriptionFeeLine('Starter', 49900)

    expect(item.type).toBe(InvoiceItemType.SUBSCRIPTION_FEE)
    expect(item.quantity).toBe(1)
    expect(item.unitAmount).toBe(49900)
    expect(item.lineAmount).toBe(49900)
    expect(item.description).toContain('Starter')
    expect(item.description).toMatch(/monthly subscription/i)
  })

  it('uses the plan name in the description', () => {
    const item = InvoiceEngine.buildSubscriptionFeeLine('Premium', 99900)
    expect(item.description).toContain('Premium')
  })
})

// ---------------------------------------------------------------------------
// buildOverageLineItem
// ---------------------------------------------------------------------------

describe('InvoiceEngine.buildOverageLineItem', () => {
  it('calculates lineAmount as overageCount × ratePerTx', () => {
    const item = InvoiceEngine.buildOverageLineItem(25, 100)
    expect(item.type).toBe(InvoiceItemType.OVERAGE_CHARGE)
    expect(item.quantity).toBe(25)
    expect(item.unitAmount).toBe(100)
    expect(item.lineAmount).toBe(2500)
  })

  it('uses singular "transaction" when count is 1', () => {
    const item = InvoiceEngine.buildOverageLineItem(1, 100)
    expect(item.description).toMatch(/\btransaction\b/)
    expect(item.description).not.toMatch(/transactions/)
  })

  it('uses plural "transactions" when count > 1', () => {
    const item = InvoiceEngine.buildOverageLineItem(5, 100)
    expect(item.description).toMatch(/transactions/)
  })

  it('includes the count in the description', () => {
    const item = InvoiceEngine.buildOverageLineItem(100, 50)
    expect(item.description).toContain('100')
  })
})

// ---------------------------------------------------------------------------
// computeTax
// ---------------------------------------------------------------------------

describe('InvoiceEngine.computeTax', () => {
  it('returns 0 when vatRate is 0', () => {
    expect(InvoiceEngine.computeTax(50000, 0)).toBe(0)
  })

  it('returns 0 when vatRate is negative', () => {
    expect(InvoiceEngine.computeTax(50000, -0.05)).toBe(0)
  })

  it('computes 12% VAT correctly on a whole amount', () => {
    // 49900 × 0.12 = 5988.0 → rounds to 5988
    expect(InvoiceEngine.computeTax(49900, 0.12)).toBe(5988)
  })

  it('rounds fractional cent results', () => {
    // 100 × 0.12 = 12.0 exactly
    expect(InvoiceEngine.computeTax(100, 0.12)).toBe(12)
    // 1 × 0.12 = 0.12 → rounds to 0
    expect(InvoiceEngine.computeTax(1, 0.12)).toBe(0)
    // 10 × 0.12 = 1.2 → rounds to 1
    expect(InvoiceEngine.computeTax(10, 0.12)).toBe(1)
  })

  it('handles a 0 subtotal', () => {
    expect(InvoiceEngine.computeTax(0, 0.12)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// formatCents
// ---------------------------------------------------------------------------

describe('InvoiceEngine.formatCents', () => {
  it('formats 500 cents as $5.00', () => {
    expect(InvoiceEngine.formatCents(500)).toBe('$5.00')
  })

  it('formats 100 cents as $1.00', () => {
    expect(InvoiceEngine.formatCents(100)).toBe('$1.00')
  })

  it('formats 0 cents as $0.00', () => {
    expect(InvoiceEngine.formatCents(0)).toBe('$0.00')
  })

  it('formats 49900 cents as $499.00', () => {
    expect(InvoiceEngine.formatCents(49900)).toBe('$499.00')
  })
})
