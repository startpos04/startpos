/**
 * advance-payment-sync-retry.ts
 * 
 * Background job to retry failed advance payment syncs.
 * 
 * Runs: Every hour
 * Purpose: Retry payments with FAILED sync status using exponential backoff
 * 
 * Architecture:
 * - Uses advancePaymentService.retryFailedSyncs()
 * - Processes up to 50 payments per run
 * - Respects exponential backoff timing
 * - Logs results for monitoring
 */

import { advancePaymentService } from '@/lib/billing/advance-payment-service'

/**
 * Retry failed advance payment syncs
 * 
 * Called by cron job: /api/cron/hourly
 */
export async function retryFailedAdvancePaymentSyncs(): Promise<void> {
  console.log('[Job] advance-payment-sync-retry: Starting')

  try {
    const result = await advancePaymentService.retryFailedSyncs()

    console.log('[Job] advance-payment-sync-retry: Complete', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      successRate: result.processed > 0 
        ? `${Math.round((result.succeeded / result.processed) * 100)}%`
        : 'N/A',
    })

    // Log warning if many failures
    if (result.failed > result.succeeded && result.processed > 5) {
      console.warn('[Job] advance-payment-sync-retry: High failure rate detected', {
        failed: result.failed,
        succeeded: result.succeeded,
      })
    }

  } catch (error) {
    console.error('[Job] advance-payment-sync-retry: Error', error)
    throw error
  }
}
