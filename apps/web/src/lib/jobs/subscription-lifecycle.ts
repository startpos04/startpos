/**
 * subscription-lifecycle.ts
 *
 * Background job: Subscription Lifecycle Transitions
 *
 * Runs daily. Evaluates every active BusinessSubscription and applies any
 * pending automated status transitions:
 *
 *   TRIAL → EXPIRED           (when trialEndsAt is in the past)
 *   GRACE_PERIOD → EXPIRED    (when gracePeriodEndsAt is in the past)
 *   EXPIRED → LONG_TERM_INACTIVE  (when expiredAt + LONG_TERM_INACTIVE_DAYS is in the past)
 *
 * Idempotency guarantees:
 *   - Only subscriptions whose current status matches the expected source status
 *     are processed. Re-running after a partial failure is safe.
 *   - A SubscriptionStatusHistory record is written atomically with the status
 *     update inside a single Prisma transaction.
 *
 * Architecture contract (ADR-001):
 *   - The engine (SubscriptionEngine) contains zero infrastructure imports.
 *   - This job is infrastructure — it fetches data, calls the engine, and
 *     persists the engine's output.
 *   - The job receives rootPrisma and thresholds as parameters — no globals.
 *
 * Usage (called from a cron endpoint or server-side scheduler):
 *   const result = await runSubscriptionLifecycleJob(rootPrisma, thresholds)
 *   console.log(result)
 */

import type { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { SubscriptionEngine } from '../billing/subscription-engine'
import type { BillingModel, LifecycleThresholds, SubscriptionSnapshot } from '../billing/types'
import { type JobResult, jobError, jobSuccess } from './index'

// ---------------------------------------------------------------------------
// Prisma select shape — minimum fields needed for lifecycle evaluation
// ---------------------------------------------------------------------------
const SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  status: true,
  billingModel: true,
  trialEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  gracePeriodEndsAt: true,
  expiredAt: true,
  longTermInactiveAt: true,
  activatedAt: true,
  cancelledAt: true,
  suspendedAt: true,
} as const

// ---------------------------------------------------------------------------
// runSubscriptionLifecycleJob
// ---------------------------------------------------------------------------

/**
 * Run the subscription lifecycle background job.
 *
 * @param rootPrisma - The root Prisma client (platform-level, not tenant-scoped)
 * @param thresholds - Policy thresholds loaded from configuration by the caller
 * @param now - Current time — passed explicitly for determinism; defaults to new Date()
 */
