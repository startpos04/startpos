/**
 * purchase-branch-credits.ts
 *
 * Server function: initiate a branch-specific credit package purchase via Stripe.
 *
 * Flow:
 *   1. Branch manager selects a credit package on /billing (branch context).
 *   2. This server function creates a Stripe Checkout Session.
 *   3. The client redirects to the returned URL.
 *   4. On payment success, Stripe sends a `checkout.session.completed` webhook.
 *   5. The webhook handler inserts the CreditLedger PURCHASE entry for this branch.
 *
 * Architecture:
 *   - Only the adapter is imported; never Stripe directly.
 *   - businessId and branchId come from session context — never from client input.
 *   - Credit amount validated against a known set of packages; arbitrary amounts blocked.
 *   - Credits are branch-specific — can only be used at the purchasing branch.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY
 *   STRIPE_BRANCH_CREDIT_10_PRICE_ID  — Stripe Price ID for 10-credit package
 *   STRIPE_BRANCH_CREDIT_50_PRICE_ID  — Stripe Price ID for 50-credit package
 *   STRIPE_BRANCH_CREDIT_100_PRICE_ID — Stripe Price ID for 100-credit package
 *   STRIPE_BRANCH_CREDIT_500_PRICE_ID — Stripe Price ID for 500-credit package
 *   APP_URL (or VITE_APP_URL) — Base URL for success/cancel redirects
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'

// ---------------------------------------------------------------------------
// Branch credit package catalog
// ---------------------------------------------------------------------------

type BranchCreditPackage = {
  id: string
  label: string
  creditAmount: number
  displayPrice: string
  stripePriceId: string
  recommended?: boolean
  savings?: string
}

function buildBranchCreditPackages(): BranchCreditPackage[] {
  return [
    {
      id: 'branch_credits_10',
      label: '10 Credits',
      creditAmount: 10,
      displayPrice: '₱5',
      stripePriceId: process.env['STRIPE_BRANCH_CREDIT_10_PRICE_ID'] ?? '',
    },
    {
      id: 'branch_credits_50',
      label: '50 Credits',
      creditAmount: 50,
      displayPrice: '₱20',
      stripePriceId: process.env['STRIPE_BRANCH_CREDIT_50_PRICE_ID'] ?? '',
      recommended: true,
      savings: '₱10 savings',
    },
    {
      id: 'branch_credits_100',
      label: '100 Credits',
      creditAmount: 100,
      displayPrice: '₱35',
      stripePriceId: process.env['STRIPE_BRANCH_CREDIT_100_PRICE_ID'] ?? '',
      savings: '₱15 savings',
    },
    {
      id: 'branch_credits_500',
      label: '500 Credits',
      creditAmount: 500,
      displayPrice: '₱150',
      stripePriceId: process.env['STRIPE_BRANCH_CREDIT_500_PRICE_ID'] ?? '',
      savings: '₱100 savings',
    },
    {
      id: 'branch_credits_1000',
      label: '1000 Credits',
      creditAmount: 1000,
      displayPrice: '₱250',
      stripePriceId: process.env['STRIPE_BRANCH_CREDIT_1000_PRICE_ID'] ?? '',
      savings: '₱250 savings',
    },
  ]
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const PurchaseBranchCreditsInputSchema = z.object({
  packageId: z.enum(['branch_credits_10', 'branch_credits_50', 'branch_credits_100', 'branch_credits_500', 'branch_credits_1000']),
})

export type PurchaseBranchCreditsInput = z.infer<typeof PurchaseBranchCreditsInputSchema>

// ---------------------------------------------------------------------------
// fetchBranchCreditPackages — returns the catalog without Stripe Price IDs
// ---------------------------------------------------------------------------

export const fetchBranchCreditPackages = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_BILLING)])
  .handler(async () => {
    return buildBranchCreditPackages().map(pkg => ({
      id: pkg.id,
      label: pkg.label,
      creditAmount: pkg.creditAmount,
      displayPrice: pkg.displayPrice,
      recommended: pkg.recommended,
      savings: pkg.savings,
      // stripePriceId intentionally excluded — never expose to client
    }))
  })

export type BranchCreditPackageOption = Awaited<ReturnType<typeof fetchBranchCreditPackages>>[number]

// ---------------------------------------------------------------------------
// purchaseBranchCredits server function
// ---------------------------------------------------------------------------

export const purchaseBranchCredits = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_MANAGE_BILLING), requireTenantContext()])
  .inputValidator((data: PurchaseBranchCreditsInput) => PurchaseBranchCreditsInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId, branchId, id: userId } = getTenantContext(context).user

    const packages = buildBranchCreditPackages()
    const selectedPackage = packages.find(pkg => pkg.id === data.packageId)

    if (!selectedPackage) {
      return { success: false as const, error: `Unknown package: ${data.packageId}` }
    }

    if (!selectedPackage.stripePriceId) {
      return {
        success: false as const,
        error: `Stripe Price ID not configured for package ${data.packageId}. Set STRIPE_BRANCH_CREDIT_*_PRICE_ID in your environment.`,
      }
    }

    const { prisma: rootPrisma } = await import('@platform/lib/prisma-client')

    // Verify branch belongs to this business
    const branch = await rootPrisma.branch.findFirst({
      where: { id: branchId, businessId },
      select: { id: true, name: true },
    })

    if (!branch) {
      return {
        success: false as const,
        error: 'Branch not found or does not belong to this business.',
      }
    }

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
      externalCustomerId: subscription.externalId,
      externalPriceId: selectedPackage.stripePriceId,
      creditAmount: selectedPackage.creditAmount,
      successUrl: `${appUrl}/billing?purchase=success`,
      cancelUrl: `${appUrl}/billing?purchase=cancelled`,
      metadata: {
        businessId,
        branchId,
        userId,
        packageId: selectedPackage.id,
        creditAmount: String(selectedPackage.creditAmount),
        branchName: branch.name,
        source: 'branch_credit_purchase',
      },
    })

    return {
      success: true as const,
      checkoutUrl: result.url,
      sessionId: result.externalSessionId,
    }
  })
