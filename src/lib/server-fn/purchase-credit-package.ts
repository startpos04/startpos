/**
 * purchase-credit-package.ts
 *
 * Server function: initiate a credit package purchase via the billing provider.
 *
 * Flow:
 *   1. Business admin selects a credit package on /billing/credits.
 *   2. This server function creates a Stripe Checkout Session.
 *   3. The client redirects to the returned URL.
 *   4. On payment success, Stripe sends a `checkout.session.completed` webhook.
 *   5. The webhook handler inserts the CreditLedger PURCHASE entry.
 *
 * Architecture:
 *   - Only the adapter is imported from the adapter directory; never Stripe directly.
 *   - businessId comes from session context — never from client input.
 *   - The credit amount is validated against a known set of packages; clients
 *     cannot request arbitrary amounts.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY         — Stripe secret key
 *   STRIPE_CREDIT_PKG_10_PRICE_ID  — Stripe Price ID for 10-credit package
 *   STRIPE_CREDIT_PKG_50_PRICE_ID  — Stripe Price ID for 50-credit package
 *   STRIPE_CREDIT_PKG_100_PRICE_ID — Stripe Price ID for 100-credit package
 *   NEXT_PUBLIC_APP_URL (or APP_URL) — Base URL for success/cancel redirects
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'
import type { CreditPackage } from '../billing/types'

// ---------------------------------------------------------------------------
// Credit package catalog
// Configured from environment variables so prices can be updated without
// a code deployment.
// ---------------------------------------------------------------------------

function buildCreditPackages(): CreditPackage[] {
  return [
    {
      id: 'credits_10',
      label: '10 Credits',
      creditAmount: 10,
      displayPrice: '₱50',
      stripePriceId: process.env['STRIPE_CREDIT_PKG_10_PRICE_ID'] ?? '',
    },
    {
      id: 'credits_50',
      label: '50 Credits',
      creditAmount: 50,
      displayPrice: '₱220',
      stripePriceId: process.env['STRIPE_CREDIT_PKG_50_PRICE_ID'] ?? '',
    },
    {
      id: 'credits_100',
      label: '100 Credits',
      creditAmount: 100,
      displayPrice: '₱400',
      stripePriceId: process.env['STRIPE_CREDIT_PKG_100_PRICE_ID'] ?? '',
    },
  ]
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const PurchaseCreditPackageInputSchema = z.object({
  /** The package ID from the catalog above (credits_10 | credits_50 | credits_100) */
  packageId: z.enum(['credits_10', 'credits_50', 'credits_100']),
})

export type PurchaseCreditPackageInput = z.infer<typeof PurchaseCreditPackageInputSchema>

/**
 * fetchCreditPackages
 * Returns the current credit package catalog so the UI can render options
 * without hardcoding amounts or prices.
 */
export const fetchCreditPackages = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .handler(async () => {
    return buildCreditPackages().map(pkg => ({
      id: pkg.id,
      label: pkg.label,
      creditAmount: pkg.creditAmount,
      displayPrice: pkg.displayPrice,
      // Never expose Stripe Price IDs to the client
    }))
  })

export type CreditPackageOption = Awaited<ReturnType<typeof fetchCreditPackages>>[number]

// ---------------------------------------------------------------------------
// purchaseCreditPackage server function
// ---------------------------------------------------------------------------

export const purchaseCreditPackage = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
  .inputValidator((data: PurchaseCreditPackageInput) => PurchaseCreditPackageInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId, id: userId } = context.user

    const packages = buildCreditPackages()
    const selectedPackage = packages.find(pkg => pkg.id === data.packageId)

    if (!selectedPackage) {
      return { success: false as const, error: `Unknown package: ${data.packageId}` }
    }

    if (!selectedPackage.stripePriceId) {
      return {
        success: false as const,
        error: `Stripe Price ID not configured for package ${data.packageId}. Set the STRIPE_CREDIT_PKG_*_PRICE_ID environment variable.`,
      }
    }

    const { prisma: rootPrisma } = await import('../prisma-client')

    const subscription = await rootPrisma.businessSubscription.findUnique({
      where: { businessId },
      select: { externalId: true },
    })

    if (!subscription?.externalId) {
      return {
        success: false as const,
        error: 'No active billing subscription found. Create a subscription before purchasing credits.',
      }
    }

    const adapter = createStripeAdapter()

    const appUrl = process.env['APP_URL'] ?? process.env['VITE_APP_URL'] ?? 'http://localhost:3000'

    const result = await adapter.createCreditPurchaseLink({
      externalCustomerId: subscription.externalId, // Stripe subscription ID used as placeholder
      externalPriceId: selectedPackage.stripePriceId,
      creditAmount: selectedPackage.creditAmount,
      successUrl: `${appUrl}/billing/credits?purchase=success`,
      cancelUrl: `${appUrl}/billing/credits?purchase=cancelled`,
      metadata: {
        businessId,
        userId,
        packageId: selectedPackage.id,
        creditAmount: String(selectedPackage.creditAmount),
        source: 'credit_purchase',
      },
    })

    return {
      success: true as const,
      checkoutUrl: result.url,
      sessionId: result.externalSessionId,
    }
  })
