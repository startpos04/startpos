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
  // Constructs a complete InvoiceDTO for a closed billing period.
  // Includes a subscription fee line and, if applicable, an overage line.
  //
  // @param businessId        - The business this invoice is for
  // @param counter           - The closed UsageCounter for the period
  // @param plan              - Minimal plan data (no Prisma dependency)
  // @param policy            - Overage and tax policy from SystemConfig
  // -------------------------------------------------------------------------
  buildMonthlyInvoice(businessId: string, counter: UsageCounterSnapshot, plan: SubscriptionPlanInput, policy: OveragePolicy): InvoiceDTO {
    const items: InvoiceItemDTO[] = []

    // --- Subscription fee line ---
    if (plan.monthlyPrice > 0) {
      items.push(InvoiceEngine.buildSubscriptionFeeLine(plan.planName, plan.monthlyPrice))
    }

    // --- Overage line (only when overage billing is enabled and there are overage TXs) ---
    if (policy.overageBillingEnabled && counter.overageTxCount > 0) {
      items.push(InvoiceEngine.buildOverageLineItem(counter.overageTxCount, policy.overageRatePerTx))
    }

    const subtotalAmount = items.reduce((sum, item) => sum + item.lineAmount, 0)
    const taxAmount = InvoiceEngine.computeTax(subtotalAmount, policy.vatRate)
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
  // Constructs a single SUBSCRIPTION_FEE line item.
  // -------------------------------------------------------------------------
  buildSubscriptionFeeLine(planName: string, monthlyPrice: number): InvoiceItemDTO {
    return {
      type: InvoiceItemType.SUBSCRIPTION_FEE,
      description: `${planName} — Monthly subscription`,
      quantity: 1,
      unitAmount: monthlyPrice,
      lineAmount: monthlyPrice,
    }
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
