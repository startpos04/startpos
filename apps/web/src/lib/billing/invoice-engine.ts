/**
 * invoice-engine.ts
 *
 * InvoiceEngine — pure domain engine for billing invoice construction.
 *
 * Responsibilities:
 *   - Build a monthly BillingInvoice DTO from a closed UsageCounter + plan data
 *   - Compute overage line items when overageTxCount > 0
 *   - Apply VAT to the subtotal to produce the final totalAmount
 *
 * Architectural contract (ADR-001):
 *   - No Prisma imports, no collection reads, no HTTP calls.
 *   - All data arrives as plain DTOs from the Application Layer.
 *   - Returns plain InvoiceDTO objects — the Application Layer persists them.
 *   - All monetary values are in cents (integers) to avoid floating-point errors.
 *
 * Usage (inside the billing-invoice-generation background job):
 *   const invoice = InvoiceEngine.buildMonthlyInvoice(subscription, counter, plan, policy)
 *   await prisma.billingInvoice.create({ data: mapInvoiceDTOToPrisma(invoice) })
 */

import type { InvoiceDTO, InvoiceItemDTO, OveragePolicy, UsageCounterSnapshot } from './types'
import { InvoiceItemType, InvoiceStatus } from './types'

// ---------------------------------------------------------------------------
// SubscriptionPlanInput
// Minimal plan data needed by InvoiceEngine — avoids Prisma type dependency.
// ---------------------------------------------------------------------------
export type SubscriptionPlanInput = {
  /** Monthly subscription fee in cents (0 = free / trial) */
  monthlyPrice: number
  /**
   * Annual subscription fee in cents.
   * null = not configured; fall back to monthlyPrice × 12 at invoice time.
   */
  annualPrice: number | null
  /** Transactions included per month (-1 = unlimited) */
  includedTxPerMonth: number
  /** Cents per overage transaction (from plan.overagePerTx) */
  overagePerTx: number
  /** Human-readable plan name for the invoice description line */
  planName: string
}

// ---------------------------------------------------------------------------
// InvoiceEngine
// ---------------------------------------------------------------------------

