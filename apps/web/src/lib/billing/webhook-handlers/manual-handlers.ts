/**
 * manual-handlers.ts
 *
 * Manual payment provider webhook handlers.
 * Manual payments don't use webhooks, but this provides a consistent
 * interface and placeholder for future manual payment integrations.
 *
 * Note: Manual payment approval is handled through admin UI and server functions,
 * not through webhooks. This file exists for architectural completeness.
 */

import type { WebhookEvent, WebhookProcessingResult } from '@/lib/billing/billing-provider'
import { WebhookOutcome } from '@/lib/billing/types'
import type { WebhookEventHandler } from './shared-handlers'

/**
 * Manual payment approval handler
 * This would be called if we implemented webhook-style notifications
 * for manual payment status changes (e.g., from external admin systems)
 */
export const handlePaymentApproved: WebhookEventHandler = async (event: WebhookEvent) => {
  return {
    eventId: event.id,
    eventType: event.type,
    outcome: WebhookOutcome.SKIPPED,
    message: 'Manual payment approvals are handled through admin UI, not webhooks',
  }
}

/**
 * Manual payment rejection handler
 */
export const handlePaymentRejected: WebhookEventHandler = async (event: WebhookEvent) => {
  return {
    eventId: event.id,
    eventType: event.type,
    outcome: WebhookOutcome.SKIPPED,
    message: 'Manual payment rejections are handled through admin UI, not webhooks',
  }
}

/**
 * Manual payment timeout handler
 * Could be used for auto-expiring manual payments
 */
export const handlePaymentExpired: WebhookEventHandler = async (event: WebhookEvent) => {
  return {
    eventId: event.id,
    eventType: event.type,
    outcome: WebhookOutcome.SKIPPED,
    message: 'Manual payment expiration not implemented via webhooks',
  }
}

// Export all handlers for consistent interface
export const manualHandlers = {
  'payment.approved': handlePaymentApproved,
  'payment.rejected': handlePaymentRejected,
  'payment.expired': handlePaymentExpired,
} as const
