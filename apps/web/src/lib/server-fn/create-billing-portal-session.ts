/**
 * create-billing-portal-session.ts
 *
 * Server function: create a billing portal session for the current user.
 *
 * The portal is a hosted UI where customers can:
 *   - Update their payment method (primary use case for GRACE_PERIOD)
 *   - View and download past invoices
 *   - Cancel or change their subscription
 *
 * Provider support:
 *   - Only available for providers that support customer portals
 *   - Stripe: Full-featured billing portal
 *   - Manual: Returns error (no portal available)
 *
 * Customer ID resolution (in order):
 *   1. externalId on BusinessSubscription â†’ retrieve subscription â†’ get customer
 *   2. Fallback: search provider customers by the user's email
 *
 * The customer is returned to /billing after they finish in the portal.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import Stripe from 'stripe'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { getBillingAdapter } from '../billing/get-billing-adapter'

export const createBillingPortalSession = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING), requireTenantContext()])
  .handler(async ({ context }) => {
    const { businessId, email } = getTenantContext(context).user

    const secretKey = process.env['STRIPE_SECRET_KEY']
    if (!secretKey) {
      return { success: false as const, error: 'Stripe is not configured.' }
    }

    const appUrl = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000'
    const stripe = new Stripe(secretKey)

    try {
      let customerId: string | null = null

      // --- Path 1: we have a subscription externalId â†’ retrieve customer from it ---
      const subscription = await rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: { externalId: true },
      })

      if (subscription?.externalId) {
        const stripeSub = await stripe.subscriptions.retrieve(subscription.externalId)
        customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id
      }

      // --- Path 2: no externalId yet â†’ look up customer by email ---
      if (!customerId && email) {
        const customers = await stripe.customers.list({ email, limit: 1 })
        if (customers.data.length > 0) {
          customerId = customers.data[0]?.id
        }
      }

      if (!customerId) {
        return {
          success: false as const,
          error: 'No Stripe customer found. Please complete a checkout first.',
        }
      }

      // Get the appropriate provider adapter for this business
      const adapter = await getBillingAdapter(businessId)
      if (!adapter) {
        return { success: false as const, error: 'No billing provider available for this business.' }
      }

      // Check if the provider supports customer portals
      const capabilities = adapter.getCapabilities()
      if (!capabilities.supportsCustomerPortal) {
        return {
          success: false as const,
          error: 'Customer portal is not available for your current payment method.',
        }
      }

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
