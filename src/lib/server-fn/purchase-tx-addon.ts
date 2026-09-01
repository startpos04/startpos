/**
 * purchase-tx-addon.ts
 *
 * Server function: initiate a transaction top-up addon purchase via Stripe.
 *
 * Flow:
 *   1. Business admin selects a TX package on /billing.
 *   2. This server function creates a Stripe Checkout Session (mode: payment).
 *   3. The client redirects to the returned URL.
 *   4. On payment success, Stripe sends a `checkout.session.completed` webhook.
 *   5. The webhook handler creates a BusinessSubscriptionAddon TX_TOPUP row.
 *   6. On next session load, auth-server.ts sums active addon TX into txRemaining.
 *
 * Architecture:
 *   - Only the adapter is imported; never Stripe directly.
 *   - businessId comes from session context — never from client input.
 *   - The TX quantity is validated against a known enum; arbitrary values blocked.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY
 *   STRIPE_TX_ADDON_500_PRICE_ID   — Stripe Price ID for +500 TX package
 *   STRIPE_TX_ADDON_1000_PRICE_ID  — Stripe Price ID for +1,000 TX package
 *   STRIPE_TX_ADDON_5000_PRICE_ID  — Stripe Price ID for +5,000 TX package
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '@startpos-core/lib/authorization/permission-keys'
import { authMiddleware } from '@startpos-core/lib/better-auth/auth-middleware'
import { requirePermission } from '@startpos-core/lib/better-auth/permission-middleware'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'

// ---------------------------------------------------------------------------
// TX addon package catalog
// ---------------------------------------------------------------------------

type TxAddonPackage = {
  id: string
  label: string
  txAmount: number
  displayPrice: string
  stripePriceId: string
}

function buildTxAddonPackages(): TxAddonPackage[] {
  return [
    {
      id: 'tx_500',
      label: '+500 Transactions',
      txAmount: 500,
      displayPrice: '₱99',
      stripePriceId: process.env['STRIPE_TX_ADDON_500_PRICE_ID'] ?? '',
    },
    {
      id: 'tx_1000',
      label: '+1,000 Transactions',
      txAmount: 1000,
      displayPrice: '₱179',
      stripePriceId: process.env['STRIPE_TX_ADDON_1000_PRICE_ID'] ?? '',
    },
    {
      id: 'tx_5000',
      label: '+5,000 Transactions',
      txAmount: 5000,
      displayPrice: '₱799',
      stripePriceId: process.env['STRIPE_TX_ADDON_5000_PRICE_ID'] ?? '',
    },
  ]
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const PurchaseTxAddonInputSchema = z.object({
  packageId: z.enum(['tx_500', 'tx_1000', 'tx_5000']),
})

export type PurchaseTxAddonInput = z.infer<typeof PurchaseTxAddonInputSchema>

// ---------------------------------------------------------------------------
// fetchTxAddonPackages — returns the catalog without Stripe Price IDs
// ---------------------------------------------------------------------------

export const fetchTxAddonPackages = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .handler(async () => {
    return buildTxAddonPackages().map(pkg => ({
      id: pkg.id,
      label: pkg.label,
      txAmount: pkg.txAmount,
      displayPrice: pkg.displayPrice,
      // stripePriceId intentionally excluded — never expose to client
    }))
  })

export type TxAddonPackageOption = Awaited<ReturnType<typeof fetchTxAddonPackages>>[number]

// ---------------------------------------------------------------------------
// purchaseTxAddon server function
// ---------------------------------------------------------------------------

export const purchaseTxAddon = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
  .inputValidator((data: PurchaseTxAddonInput) => PurchaseTxAddonInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId, id: userId } = context.user

    const packages = buildTxAddonPackages()
    const selectedPackage = packages.find(pkg => pkg.id === data.packageId)

    if (!selectedPackage) {
      return { success: false as const, error: `Unknown package: ${data.packageId}` }
    }

    if (!selectedPackage.stripePriceId) {
      return {
        success: false as const,
        error: `Stripe Price ID not configured for package ${data.packageId}. Set STRIPE_TX_ADDON_*_PRICE_ID in your environment.`,
      }
    }

    const { prisma: rootPrisma } = await import('@startpos-core/lib/prisma-client')

    const subscription = await rootPrisma.businessSubscription.findUnique({
      where: { businessId },
      select: { externalId: true, currentPeriodEnd: true },
    })

    if (!subscription?.externalId) {
      return {
        success: false as const,
        error: 'No active billing subscription found. Create a subscription before purchasing add-ons.',
      }
    }

    const adapter = createStripeAdapter()
    const appUrl = process.env['APP_URL'] ?? process.env['VITE_APP_URL'] ?? 'http://localhost:3000'

    const result = await adapter.createCreditPurchaseLink({
      externalCustomerId: subscription.externalId,
      externalPriceId: selectedPackage.stripePriceId,
      creditAmount: selectedPackage.txAmount, // field reused — carries txAmount in metadata
      successUrl: `${appUrl}/billing?addon=tx_success`,
      cancelUrl: `${appUrl}/billing?addon=tx_cancelled`,
      metadata: {
        businessId,
        userId,
        packageId: selectedPackage.id,
        txAmount: String(selectedPackage.txAmount),
        // currentPeriodEnd lets the webhook set expiresAt correctly
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? '',
        source: 'tx_addon_purchase',
      },
    })

    return {
      success: true as const,
      checkoutUrl: result.url,
      sessionId: result.externalSessionId,
    }
  })
