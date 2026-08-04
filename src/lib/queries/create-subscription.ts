/**
 * create-subscription.ts
 *
 * Server function: create or activate a paid subscription for a business.
 *
 * Flow:
 *   1. Business admin selects a plan on /billing or /subscription/reactivate.
 *   2. This server function creates a Stripe subscription via the adapter.
 *   3. BusinessSubscription.externalId is updated atomically with the status change.
 *   4. A SubscriptionStatusHistory record is written.
 *   5. If a checkoutUrl is returned (incomplete subscription), the client
 *      redirects to Stripe to complete payment setup.
 *
 * Idempotency:
 *   - If BusinessSubscription.externalId already exists, this function is a
 *     no-op — the subscription was already created by a prior call.
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY              — Stripe secret key
 *   STRIPE_PLAN_STARTER_PRICE_ID   — Stripe Price ID for the Starter plan
 *   STRIPE_PLAN_PRO_PRICE_ID       — Stripe Price ID for the Professional plan
 *   STRIPE_PLAN_ENTERPRISE_PRICE_ID— Stripe Price ID for the Enterprise plan
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '../better-auth/auth-middleware'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'
import { SubscriptionEngine } from '../billing/subscription-engine'
import { SubscriptionStatus } from '../entitlement/entitlement-types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Plan → Stripe Price ID mapping
// Loaded from environment variables — no hardcoded price IDs in source code.
// ---------------------------------------------------------------------------

function getStripePriceId(planName: string, interval: 'monthly' | 'annual' | 'credits' = 'monthly'): string | null {
  const normalised = planName.toLowerCase().replace(/\s+/g, '_')
  const suffix = interval === 'annual' ? '_ANNUAL' : interval === 'credits' ? '_CREDITS' : ''
  const envKey = `STRIPE_PLAN_${normalised.toUpperCase()}${suffix}_PRICE_ID`
  // Fall back to monthly price if credits-specific price not set
  const specific = process.env[envKey] ?? null
  if (!specific && interval === 'credits') {
    return process.env[`STRIPE_PLAN_${normalised.toUpperCase()}_PRICE_ID`] ?? null
  }
  return specific
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CreateSubscriptionInputSchema = z.object({
  /** The planId to subscribe to (Prisma SubscriptionPlan.id) */
  planId: z.string().min(1),
  /** Billing interval — defaults to monthly */
  billingInterval: z.enum(['monthly', 'annual']).default('monthly'),
  /** Billing model override — defaults to MONTHLY_SUBSCRIPTION; use PREPAID_CREDITS for credits plan */
  billingModel: z.enum(['MONTHLY_SUBSCRIPTION', 'YEARLY_SUBSCRIPTION', 'PREPAID_CREDITS']).optional(),
})

export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionInputSchema>

// ---------------------------------------------------------------------------
// createSubscription server function
// ---------------------------------------------------------------------------

