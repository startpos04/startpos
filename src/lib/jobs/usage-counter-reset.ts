/**
 * usage-counter-reset.ts
 *
 * Background job: Usage Counter Reset
 *
 * Runs at period end (typically triggered by subscription lifecycle events or
 * a daily cron that checks for subscriptions whose currentPeriodEnd has passed).
 *
 * For each ACTIVE or TRIAL subscription whose billing period has ended:
 *   1. Find the open UsageCounter for the current period.
 *   2. Close it (isClosed = true).
 *   3. Open a new UsageCounter for the next billing period.
 *   4. Update BusinessSubscription.currentPeriodStart / currentPeriodEnd.
 *
 * Idempotency guarantees:
 *   - A closed counter is never re-closed.
 *   - The unique constraint on (businessId, billingPeriodStart) prevents
 *     duplicate open counters for the same period.
 *   - Running twice for the same period is safe.
 *
 * Architecture contract (ADR-001):
 *   - The engine (UsageEngine) contains zero infrastructure imports.
 *   - This job is infrastructure — it fetches data, calls the engine, and
 *     persists the engine's output.
 *   - The job receives rootPrisma as a parameter — no globals.
 *
 * Usage (called from a cron endpoint or server-side scheduler):
 *   const result = await runUsageCounterResetJob(rootPrisma)
 *   console.log(result)
 */

import type { PrismaClient } from 'prisma/generated/prisma/client'
import type { UsageCounterSnapshot } from '../billing/types'
import { UsageEngine } from '../billing/usage-engine'
import { type JobResult, jobError, jobSuccess } from './index'

// ---------------------------------------------------------------------------
// Prisma select shape — minimum fields needed for the reset evaluation
// ---------------------------------------------------------------------------
const SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  status: true,
  billingModel: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
} as const

// ---------------------------------------------------------------------------
// runUsageCounterResetJob
// ---------------------------------------------------------------------------

/**
 * Run the usage counter reset background job.
 *
 * @param rootPrisma - The root Prisma client (platform-level, not tenant-scoped)
 * @param now        - Current time — passed explicitly for determinism; defaults to new Date()
 */
export async function runUsageCounterResetJob(rootPrisma: PrismaClient, now: Date = new Date()): Promise<JobResult> {
  const JOB_NAME = 'usage-counter-reset'

  try {
    // Find all subscriptions whose billing period has ended but whose
    // open counter has not yet been closed (isClosed = false).
    // We only process ACTIVE and TRIAL subscriptions; EXPIRED, CANCELLED, etc.
    // either have no usage to track or are handled by the lifecycle job.
    const candidates = await rootPrisma.businessSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
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
        // Fetch the open counter for this period
        const openCounter = await rootPrisma.usageCounter.findFirst({
          where: {
            businessId: subscription.businessId,
            billingPeriodStart: subscription.currentPeriodStart,
            isClosed: false,
          },
          select: {
            id: true,
            businessId: true,
            branchId: true,
            billingPeriodStart: true,
            billingPeriodEnd: true,
            txCount: true,
            overageTxCount: true,
            isClosed: true,
          },
        })

        if (!openCounter) {
          // Counter was already closed or never opened — skip
          skipped++
          continue
        }

        const snapshot: UsageCounterSnapshot = {
          id: openCounter.id,
          businessId: openCounter.businessId,
          branchId: openCounter.branchId,
          billingPeriodStart: openCounter.billingPeriodStart,
          billingPeriodEnd: openCounter.billingPeriodEnd,
          txCount: openCounter.txCount,
          overageTxCount: openCounter.overageTxCount,
          isClosed: openCounter.isClosed,
        }

        // Validate close operation via engine
        const closeResult = UsageEngine.closeCounter(snapshot)
        if (!closeResult.ok) {
          warnings.push(`[${subscription.businessId}] Close counter failed: ${closeResult.reason}`)
          skipped++
          continue
        }

        // Compute the next billing period.
        // Duration is the same as the current period (standard monthly billing).
        const periodDurationMs = subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()
        const nextPeriodStart = new Date(subscription.currentPeriodEnd.getTime() + 1)
        const nextPeriodEnd = new Date(nextPeriodStart.getTime() + periodDurationMs)

        // Build the new counter for the next period
        const newCounter = UsageEngine.buildNewCounter(subscription.businessId, nextPeriodStart, nextPeriodEnd)

        // Atomically:
        //   1. Close the current counter
        //   2. Open a new counter for the next period
        //   3. Advance BusinessSubscription.currentPeriodStart + currentPeriodEnd
        await rootPrisma.$transaction([
          rootPrisma.usageCounter.update({
            where: { id: snapshot.id },
            data: { isClosed: true },
          }),
          rootPrisma.usageCounter.create({
            data: {
              businessId: newCounter.businessId,
              branchId: newCounter.branchId,
              billingPeriodStart: newCounter.billingPeriodStart,
              billingPeriodEnd: newCounter.billingPeriodEnd,
              txCount: 0,
              overageTxCount: 0,
              isClosed: false,
            },
          }),
          rootPrisma.businessSubscription.update({
            where: { id: subscription.id },
            data: {
              currentPeriodStart: nextPeriodStart,
              currentPeriodEnd: nextPeriodEnd,
            },
          }),
        ])

        processed++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        warnings.push(`[${subscription.businessId}] Failed to reset usage counter: ${message}`)
      }
    }

    return jobSuccess(JOB_NAME, processed, skipped, warnings)
  } catch (err) {
    return jobError(JOB_NAME, err)
  }
}
