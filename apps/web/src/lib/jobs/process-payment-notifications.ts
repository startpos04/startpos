/**
 * process-payment-notifications.ts
 *
 * Background job to process scheduled payment notifications.
 * Runs hourly via cron endpoint.
 *
 * Responsibilities:
 * - Send scheduled renewal reminders
 * - Send advance payment expiration warnings
 * - Retry failed notification deliveries
 * - Clean up old processed notifications (optional)
 *
 * Design:
 * - Idempotent: Safe to run multiple times
 * - Resilient: Individual failures don't stop processing
 * - Observable: Comprehensive logging for monitoring
 *
 * Usage (from cron endpoint):
 *   const result = await processPaymentNotifications()
 *   console.log(`Processed: ${result.processed}, Failed: ${result.failed}`)
 */

import { paymentNotificationService } from '../services/payment-notification-service'

export type ProcessPaymentNotificationsResult = {
  processedScheduled: number
  failedScheduled: number
  skippedScheduled: number
  retriedFailed: number
  totalProcessed: number
  errors: string[]
}

/**
 * Process all due payment notifications
 *
 * Called by hourly cron job
 */
export async function processPaymentNotifications(): Promise<ProcessPaymentNotificationsResult> {
  console.log('[ProcessPaymentNotifications] Starting job...')

  const errors: string[] = []
  let processedScheduled = 0
  let failedScheduled = 0
  let skippedScheduled = 0
  let retriedFailed = 0

  try {
    // Process scheduled notifications that are due
    const scheduledResult = await paymentNotificationService.processScheduledNotifications()
    processedScheduled = scheduledResult.processed
    failedScheduled = scheduledResult.failed
    skippedScheduled = scheduledResult.skipped

    console.log(
      `[ProcessPaymentNotifications] Scheduled notifications: ${processedScheduled} processed, ${failedScheduled} failed, ${skippedScheduled} skipped`,
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error processing scheduled notifications'
    console.error('[ProcessPaymentNotifications] Error processing scheduled notifications:', error)
    errors.push(errorMessage)
  }

  try {
    // Retry previously failed notifications
    retriedFailed = await paymentNotificationService.retryFailedNotifications()
    console.log(`[ProcessPaymentNotifications] Retried ${retriedFailed} failed notifications`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error retrying failed notifications'
    console.error('[ProcessPaymentNotifications] Error retrying failed notifications:', error)
    errors.push(errorMessage)
  }

  const totalProcessed = processedScheduled + retriedFailed

  console.log(`[ProcessPaymentNotifications] Job complete: ${totalProcessed} total processed`)

  return {
    processedScheduled,
    failedScheduled,
    skippedScheduled,
    retriedFailed,
    totalProcessed,
    errors,
  }
}