export async function runSubscriptionLifecycleJob(rootPrisma: PrismaClient, thresholds: LifecycleThresholds, now: Date = new Date()): Promise<JobResult> {
  const JOB_NAME = 'subscription-lifecycle'

  try {
    // Fetch all subscriptions that could have a pending automated transition.
    // We limit to TRIAL, GRACE_PERIOD, and EXPIRED — the only source states
    // for automated transitions. ACTIVE, SUSPENDED, LONG_TERM_INACTIVE, and
    // CANCELLED are never transitioned by this job.
    const candidates = await rootPrisma.businessSubscription.findMany({
      where: {
        status: { in: ['TRIAL', 'GRACE_PERIOD', 'EXPIRED'] },
      },
      select: SUBSCRIPTION_SELECT,
    })

    let processed = 0
    let skipped = 0
    const warnings: string[] = []

    for (const row of candidates) {
      // Cast Prisma row to the domain DTO — same string values, safe cast
      const snapshot: SubscriptionSnapshot = {
        id: row.id,
        businessId: row.businessId,
        status: row.status as SubscriptionStatus,
        billingModel: row.billingModel as BillingModel,
        trialEndsAt: row.trialEndsAt,
        currentPeriodStart: row.currentPeriodStart,
        currentPeriodEnd: row.currentPeriodEnd,
        gracePeriodEndsAt: row.gracePeriodEndsAt,
        expiredAt: row.expiredAt,
        longTermInactiveAt: row.longTermInactiveAt,
        activatedAt: row.activatedAt,
        cancelledAt: row.cancelledAt,
        suspendedAt: row.suspendedAt,
        advancePaymentCredits: ((row as Record<string, unknown>)['advancePaymentCredits'] as number) ?? 0,
        advancePaymentExpiresAt: ((row as Record<string, unknown>)['advancePaymentExpiresAt'] as Date | null) ?? null,
      }

      // Evaluate all possible transitions in priority order.
      // Each evaluator returns null if no transition is needed.
      const evaluations = [
        SubscriptionEngine.evaluateTrialExpiry(snapshot, thresholds, now),
        SubscriptionEngine.evaluateGracePeriodExpiry(snapshot, now),
        SubscriptionEngine.evaluateLongTermInactivity(snapshot, thresholds, now),
      ]

      // Find the first applicable transition (there should be at most one per run
      // since a subscription can only be in one state at a time)
      let transitioned = false
      for (const evalResult of evaluations) {
        if (!evalResult.ok) {
          // Engine returned a business error — log as warning and continue
          warnings.push(`[${snapshot.businessId}] Engine evaluation error: ${evalResult.reason}`)
          continue
        }

        const record = evalResult.value
        if (record === null) continue // No transition needed from this evaluator

        // Apply the transition atomically: update status + write history record
        try {
          // Build the update payload based on the target status
          const updateData = buildStatusUpdateData(record.toStatus, now, snapshot, thresholds)

          await rootPrisma.$transaction([
            rootPrisma.businessSubscription.update({
              where: { id: snapshot.id },
              data: updateData,
            }),
            rootPrisma.subscriptionStatusHistory.create({
              data: {
                subscriptionId: snapshot.id,
                fromStatus: record.fromStatus ?? null,
                toStatus: record.toStatus,
                reason: record.reason,
                triggeredBy: record.triggeredBy,
              },
            }),
          ])

          processed++
          transitioned = true
          break // Only one transition per subscription per run
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          warnings.push(`[${snapshot.businessId}] Failed to apply transition ${record.fromStatus} → ${record.toStatus}: ${message}`)
        }
      }

      if (!transitioned) {
        skipped++
      }
    }

    return jobSuccess(JOB_NAME, processed, skipped, warnings)
  } catch (err) {
    return jobError(JOB_NAME, err)
  }
}

// ---------------------------------------------------------------------------
// buildStatusUpdateData
// Constructs the Prisma update payload for a given target status.
// Sets the appropriate lifecycle timestamp alongside the status change.
// ---------------------------------------------------------------------------
function buildStatusUpdateData(
  toStatus: SubscriptionStatus,
  now: Date,
  snapshot: SubscriptionSnapshot,
  thresholds: LifecycleThresholds,
): Record<string, unknown> {
  const base = { status: toStatus, updatedAt: now }

  switch (toStatus) {
    case 'EXPIRED':
      // Record when the subscription first lapsed.
      // gracePeriodEndsAt is set here so the GRACE_PERIOD → EXPIRED path also clears it.
      return {
        ...base,
        expiredAt: snapshot.expiredAt ?? now, // Preserve if already set (GRACE_PERIOD → EXPIRED)
        gracePeriodEndsAt: null, // Clear grace period marker
      }

    case 'LONG_TERM_INACTIVE':
      return {
        ...base,
        longTermInactiveAt: now,
      }

    case 'ACTIVE':
      return {
        ...base,
        activatedAt: snapshot.activatedAt ?? now,
        expiredAt: null,
        gracePeriodEndsAt: null,
        longTermInactiveAt: null,
      }

    case 'GRACE_PERIOD': {
      // Calculate when the grace period ends from the current moment
      const gracePeriodEndsAt = new Date(now.getTime() + thresholds.gracePeriodDays * 24 * 60 * 60 * 1000)
      return {
        ...base,
        gracePeriodEndsAt,
        expiredAt: now, // Record lapse start time for LONG_TERM_INACTIVE threshold
      }
    }

    case 'SUSPENDED':
      return { ...base, suspendedAt: now }

    case 'CANCELLED':
      return { ...base, cancelledAt: now }

    default:
      return base
  }
}