export const InvoiceEngine = {
  // -------------------------------------------------------------------------
  // buildMonthlyInvoice
  // Constructs a complete InvoiceDTO for a closed monthly billing period.
  // Includes a subscription fee line and, if applicable, an overage line.
  // -------------------------------------------------------------------------
  buildMonthlyInvoice(businessId: string, counter: UsageCounterSnapshot, plan: SubscriptionPlanInput, policy: OveragePolicy): InvoiceDTO {
    const items: InvoiceItemDTO[] = []

    if (plan.monthlyPrice > 0) {
      items.push(InvoiceEngine._buildFeeLine(plan.planName, plan.monthlyPrice, 'Monthly subscription'))
    }

    if (policy.overageBillingEnabled && counter.overageTxCount > 0) {
      items.push(InvoiceEngine.buildOverageLineItem(counter.overageTxCount, policy.overageRatePerTx))
    }

    return InvoiceEngine._assembleInvoice(businessId, counter, items, policy.vatRate)
  },

  // -------------------------------------------------------------------------
  // buildAnnualInvoice
  // Constructs a complete InvoiceDTO for a closed annual billing period.
  // Uses plan.annualPrice when set; falls back to monthlyPrice × 12.
  // Overage is not charged on annual plans — TX allowance is 12× monthly.
  // -------------------------------------------------------------------------
  buildAnnualInvoice(businessId: string, counter: UsageCounterSnapshot, plan: SubscriptionPlanInput, policy: OveragePolicy): InvoiceDTO {
    const items: InvoiceItemDTO[] = []

    // Resolve the annual fee: explicit annualPrice, or monthlyPrice × 12
    const annualFee = plan.annualPrice ?? plan.monthlyPrice * 12

    if (annualFee > 0) {
      items.push(InvoiceEngine._buildFeeLine(plan.planName, annualFee, 'Annual subscription'))
    }

    // Overage on annual plans: still charge if enabled and overages exist.
    // TX allowance is set to 12× monthly at subscription creation time, so
    // overages should be rare, but we bill them the same way.
    if (policy.overageBillingEnabled && counter.overageTxCount > 0) {
      items.push(InvoiceEngine.buildOverageLineItem(counter.overageTxCount, policy.overageRatePerTx))
    }

    return InvoiceEngine._assembleInvoice(businessId, counter, items, policy.vatRate)
  },

  // -------------------------------------------------------------------------
  // _buildFeeLine (private helper)
  // Constructs a SUBSCRIPTION_FEE line item with a given label.
  // -------------------------------------------------------------------------
  _buildFeeLine(planName: string, amount: number, interval: string): InvoiceItemDTO {
    return {
      type: InvoiceItemType.SUBSCRIPTION_FEE,
      description: `${planName} — ${interval}`,
      quantity: 1,
      unitAmount: amount,
      lineAmount: amount,
    }
  },

  // -------------------------------------------------------------------------
  // _assembleInvoice (private helper)
  // Sums line items, applies VAT, and returns the final InvoiceDTO.
  // -------------------------------------------------------------------------
  _assembleInvoice(businessId: string, counter: UsageCounterSnapshot, items: InvoiceItemDTO[], vatRate: number): InvoiceDTO {
    const subtotalAmount = items.reduce((sum, item) => sum + item.lineAmount, 0)
    const taxAmount = InvoiceEngine.computeTax(subtotalAmount, vatRate)
    const totalAmount = subtotalAmount + taxAmount

    return {
      businessId,
      billingPeriodStart: counter.billingPeriodStart,
      billingPeriodEnd: counter.billingPeriodEnd,
      status: InvoiceStatus.DRAFT,
      subtotalAmount,
      taxAmount,
      totalAmount,
      items,
    }
  },

  // -------------------------------------------------------------------------
  // buildSubscriptionFeeLine
  // Public helper kept for backward-compatibility with existing callers.
  // New code should use buildMonthlyInvoice / buildAnnualInvoice directly.
  // -------------------------------------------------------------------------
  buildSubscriptionFeeLine(planName: string, monthlyPrice: number): InvoiceItemDTO {
    return InvoiceEngine._buildFeeLine(planName, monthlyPrice, 'Monthly subscription')
  },

  // -------------------------------------------------------------------------
  // buildOverageLineItem
  // Constructs a single OVERAGE_CHARGE line item.
  //
  // @param overageCount - Number of transactions beyond the plan allowance
  // @param ratePerTx    - Cents per overage transaction
  // -------------------------------------------------------------------------
  buildOverageLineItem(overageCount: number, ratePerTx: number): InvoiceItemDTO {
    const lineAmount = overageCount * ratePerTx
    return {
      type: InvoiceItemType.OVERAGE_CHARGE,
      description: `Overage: ${overageCount.toLocaleString()} transaction${overageCount === 1 ? '' : 's'} × ${InvoiceEngine.formatCents(ratePerTx)} each`,
      quantity: overageCount,
      unitAmount: ratePerTx,
      lineAmount,
    }
  },

  // -------------------------------------------------------------------------
  // computeTax
  // Computes the tax amount (in cents) for a given subtotal and VAT rate.
  // Uses Math.round to avoid fractional cents.
  //
  // @param subtotalCents - Pre-tax amount in cents
  // @param vatRate       - VAT rate as a decimal (e.g. 0.12 for 12%)
  // -------------------------------------------------------------------------
  computeTax(subtotalCents: number, vatRate: number): number {
    if (vatRate <= 0) return 0
    return Math.round(subtotalCents * vatRate)
  },

  // -------------------------------------------------------------------------
  // formatCents
  // Converts a cent amount to a formatted currency string for descriptions.
  // e.g. 500 → "$5.00"  (USD default — the description is informational only)
  // -------------------------------------------------------------------------
  formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`
  },
}
