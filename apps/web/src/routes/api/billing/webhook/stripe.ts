/**
 * api/billing/webhook/stripe.ts
 *
 * Stripe-specific webhook endpoint using the new multi-provider architecture.
 * Replaces the generic /api/billing/webhook/ endpoint for Stripe webhooks.
 *
 * Security contract:
 * - Signature verification using Stripe adapter
 * - Idempotency using WebhookEvent model
 * - Event routing using shared webhook infrastructure
 *
 * Usage:
 * Configure Stripe webhook endpoint to: /api/billing/webhook/stripe
 */

import { createFileRoute } from '@tanstack/react-router'
import type { WebhookEvent } from '@/lib/billing/billing-provider'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'
import { getProviderConfig } from '@/lib/billing/provider-config'
import { createWebhookErrorResponse, createWebhookProcessor, createWebhookResponse } from '@/lib/billing/webhook-handlers/shared-handlers'
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from '@/lib/billing/webhook-handlers/stripe-handlers'

export const Route = createFileRoute('/api/billing/webhook/stripe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // -----------------------------------------------------------------------
          // 1. Read raw body and signature
          // -----------------------------------------------------------------------
          const rawBody = await request.text()
          const signature = request.headers.get('stripe-signature')

          if (!signature) {
            return createWebhookErrorResponse('Missing stripe-signature header', 400)
          }

          // -----------------------------------------------------------------------
          // 2. Get Stripe adapter and verify signature
          // -----------------------------------------------------------------------
          const adapter = paymentProviderRegistry.getAdapter('stripe')
          if (!adapter) {
            return createWebhookErrorResponse('Stripe provider not available', 503)
          }

          const config = getProviderConfig('stripe')
          if (!config?.webhookSecret) {
            return createWebhookErrorResponse('Stripe webhook configuration not found', 503)
          }

          let event: WebhookEvent
          try {
            event = await adapter.verifyWebhookSignature({
              rawBody,
              signature,
              secret: config.webhookSecret,
            })
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Signature verification failed'
            console.error('[webhook/stripe] Signature verification failed:', message)
            return createWebhookErrorResponse(message, 400)
          }

          // -----------------------------------------------------------------------
          // 3. Create webhook processor and register Stripe handlers
          // -----------------------------------------------------------------------
          const processor = createWebhookProcessor({
            providerId: 'stripe',
            skipIdempotencyCheck: false,
            maxRetries: 3,
          })

          // Register Stripe event handlers
          processor.registerHandler('invoice.paid', handleInvoicePaid)
          processor.registerHandler('invoice.payment_failed', handleInvoicePaymentFailed)
          processor.registerHandler('customer.subscription.deleted', handleSubscriptionDeleted)
          processor.registerHandler('customer.subscription.updated', handleSubscriptionUpdated)
          processor.registerHandler('checkout.session.completed', handleCheckoutSessionCompleted)

          // -----------------------------------------------------------------------
          // 4. Process the event
          // -----------------------------------------------------------------------
          const result = await processor.processEvent(event)

          console.log(`[webhook/stripe] Processed event ${event.id} (${event.type}): ${result.outcome}`)

          return createWebhookResponse(result)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('[webhook/stripe] Unexpected error:', error)

          return createWebhookErrorResponse(`Internal server error: ${message}`, 500)
        }
      },
    },
  },
})