export const createSubscription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: CreateSubscriptionInput) => CreateSubscriptionInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId, id: userId } = context.user

    // Fetch current subscription and target plan in parallel
    const [existingSubscription, targetPlan, business] = await Promise.all([
      rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: {
          id: true,
          status: true,
          externalId: true,
          billingModel: true,
        },
      }),
      rootPrisma.subscriptionPlan.findUnique({
        where: { id: data.planId },
        select: { id: true, name: true, isActive: true },
      }),
      rootPrisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true },
      }),
    ])

    if (!existingSubscription) {
      return { success: false as const, error: 'No subscription record found for this business.' }
    }

    if (!targetPlan?.isActive) {
      return { success: false as const, error: 'The selected plan is not available.' }
    }

    if (!business) {
      return { success: false as const, error: 'Business not found.' }
    }

    // Idempotency: if externalId already exists, a provider subscription is already live.
    // Return success — the subscription is already created.
    if (existingSubscription.externalId) {
      return {
        success: true as const,
        alreadyActive: true,
        checkoutUrl: null,
        message: 'Subscription is already active with the billing provider.',
      }
    }

    // Resolve the Stripe Price ID for this plan
    const priceInterval = data.billingModel === 'PREPAID_CREDITS' ? 'credits' : data.billingInterval
    const stripePriceId = getStripePriceId(targetPlan.name, priceInterval)
    if (!stripePriceId) {
      return {
        success: false as const,
        error: `Stripe Price ID not configured for plan "${targetPlan.name}" (${priceInterval}). Set STRIPE_PLAN_${targetPlan.name.toUpperCase().replace(/\s+/g, '_')}${priceInterval === 'annual' ? '_ANNUAL' : priceInterval === 'credits' ? '_CREDITS' : ''}_PRICE_ID.`,
      }
    }

    const adapter = createStripeAdapter()

    // Create a Stripe customer for this business (required before creating subscription)
    const userEmail = context.user.email ?? `billing+${businessId}@startpos.app`
    const customer = await adapter.createCustomer({
      businessId,
      businessName: business.name,
      email: userEmail,
    })

    const appUrl = process.env['CANONICAL_URL'] ?? process.env['APP_URL'] ?? 'http://localhost:3000'

    // Create the Stripe Checkout Session for the subscription.
    // Stripe will redirect to successUrl after the user completes payment,
    // and the webhooks (invoice.paid, customer.subscription.updated) will
    // update the DB. The plan name is encoded in successUrl so the success
    // page can display it without needing extra state.
    const successUrl =
      data.billingModel === 'PREPAID_CREDITS'
        ? `${appUrl}/billing/credits?subscribed=1`
        : `${appUrl}/billing/success?plan=${encodeURIComponent(targetPlan.name)}&billing=${data.billingInterval}`

    const providerResult = await adapter.createSubscription({
      externalCustomerId: customer.externalCustomerId,
      externalPriceId: stripePriceId,
      metadata: {
        businessId,
        planId: data.planId,
        userId,
      },
      successUrl,
      cancelUrl: `${appUrl}/billing/plans`,
    })

    // Determine the target status:
    // With hosted checkout, the subscription isn't created until payment succeeds.
    // Status stays as GRACE_PERIOD until the invoice.paid webhook fires.
    // If checkoutUrl is null (e.g. free plan, no payment needed), activate immediately.
    const toStatus = providerResult.checkoutUrl
      ? SubscriptionStatus.GRACE_PERIOD // Awaiting payment — webhook will promote to ACTIVE
      : SubscriptionStatus.ACTIVE

    // Validate the transition
    const canTransition = SubscriptionEngine.canTransition(
      existingSubscription.status as (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus],
      toStatus,
    )
    if (!canTransition.ok) {
      return { success: false as const, error: canTransition.reason }
    }

    // Atomically update the subscription record and write a history entry.
    // externalId is intentionally NOT set here for hosted checkout flows —
    // the real Stripe subscription ID arrives via the customer.subscription.updated
    // webhook after payment, which writes externalId at that point.
    const now = new Date()
    // Resolve billing model: use explicit override if provided, else map from interval
    const resolvedBillingModel = data.billingModel ?? (data.billingInterval === 'annual' ? 'YEARLY_SUBSCRIPTION' : 'MONTHLY_SUBSCRIPTION')

    await rootPrisma.$transaction([
      rootPrisma.businessSubscription.update({
        where: { id: existingSubscription.id },
        data: {
          planId: data.planId,
          billingModel: resolvedBillingModel as import('prisma/generated/prisma/enums').BillingModel,
          status: toStatus,
          ...(toStatus === SubscriptionStatus.ACTIVE
            ? {
                externalId: providerResult.externalSubscriptionId,
                currentPeriodStart: providerResult.currentPeriodStart,
                currentPeriodEnd: providerResult.currentPeriodEnd,
                activatedAt: now,
              }
            : {}),
          updatedAt: now,
        },
      }),
      rootPrisma.subscriptionStatusHistory.create({
        data: {
          subscriptionId: existingSubscription.id,
          fromStatus: existingSubscription.status,
          toStatus,
          reason: `Subscription checkout initiated for plan "${targetPlan.name}". Awaiting payment confirmation.`,
          triggeredBy: userId,
        },
      }),
    ])

    return {
      success: true as const,
      alreadyActive: false,
      checkoutUrl: providerResult.checkoutUrl,
      externalSubscriptionId: providerResult.externalSubscriptionId,
    }
  })
