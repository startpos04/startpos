/**
 * jobs/index.ts
 *
 * Shared job runner infrastructure for background jobs.
 *
 * All background jobs follow the same pattern:
 *   1. Accept a database client (rootPrisma) as a dependency — never import it directly.
 *   2. Read configuration from the caller — never read configuration themselves.
 *   3. Return a JobResult describing what was done — never throw on expected failures.
 *   4. Be idempotent — running twice for the same period must not produce duplicate effects.
 *
 * Registered jobs:
 *   subscription-lifecycle      → src/lib/jobs/subscription-lifecycle.ts
 *     Trigger: daily cron
 *     Purpose: TRIAL→EXPIRED, GRACE_PERIOD→EXPIRED, EXPIRED→LONG_TERM_INACTIVE
 *
 *   usage-counter-reset         → src/lib/jobs/usage-counter-reset.ts
 *     Trigger: daily cron (checks currentPeriodEnd)
 *     Purpose: close current UsageCounter; open next period counter
 *
 *   billing-invoice-generation  → src/lib/jobs/billing-invoice-generation.ts  [Phase 4]
 *     Trigger: daily cron (runs after usage-counter-reset)
 *     Purpose: generate BillingInvoice + items for closed billing periods
 *     Dependencies: usage-counter-reset must run first in the same cron window
 *
 *   pricing-quote-expiry        → src/lib/jobs/pricing-quote-expiry.ts  [Phase 5]
 *     Trigger: daily cron
 *     Purpose: set DRAFT/CALCULATED/SENT quotes past validUntil to EXPIRED
 *
 *   composable-renewal-preview  → src/lib/jobs/composable-renewal-preview.ts  [Phase 5]
 *     Trigger: daily cron (runs after pricing-quote-expiry)
 *     Purpose: detect grandfathered price changes; notify businesses before renewal
 *     Dependencies: active PricingCatalog must exist (seeded in Phase 5)
 *
 * Usage (server-side entry point, e.g. a cron endpoint):
 *   import { rootPrisma } from '@/lib/prisma-client'
 *   import { runSubscriptionLifecycleJob } from '@/lib/jobs/subscription-lifecycle'
 *   import { runUsageCounterResetJob } from '@/lib/jobs/usage-counter-reset'
 *   import { runBillingInvoiceGenerationJob } from '@/lib/jobs/billing-invoice-generation'
 *
 *   // Run in dependency order:
 *   await runSubscriptionLifecycleJob(rootPrisma, thresholds)
 *   await runUsageCounterResetJob(rootPrisma)
 *   await runBillingInvoiceGenerationJob(rootPrisma, overagePolicy, stripeAdapter)
 *   await runPricingQuoteExpiryJob(rootPrisma)
 *   await runComposableRenewalPreviewJob(rootPrisma, { previewWindowDays: 7 })
 */

// ---------------------------------------------------------------------------
// JobResult — structured outcome for all background jobs
// ---------------------------------------------------------------------------

export type JobOutcome = 'success' | 'partial' | 'noop' | 'error'

export type JobResult = {
  job: string
  outcome: JobOutcome
  /** Number of records processed (transitioned, reset, etc.) */
  processed: number
  /** Number of records skipped due to already being in the correct state */
  skipped: number
  /** Non-fatal errors encountered during processing (processing continues) */
  warnings: string[]
  /** Fatal error message if outcome = 'error' */
  error?: string
  /** ISO timestamp when the job ran */
  ranAt: string
}

/**
 * Build a JobResult for a successfully completed run.
 */
export function jobSuccess(job: string, processed: number, skipped: number, warnings: string[] = []): JobResult {
  return {
    job,
    outcome: warnings.length > 0 ? 'partial' : processed === 0 ? 'noop' : 'success',
    processed,
    skipped,
    warnings,
    ranAt: new Date().toISOString(),
  }
}

/**
 * Build a JobResult for a fatal error — job could not complete.
 */
export function jobError(job: string, error: unknown): JobResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    job,
    outcome: 'error',
    processed: 0,
    skipped: 0,
    warnings: [],
    error: message,
    ranAt: new Date().toISOString(),
  }
}
