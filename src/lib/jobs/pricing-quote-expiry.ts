/**
 * pricing-quote-expiry.ts
 *
 * Background job: Pricing Quote Expiry
 *
 * Runs daily. Finds all PricingQuote records in DRAFT, CALCULATED, or SENT
 * status whose validUntil date has passed, and transitions them to EXPIRED.
 *
 * Idempotency guarantees:
 *   - Only quotes in expirable statuses with validUntil < now are processed.
 *   - Re-running after a partial failure is safe — already-EXPIRED quotes
 *     are not in the target status set.
 *
 * Architecture contract (ADR-001):
 *   - No domain engine imports — this job directly queries the DB.
 *     Quote expiry is a simple status sweep, not a complex domain operation.
 *   - Receives rootPrisma as a parameter — no global imports.
 *
 * Usage:
 *   const result = await runPricingQuoteExpiryJob(rootPrisma)
 *   console.log(result)
 */

import type { PrismaClient } from 'prisma/generated/prisma/client'
import { type JobResult, jobError, jobSuccess } from './index'

// Statuses that can transition to EXPIRED when validUntil has passed
const EXPIRABLE_STATUSES = ['DRAFT', 'CALCULATED', 'SENT'] as const

// ---------------------------------------------------------------------------
// runPricingQuoteExpiryJob
// ---------------------------------------------------------------------------

export async function runPricingQuoteExpiryJob(prisma: PrismaClient): Promise<JobResult> {
  const JOB_NAME = 'pricing-quote-expiry'

  try {
    const now = new Date()

    // Find all quotes that have passed their validUntil date
    const expiredQuotes = await prisma.pricingQuote.findMany({
      where: {
        status: { in: [...EXPIRABLE_STATUSES] as import('prisma/generated/prisma/enums').QuoteStatus[] },
        validUntil: { lt: now },
      },
      select: { id: true, status: true, businessId: true, validUntil: true },
    })

    if (expiredQuotes.length === 0) {
      return jobSuccess(JOB_NAME, 0, 0)
    }

    const quoteIds = expiredQuotes.map(q => q.id)

    // Bulk update to EXPIRED
    const updateResult = await prisma.pricingQuote.updateMany({
      where: { id: { in: quoteIds } },
      data: { status: 'EXPIRED', expiredAt: now },
    })

    return jobSuccess(JOB_NAME, updateResult.count, 0)
  } catch (err) {
    return jobError(JOB_NAME, err)
  }
}
