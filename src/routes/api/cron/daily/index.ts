/**
 * api/cron/daily/index.ts
 *
 * Daily cron entry point — runs all background jobs in dependency order.
 *
 * Security:
 *   Every request must supply the Authorization header:
 *     Authorization: Bearer <CRON_SECRET>
 *   Requests without a valid secret receive 401. This prevents accidental or
 *   malicious triggering from the public internet.
 *
 *   On Vercel, set CRON_SECRET in project environment variables and add
 *   CRON_SECRET to the Authorization header in vercel.json:
 *     { "authorization": "Bearer $CRON_SECRET" }
 *   Vercel injects the secret automatically on each scheduled invocation.
 *
 * Job execution order (dependency-driven):
 *   1. subscription-lifecycle      — TRIAL/GRACE_PERIOD/EXPIRED transitions
 *   2. usage-counter-reset         — close open counters; open next period
 *   3. billing-invoice-generation  — must run AFTER usage-counter-reset
 *   4. pricing-quote-expiry        — independent; no ordering requirement
 *   5. composable-renewal-preview  — must run AFTER pricing-quote-expiry
 *
 *   Jobs 1–3 are sequential (3 depends on 2's output).
 *   Jobs 4–5 run after 1–3 but are also sequential (5 depends on 4).
 *   The overall run is fail-fast per job: if a job returns outcome='error'
 *   it is recorded but subsequent jobs still run (non-fatal isolation).
 *
 * OveragePolicy is read from SystemConfig global defaults.
 * LifecycleThresholds are read from SystemConfig global defaults.
 * Both fall back to the documented defaults when not configured.
 *
 * The Stripe adapter is constructed only when STRIPE_SECRET_KEY is present —
 * if it is absent (local dev / CI), invoice generation still runs but skips
 * the Stripe provider push (adapter = null).
 *
 * Trigger: Vercel Cron — daily at 00:05 UTC (vercel.json)
 * Method: POST (Vercel cron invocations use POST)
 * Timeout: 60 s (Vercel hobby) / 300 s (pro) — adjust maxDuration in vercel.json
 */

import { createFileRoute } from '@tanstack/react-router'
import type { BillingProviderAdapter } from '@/lib/billing/billing-provider'
import type { JobResult } from '@/lib/jobs'
import { runBillingInvoiceGenerationJob } from '@/lib/jobs/billing-invoice-generation'
import { runComposableRenewalPreviewJob } from '@/lib/jobs/composable-renewal-preview'
import { runPricingQuoteExpiryJob } from '@/lib/jobs/pricing-quote-expiry'
import { runSubscriptionLifecycleJob } from '@/lib/jobs/subscription-lifecycle'
import { runUsageCounterResetJob } from '@/lib/jobs/usage-counter-reset'
import { prisma as rootPrisma } from '@/lib/prisma-client'

// ---------------------------------------------------------------------------
// Route registration (TanStack Start file-based routing)
// The route path below must match the file path exactly.
// FileRoutesByPath is auto-generated — this entry will appear after the next
// `pnpm dev` or `pnpm build` run that triggers routeTree.gen.ts regeneration.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/cron/daily/' as never)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // -------------------------------------------------------------------
        // 1. Authentication — shared secret check
        // -------------------------------------------------------------------
        const cronSecret = process.env['CRON_SECRET']

        if (!cronSecret) {
          // CRON_SECRET not configured — reject to prevent accidental open access
          console.error('[cron/daily] CRON_SECRET is not set. Rejecting request.')
          return new Response(JSON.stringify({ error: 'Cron endpoint not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const authHeader = request.headers.get('Authorization')
        const providedSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

        if (!providedSecret || providedSecret !== cronSecret) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // -------------------------------------------------------------------
        // 2. Load policy configuration from SystemConfig global defaults
        //    Fall back to documented defaults when keys are not seeded.
        // -------------------------------------------------------------------

        // Read the one global OVERAGE_BILLING_ENABLED config (no businessId —
        // this is used as a platform default for the invoice generation job)
        const overageConfig = await rootPrisma.systemConfig.findFirst({
          where: { key: 'OVERAGE_BILLING_ENABLED', businessId: null, branchId: null },
          select: { value: true },
        })
        const vatConfig = await rootPrisma.systemConfig.findFirst({
          where: { key: 'COMPOSABLE_TAX_RATE', businessId: null, branchId: null },
          select: { value: true },
        })

        const overagePolicy = {
          overageBillingEnabled: overageConfig?.value === 'true',
          overageRatePerTx: 0, // Per-plan rate — InvoiceEngine reads from plan directly
          vatRate: vatConfig ? Number(vatConfig.value) / 10000 : 0.12,
        }

        const thresholds = {
          trialDurationDays: 30,
          gracePeriodDays: 7,
          longTermInactiveDays: 90,
        }

        // -------------------------------------------------------------------
        // 3. Build Stripe adapter (optional — null disables provider push)
        // -------------------------------------------------------------------
        let stripeAdapter: BillingProviderAdapter | null = null
        const stripeKey = process.env['STRIPE_SECRET_KEY']

        if (stripeKey) {
          try {
            const { createStripeAdapter } = await import('@/lib/billing/adapters/stripe-adapter')
            stripeAdapter = createStripeAdapter()
          } catch (err) {
            console.warn('[cron/daily] Failed to initialise Stripe adapter — invoice sync disabled:', err)
          }
        }

        // -------------------------------------------------------------------
        // 4. Run all jobs in dependency order
        //    Each job is isolated: a fatal error in one does not abort the rest.
        // -------------------------------------------------------------------
        const now = new Date()
        const results: JobResult[] = []

        // Job 1 — subscription lifecycle transitions
        results.push(await runSubscriptionLifecycleJob(rootPrisma, thresholds, now))

        // Job 2 — close expired billing periods and open the next ones
        results.push(await runUsageCounterResetJob(rootPrisma, now))

        // Job 3 — generate invoices for closed periods (depends on job 2)
        results.push(await runBillingInvoiceGenerationJob(rootPrisma, overagePolicy, stripeAdapter, now))

        // Job 4 — expire stale pricing quotes
        results.push(await runPricingQuoteExpiryJob(rootPrisma))

        // Job 5 — notify businesses about upcoming composable price changes
        results.push(await runComposableRenewalPreviewJob(rootPrisma, { previewWindowDays: 7 }))

        // -------------------------------------------------------------------
        // 5. Summarise and respond
        // -------------------------------------------------------------------
        const hasError = results.some(r => r.outcome === 'error')
        const summary = {
          ranAt: now.toISOString(),
          status: hasError ? 'partial' : 'ok',
          jobs: results.map(r => ({
            job: r.job,
            outcome: r.outcome,
            processed: r.processed,
            skipped: r.skipped,
            warnings: r.warnings.length > 0 ? r.warnings : undefined,
            error: r.error,
          })),
        }

        if (hasError) {
          // Log individual job errors for observability (Vercel, Datadog, etc.)
          for (const r of results) {
            if (r.outcome === 'error') {
              console.error(`[cron/daily] Job "${r.job}" failed:`, r.error)
            }
          }
        }

        console.info('[cron/daily] Run complete:', JSON.stringify(summary))

        return new Response(JSON.stringify(summary), {
          status: hasError ? 207 : 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
