/**
 * billing-invoice-generation.ts
 *
 * Background job: Monthly Billing Invoice Generation
 *
 * Runs at period end (daily cron, same trigger window as usage-counter-reset).
 * For each ACTIVE subscription whose billing period has ended:
 *   1. Find the closed UsageCounter for the completed period.
 *   2. Build an InvoiceDTO via InvoiceEngine.buildMonthlyInvoice.
 *   3. Persist a BillingInvoice + BillingInvoiceItem rows in a single transaction.
 *   4. Optionally push the invoice to the billing provider and store externalInvoiceId.
 *
 * Idempotency guarantee:
 *   A (businessId, billingPeriodStart) unique index on BillingInvoice prevents
 *   duplicate invoice creation. Re-running after a partial failure is safe.
 *
 * Architecture contract (ADR-001):
 *   - InvoiceEngine is pure — receives plain DTOs; returns plain InvoiceDTO.
 *   - This job is infrastructure — it fetches, calls the engine, and persists.
 *   - rootPrisma is injected by the caller; no global imports.
 *   - The billing provider adapter is optional — pass null to skip provider push.
 *
 * Usage (called from a cron endpoint):
 *   const result = await runBillingInvoiceGenerationJob(rootPrisma, policy, adapter)
 */

import type { PrismaClient } from 'prisma/generated/prisma/client'
import type { BillingProviderAdapter } from '../billing/billing-provider'
import { InvoiceEngine, type SubscriptionPlanInput } from '../billing/invoice-engine'
import type { OveragePolicy, UsageCounterSnapshot } from '../billing/types'
import { type JobResult, jobError, jobSuccess } from './index'

// ---------------------------------------------------------------------------
// Prisma select shapes
// ---------------------------------------------------------------------------

const SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  planId: true,
  billingModel: true,
  externalId: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  plan: {
    select: {
      name: true,
      monthlyPrice: true,
      annualPrice: true,
      includedTxPerMonth: true,
      overagePerTx: true,
    },
  },
} as const

const USAGE_COUNTER_SELECT = {
  id: true,
  businessId: true,
  billingPeriodStart: true,
  billingPeriodEnd: true,
  txCount: true,
  overageTxCount: true,
  isClosed: true,
} as const

// ---------------------------------------------------------------------------
// runBillingInvoiceGenerationJob
// ---------------------------------------------------------------------------

/**
 * Run the billing invoice generation background job.
 *
 * @param rootPrisma  - Platform-level Prisma client (not tenant-scoped)
 * @param policy      - Overage and tax policy read from configuration by the caller
 * @param adapter     - Billing provider adapter (optional; pass null to skip provider push)
 * @param now         - Current time — passed explicitly for determinism; defaults to new Date()
 */
