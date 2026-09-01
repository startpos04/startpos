/**
 * /api/cron/hourly
 * 
 * Hourly cron job endpoint
 * Runs: Every hour
 * 
 * Jobs:
 * 1. Retry failed advance payment syncs
 * 2. Process payment notifications
 * 
 * Security:
 *   Requires Authorization header: Bearer <CRON_SECRET>
 *   Prevents unauthorized triggering from public internet
 */

import { createFileRoute } from '@tanstack/react-router'
import { retryFailedAdvancePaymentSyncs } from '@/lib/jobs/advance-payment-sync-retry'
import { processPaymentNotifications } from '@/lib/jobs/process-payment-notifications'

export const Route = createFileRoute('/api/cron/hourly/' as never)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // -------------------------------------------------------------------
        // 1. Authentication — shared secret check
        // -------------------------------------------------------------------
        const cronSecret = process.env['CRON_SECRET']

        if (!cronSecret) {
          console.error('[cron/hourly] CRON_SECRET is not set. Rejecting request.')
          return new Response(
            JSON.stringify({ error: 'Cron endpoint not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const authHeader = request.headers.get('Authorization')
        const providedSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

        if (!providedSecret || providedSecret !== cronSecret) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        }

        // -------------------------------------------------------------------
        // 2. Run hourly jobs
        // -------------------------------------------------------------------
        const startTime = Date.now()
        const results: {
          advancePaymentSyncRetry?: { status: string }
          paymentNotifications?: {
            status: string
            processed: number
            scheduled: number
            failed: number
            retried: number
            errors: string[]
          }
        } = {}

        try {
          // Job 1: Retry failed advance payment syncs
          console.log('[cron/hourly] Starting job 1: advance-payment-sync-retry')
          await retryFailedAdvancePaymentSyncs()
          results.advancePaymentSyncRetry = { status: 'completed' }
          console.log('[cron/hourly] Completed job 1: advance-payment-sync-retry')

          // Job 2: Process payment notifications
          console.log('[cron/hourly] Starting job 2: process-payment-notifications')
          const notificationResults = await processPaymentNotifications()
          results.paymentNotifications = {
            status: 'completed',
            processed: notificationResults.totalProcessed,
            scheduled: notificationResults.processedScheduled,
            failed: notificationResults.failedScheduled,
            retried: notificationResults.retriedFailed,
            errors: notificationResults.errors,
          }
          console.log('[cron/hourly] Completed job 2: process-payment-notifications')

          const duration = Date.now() - startTime

          return new Response(
            JSON.stringify({
              success: true,
              timestamp: new Date().toISOString(),
              duration: `${duration}ms`,
              jobs: results,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )

        } catch (error) {
          console.error('[cron/hourly] Error:', error)

          return new Response(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
              jobs: results,
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      },
    },
  },
})
