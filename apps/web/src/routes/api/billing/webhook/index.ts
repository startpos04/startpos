/**
 * api/billing/webhook/index.ts
 *
 * DEPRECATED: Generic webhook handler - Phase 4.
 *
 * This endpoint is deprecated in favor of provider-specific webhook routes:
 * - /api/billing/webhook/stripe  (for Stripe webhooks)
 * - /api/billing/webhook/manual  (for manual payment webhooks, if any)
 *
 * This route now redirects Stripe webhooks to the new provider-specific endpoint
 * for backward compatibility during the transition period.
 *
 * Security contract (Phase 4 compliance gate):
 *   - Signature is ALWAYS verified before any payload is read or acted on.
 *   - Invalid signature → 400 response immediately; no processing.
 *   - Every handler is idempotent — duplicate delivery is safe.
 *
 * Migration notice:
 *   Update your Stripe webhook configuration to point to: /api/billing/webhook/stripe
 */

import { createFileRoute } from '@tanstack/react-router'

// TanStack Router requires the route path to match the file path exactly.
// The routeTree.gen.ts is auto-generated — this route will register after the
// next `pnpm dev` / `pnpm build` run.
export const Route = createFileRoute('/api/billing/webhook/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // -----------------------------------------------------------------------
        // Deprecation notice and redirect to provider-specific endpoint
        // -----------------------------------------------------------------------
        console.warn('[webhook] DEPRECATED: Generic webhook endpoint used. Update webhook URL to /api/billing/webhook/stripe')

        // Check if this is a Stripe webhook by signature header
        const signature = request.headers.get('stripe-signature')

        if (signature) {
          // Redirect Stripe webhooks to the new provider-specific endpoint
          // Note: We can't actually redirect a webhook POST, so we process it here
          // but log the deprecation warning

          const rawBody = await request.text()

          // Import the new Stripe webhook handler and delegate to it
          try {
            const { Route: StripeRoute } = await import('./stripe')

            // Create a new request with the same body and headers
            const newRequest = new Request(request.url.replace('/webhook/', '/webhook/stripe'), {
              method: 'POST',
              headers: request.headers,
              body: rawBody,
            })

            // Process using the new Stripe handler
            return await StripeRoute.server!.handlers!.POST!({ request: newRequest })
          } catch (error) {
            console.error('[webhook] Failed to delegate to Stripe handler:', error)

            return new Response(
              JSON.stringify({
                error: 'Webhook processing failed',
                message: 'Please update webhook URL to /api/billing/webhook/stripe',
              }),
              {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
        }

        // Unknown webhook type
        return new Response(
          JSON.stringify({
            error: 'Unknown webhook provider',
            message: 'Please use provider-specific webhook endpoints: /api/billing/webhook/stripe',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    },
  },
})
