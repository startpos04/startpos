/**
 * create-billing-portal-session.ts
 *
 * Server function: create a Stripe Billing Portal session for the current user.
 *
 * The portal is Stripe's hosted UI where customers can:
 *   - Update their payment method (primary use case for GRACE_PERIOD)
 *   - View and download past invoices
 *   - Cancel or change their subscription
 *
 * Customer ID resolution (in order):
 *   1. externalId on BusinessSubscription → retrieve subscription → get customer
 *   2. Fallback: search Stripe customers by the user's email
 *
 * The customer is returned to /billing after they finish in the portal.
 */

import { createServerFn } from '@tanstack/react-start'
import Stripe from 'stripe'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'
import { prisma as rootPrisma } from '../prisma-client'

export const createBillingPortalSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .handler(async ({ context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId, email } = context.user

    const secretKey = process.env['STRIPE_SECRET_KEY']
    if (!secretKey) {
      return { success: false as const, error: 'Stripe is not configured.' }
    }

    const appUrl = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000'
    const stripe = new Stripe(secretKey)

    try {
      let customerId: string | null = null

      // --- Path 1: we have a subscription externalId → retrieve customer from it ---
      const subscription = await rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: { externalId: true },
      })

      if (subscription?.externalId) {
        const stripeSub = await stripe.subscriptions.retrieve(subscription.externalId)
        customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id
      }

      // --- Path 2: no externalId yet → look up customer by email ---
      if (!customerId && email) {
        const customers = await stripe.customers.list({ email, limit: 1 })
        if (customers.data.length > 0) {
          customerId = customers.data[0]!.id
        }
      }

      if (!customerId) {
        return {
          success: false as const,
          error: 'No Stripe customer found. Please complete a checkout first.',
        }
      }

      const adapter = createStripeAdapter()
      const session = await adapter.createCustomerPortalSession({
        externalCustomerId: customerId,
        returnUrl: `${appUrl}/billing`,
      })

      return { success: true as const, url: session.url }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false as const, error: `Could not open billing portal: ${message}` }
    }
  })