export async function runBillingInvoiceGenerationJob(
  rootPrisma: PrismaClient,
  policy: OveragePolicy,
  adapter: BillingProviderAdapter | null = null,
  now: Date = new Date(),
): Promise<JobResult> {
  const JOB_NAME = 'billing-invoice-generation'

  try {
    // Find all ACTIVE subscriptions whose billing period has just ended.
    // "Just ended" = currentPeriodEnd is in the past AND there is no invoice
    // for that period yet (checked per-subscription below).
    const candidates = await rootPrisma.businessSubscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lte: now, not: null },
        currentPeriodStart: { not: null },
      },
      select: SUBSCRIPTION_SELECT,
    })

    let processed = 0
    let skipped = 0
    const warnings: string[] = []

    for (const subscription of candidates) {
      if (!subscription.currentPeriodStart || !subscription.currentPeriodEnd) {
        skipped++
        continue
      }

      try {
        // Idempotency check: skip if an invoice already exists for this period.
        const existingInvoice = await rootPrisma.billingInvoice.findFirst({
          where: {
            businessId: subscription.businessId,
            billingPeriodStart: subscription.currentPeriodStart,
          },
          select: { id: true },
        })

        if (existingInvoice) {
          skipped++
          continue
        }

        // Find the closed UsageCounter for the completed period.
        // The usage-counter-reset job should have already closed it.
        const usageCounter = await rootPrisma.usageCounter.findFirst({
          where: {
            businessId: subscription.businessId,
            billingPeriodStart: subscription.currentPeriodStart,
            isClosed: true,
          },
          select: USAGE_COUNTER_SELECT,
        })

        // Build a stub counter if none exists (new subscription with zero usage)
        const counterSnapshot: UsageCounterSnapshot = usageCounter
          ? {
              id: usageCounter.id,
              businessId: usageCounter.businessId,
              branchId: (usageCounter as { branchId?: string }).branchId ?? '__unknown__',
              billingPeriodStart: usageCounter.billingPeriodStart,
              billingPeriodEnd: usageCounter.billingPeriodEnd,
              txCount: usageCounter.txCount,
              overageTxCount: usageCounter.overageTxCount,
              isClosed: usageCounter.isClosed,
            }
          : {
              id: '__stub__',
              businessId: subscription.businessId,
              branchId: '__stub__',
              billingPeriodStart: subscription.currentPeriodStart ?? new Date(),
              billingPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
              txCount: 0,
              overageTxCount: 0,
              isClosed: true,
            }

        const planInput: SubscriptionPlanInput = {
          planName: subscription.plan.name,
          monthlyPrice: subscription.plan.monthlyPrice,
          annualPrice: subscription.plan.annualPrice ?? null,
          includedTxPerMonth: subscription.plan.includedTxPerMonth,
          overagePerTx: subscription.plan.overagePerTx,
        }

        // Route to the correct invoice builder based on billing model
        const isAnnual = subscription.billingModel === 'YEARLY_SUBSCRIPTION'
        const invoiceDTO = isAnnual
          ? InvoiceEngine.buildAnnualInvoice(subscription.businessId, counterSnapshot, planInput, policy)
          : InvoiceEngine.buildMonthlyInvoice(subscription.businessId, counterSnapshot, planInput, policy)

        // Skip zero-amount invoices (free trial period, no overage)
        if (invoiceDTO.totalAmount === 0 && invoiceDTO.items.length === 0) {
          skipped++
          continue
        }

        // Persist invoice + items atomically
        const createdInvoice = await rootPrisma.$transaction(async tx => {
          const invoice = await tx.billingInvoice.create({
            data: {
              businessId: invoiceDTO.businessId,
              billingPeriodStart: invoiceDTO.billingPeriodStart,
              billingPeriodEnd: invoiceDTO.billingPeriodEnd,
              status: invoiceDTO.status as import('prisma/generated/prisma/enums').InvoiceStatus,
              subtotalAmount: invoiceDTO.subtotalAmount,
              taxAmount: invoiceDTO.taxAmount,
              totalAmount: invoiceDTO.totalAmount,
              dueAt: new Date(invoiceDTO.billingPeriodEnd.getTime() + 14 * 24 * 60 * 60 * 1000), // Net-14
              items: {
                create: invoiceDTO.items.map(item => ({
                  type: item.type as import('prisma/generated/prisma/enums').InvoiceItemType,
                  description: item.description,
                  quantity: item.quantity,
                  unitAmount: item.unitAmount,
                  lineAmount: item.lineAmount,
                })),
              },
            },
            select: { id: true, externalInvoiceId: true },
          })
          return invoice
        })

        // Optionally push to billing provider and store externalInvoiceId.
        // This is best-effort — a failure here does NOT roll back the invoice.
        if (adapter && subscription.externalId) {
          try {
            const providerInvoice = await adapter.getInvoice(subscription.externalId)
            if (providerInvoice.externalInvoiceId) {
              await rootPrisma.billingInvoice.update({
                where: { id: createdInvoice.id },
                data: {
                  externalInvoiceId: providerInvoice.externalInvoiceId,
                  status: providerInvoice.status.toUpperCase() as import('prisma/generated/prisma/enums').InvoiceStatus,
                  paidAt: providerInvoice.paidAt,
                },
              })
            }
          } catch (providerErr) {
            const msg = providerErr instanceof Error ? providerErr.message : String(providerErr)
            warnings.push(`[${subscription.businessId}] Invoice created (${createdInvoice.id}) but provider sync failed: ${msg}`)
          }
        }

        processed++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warnings.push(`[${subscription.businessId}] Failed to generate invoice: ${message}`)
      }
    }

    return jobSuccess(JOB_NAME, processed, skipped, warnings)
  } catch (err) {
    return jobError(JOB_NAME, err)
  }
}
