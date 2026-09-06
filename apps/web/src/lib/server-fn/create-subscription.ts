/**
 * create-subscription.ts
 *
 * Server function: create or activate a paid subscription for a business.
 *
 * Flow:
 *   1. Business admin selects a plan and payment provider on /billing or /subscription/reactivate.
 *   2. This server function creates a subscription via the selected provider adapter.
 *   3. BusinessSubscription.externalId is updated atomically with the status change.
 *   4. A SubscriptionStatusHistory record is written.
 *   5. If a checkoutUrl is returned (incomplete subscription), the client
 *      redirects to the provider to complete payment setup.
 *
 * Idempotency:
 *   - If BusinessSubscription.externalId already exists, this function is a
 *     no-op — the subscription was already created by a prior call.
 *
 * Architecture:
 *   - Uses PaymentProviderService for provider selection and routing
 *   - Provider-agnostic implementation using BillingProviderAdapter interface
 *   - Supports multiple payment providers through provider registry
 */

import { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { getBillingAdapter } from '../billing/get-billing-adapter'
// import { paymentProviderService } from '../billing/payment-provider-service'
import { SubscriptionEngine } from '../billing/subscription-engine'

// ---------------------------------------------------------------------------
// Provider-agnostic price ID resolution
// ---------------------------------------------------------------------------

function getProviderPriceId(providerId: string, planName: string, interval: 'monthly' | 'annual' | 'credits' = 'monthly'): string | null {
  const normalised = planName.toLowerCase().replace(/\s+/g, '_')

  if (providerId === 'stripe') {
    const suffix = interval === 'annual' ? '_ANNUAL' : interval === 'credits' ? '_CREDITS' : ''
    const envKey = `STRIPE_PLAN_${normalised.toUpperCase()}${suffix}_PRICE_ID`
    // Fall back to monthly price if credits-specific price not set
    const specific = process.env[envKey] ?? null
    if (!specific && interval === 'credits') {
      return process.env[`STRIPE_PLAN_${normalised.toUpperCase()}_PRICE_ID`] ?? null
    }
    return specific
  }

  if (providerId === 'manual') {
    // Manual payments don't use external price IDs
    return 'manual-plan'
  }

  // Future providers can be added here
  return null
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CreateSubscriptionInputSchema = z.object({
  /** The planId to subscribe to (Prisma SubscriptionPlan.id) */
  planId: z.string().min(1),
  /** Payment provider ID to use for this subscription */
  providerId: z.string().min(1).default('stripe'),
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
  .middleware([authMiddleware, requireTenantContext()])
  .inputValidator((data: CreateSubscriptionInput) => CreateSubscriptionInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId, id: userId } = getTenantContext(context).user

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

    // Get the appropriate provider adapter for this business
    const adapter = await getBillingAdapter(businessId, data.providerId)
    if (!adapter) {
      return {
        success: false as const,
        error: `Payment provider "${data.providerId}" is not available for this business.`,
      }
    }

    // Resolve the price ID for this plan and provider
    // NOTE: For Stripe with dynamic pricing, we skip Price ID requirement
    // The actual price creation happens in the Stripe adapter dynamically
    const priceInterval = data.billingModel === 'PREPAID_CREDITS' ? 'credits' : data.billingInterval
    const providerPriceId = getProviderPriceId(data.providerId, targetPlan.name, priceInterval)

    // Skip Price ID check for Stripe when using embedded payment form
    // Dynamic pricing is handled by StripePaymentForm component
    if (!providerPriceId && data.providerId !== 'stripe') {
      return {
        success: false as const,
        error: `Price ID not configured for plan "${targetPlan.name}" on provider "${data.providerId}" (${priceInterval}).`,
      }
    }

    // Use a placeholder for Stripe dynamic pricing
    const effectivePriceId = providerPriceId || 'dynamic-pricing'

    // Create a Stripe customer for this business (required before creating subscription)
    const userEmail = getTenantContext(context).user.email ?? `billing+${businessId}@startpos.app`
    const customer = await adapter.createCustomer({
      businessId,
      businessName: business.name,
      email: userEmail,
    })

    const appUrl = process.env['CANONICAL_URL'] ?? process.env['APP_URL'] ?? 'http://localhost:3000'

    // Create the provider subscription
    // For hosted checkout providers, the user will be redirected to complete payment.
    // For manual providers, the payment will be pending admin approval.
    const successUrl =
      data.billingModel === 'PREPAID_CREDITS'
        ? `${appUrl}/billing/credits?subscribed=1`
        : `${appUrl}/billing/success?plan=${encodeURIComponent(targetPlan.name)}&billing=${data.billingInterval}&provider=${data.providerId}`

    const providerResult = await adapter.createSubscription({
      externalCustomerId: customer.externalCustomerId,
      externalPriceId: effectivePriceId,
      metadata: {
        businessId,
        planId: data.planId,
        userId,
        providerId: data.providerId,
      },
      successUrl,
      cancelUrl: `${appUrl}/billing/plans`,
    })

    // Determine the target status based on provider capabilities:
    // - Providers with automatic confirmation: ACTIVE (if no checkout URL) or GRACE_PERIOD (if checkout needed)
    // - Providers requiring manual review: PENDING (awaiting admin approval)
    const providerCapabilities = adapter.getCapabilities()
    const toStatus = providerResult.checkoutUrl
      ? SubscriptionStatus.GRACE_PERIOD // Awaiting payment completion
      : providerCapabilities.supportsManualReview && !providerCapabilities.supportsAutomaticConfirmation
        ? SubscriptionStatus.PENDING // Awaiting admin approval (manual providers)
        : SubscriptionStatus.ACTIVE // Immediate activation

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
      // Update business preferred payment provider
      rootPrisma.business.update({
        where: { id: businessId },
        data: {
          preferredPaymentProvider: data.providerId as import('prisma/generated/prisma/enums').PaymentProvider,
          updatedAt: now,
        },
      }),
      rootPrisma.subscriptionStatusHistory.create({
        data: {
          subscriptionId: existingSubscription.id,
          fromStatus: existingSubscription.status,
          toStatus,
          reason:
            toStatus === SubscriptionStatus.PENDING
              ? `Manual payment submitted for plan "${targetPlan.name}". Awaiting admin approval.`
              : `Subscription checkout initiated for plan "${targetPlan.name}" via ${data.providerId}. ${providerResult.checkoutUrl ? 'Awaiting payment confirmation.' : 'Activated immediately.'}`,
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
