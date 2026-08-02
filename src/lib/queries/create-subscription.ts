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

function getStripePriceId(planName: string): string | null {
  const normalised = planName.toLowerCase().replace(/\s+/g, '_')
  const envKey = `STRIPE_PLAN_${normalised.toUpperCase()}_PRICE_ID`
  return process.env[envKey] ?? null
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CreateSubscriptionInputSchema = z.object({
  /** The planId to subscribe to (Prisma SubscriptionPlan.id) */
  planId: z.string().min(1),
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
    const stripePriceId = getStripePriceId(targetPlan.name)
    if (!stripePriceId) {
      return {
        success: false as const,
        error: `Stripe Price ID not configured for plan "${targetPlan.name}". Set STRIPE_PLAN_${targetPlan.name.toUpperCase().replace(/\s+/g, '_')}_PRICE_ID.`,
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

    // Create the Stripe subscription
    const providerResult = await adapter.createSubscription({
      externalCustomerId: customer.externalCustomerId,
      externalPriceId: stripePriceId,
      metadata: {
        businessId,
        planId: data.planId,
        userId,
      },
    })

    // Determine the target status:
    // If checkoutUrl is null → subscription is active immediately (e.g. trial or auto-collect)
    // If checkoutUrl is present → subscription is incomplete, waiting for payment confirmation
    const toStatus = providerResult.checkoutUrl
      ? SubscriptionStatus.GRACE_PERIOD // Incomplete — not yet ACTIVE
      : SubscriptionStatus.ACTIVE

    // Validate the transition
    const canTransition = SubscriptionEngine.canTransition(
      existingSubscription.status as (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus],
      toStatus,
    )
    if (!canTransition.ok) {
      // Roll back by cancelling the just-created provider subscription immediately
      try {
        await adapter.cancelSubscription({
          externalSubscriptionId: providerResult.externalSubscriptionId,
          cancelImmediately: true,
          reason: 'Subscription state machine rejected the transition during creation.',
        })
      } catch (_cancelErr) {
        // Best-effort rollback — log but don't throw
        console.error('[createSubscription] Provider subscription rollback failed', _cancelErr)
      }
      return { success: false as const, error: canTransition.reason }
    }

    // Atomically update the subscription record and write a history entry
    const now = new Date()
    await rootPrisma.$transaction([
      rootPrisma.businessSubscription.update({
        where: { id: existingSubscription.id },
        data: {
          planId: data.planId,
          status: toStatus,
          externalId: providerResult.externalSubscriptionId,
          currentPeriodStart: providerResult.currentPeriodStart,
          currentPeriodEnd: providerResult.currentPeriodEnd,
          ...(toStatus === SubscriptionStatus.ACTIVE ? { activatedAt: now } : {}),
          updatedAt: now,
        },
      }),
      rootPrisma.subscriptionStatusHistory.create({
        data: {
          subscriptionId: existingSubscription.id,
          fromStatus: existingSubscription.status,
          toStatus,
          reason: `Subscription created with plan "${targetPlan.name}" via billing provider.`,
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
