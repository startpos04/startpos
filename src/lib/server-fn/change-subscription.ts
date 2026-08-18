/**
 * change-subscription.ts
 *
 * Server function: switch an existing active subscription to a different plan,
 * billing interval, or billing model — immediately.
 *
 * Three switching paths:
 *
 * PATH A — Same billing model, different plan or interval
 *   (e.g. Monthly Basic → Monthly Enterprise, Monthly Basic → Annual Basic)
 *   Uses adapter.updateSubscription() to swap the Stripe price inline with
 *   proration_behavior: 'always_invoice'. No cancel+recreate, no redirect.
 *   The prorated difference is charged/credited immediately on the customer's
 *   card on file. DB is updated atomically with the new planId + billingModel.
 *
 * PATH B — Any subscription model → Credits
 *   (MONTHLY_SUBSCRIPTION | YEARLY_SUBSCRIPTION → PREPAID_CREDITS)
 *   Cancels the current Stripe subscription immediately. Clears externalId.
 *   Sets billingModel = PREPAID_CREDITS. Existing credit balance is preserved
 *   as a buffer — the business can continue using credits for transactions.
 *   No new Stripe subscription created.
 *
 * PATH C — Credits → Subscription model
 *   (PREPAID_CREDITS → MONTHLY_SUBSCRIPTION | YEARLY_SUBSCRIPTION)
 *   Creates a new Stripe Checkout Session for the target plan.
 *   Returns a checkoutUrl — the client redirects to Stripe to complete payment.
 *   Credit balance is preserved as a buffer (used for overage TX when
 *   billingModel = HYBRID, or just sits unused until explicitly consumed).
 *   billingModel is updated to HYBRID if credits remain, otherwise to the
 *   target model. The webhook (invoice.paid) finalises the DB update.
 *
 * Addon policy (all paths):
 *   Addons (BusinessSubscriptionAddon) are independent of BusinessSubscription.
 *   They relate to Business via businessId and are NOT cancelled here.
 *   Each addon has its own externalSubscriptionId; the business owner can
 *   manage them through the Stripe portal or the /billing add-ons section.
 *   Addons that are incompatible with the new plan tier continue to bill but
 *   their EntitlementOverride will no longer grant the capability — this is
 *   surfaced in the UI as "addon active but not applicable to current plan".
 *   A future cleanup job can detect and cancel orphaned addons.
 *
 * Pre-validation gate (manual validation required before tests):
 *   PATH A and PATH C involve Stripe network calls. Validate each switching
 *   path in the running app before writing integration tests.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '../better-auth/auth-middleware'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'
import { BillingModel } from '../billing/types'
import { SubscriptionStatus } from '../entitlement/entitlement-types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Price ID resolution — same helper as create-subscription.ts
// ---------------------------------------------------------------------------

function getStripePriceId(planName: string, interval: 'monthly' | 'annual'): string | null {
  const normalised = planName.toUpperCase().replace(/\s+/g, '_')
  const suffix = interval === 'annual' ? '_ANNUAL' : ''
  return process.env[`STRIPE_PLAN_${normalised}${suffix}_PRICE_ID`] ?? null
}

// ---------------------------------------------------------------------------
// Derived billing model helper
// When switching from PREPAID_CREDITS to a subscription and the business
// still has a credit balance, we use HYBRID so credits act as a buffer.
// ---------------------------------------------------------------------------

function resolveTargetBillingModel(
  requestedModel: 'MONTHLY_SUBSCRIPTION' | 'YEARLY_SUBSCRIPTION',
  currentBillingModel: string | null,
  creditBalance: number | null,
): 'MONTHLY_SUBSCRIPTION' | 'YEARLY_SUBSCRIPTION' | 'HYBRID' {
  const hasCredits = creditBalance !== null && creditBalance > 0
  const comingFromCredits = currentBillingModel === BillingModel.PREPAID_CREDITS
  if (comingFromCredits && hasCredits) return 'HYBRID'
  return requestedModel
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const ChangeSubscriptionInputSchema = z.object({
  /** Target plan (Prisma SubscriptionPlan.id) */
  planId: z.string().min(1),
  /**
   * Target billing model.
   * PREPAID_CREDITS = switch to credits-only (PATH B).
   * MONTHLY_SUBSCRIPTION / YEARLY_SUBSCRIPTION = subscription (PATH A or C).
   */
  billingModel: z.enum(['MONTHLY_SUBSCRIPTION', 'YEARLY_SUBSCRIPTION', 'PREPAID_CREDITS']),
  /** Billing interval — only relevant for subscription models */
  billingInterval: z.enum(['monthly', 'annual']).default('monthly'),
})

export type ChangeSubscriptionInput = z.infer<typeof ChangeSubscriptionInputSchema>

// ---------------------------------------------------------------------------
// changeSubscription server function
// ---------------------------------------------------------------------------

export const changeSubscription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: ChangeSubscriptionInput) => ChangeSubscriptionInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context.' }
    }

    const { businessId, id: userId } = context.user

    // ------------------------------------------------------------------
    // 1. Load current state
    // ------------------------------------------------------------------

    const [currentSub, targetPlan, business, latestCredit] = await Promise.all([
      rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: {
          id: true,
          status: true,
          billingModel: true,
          externalId: true,
          planId: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
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
      // Check credit balance for HYBRID model decision
      rootPrisma.creditLedger.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      }),
    ])

    if (!currentSub) return { success: false as const, error: 'No subscription found for this business.' }
    if (!targetPlan?.isActive) return { success: false as const, error: 'The selected plan is not available.' }
    if (!business) return { success: false as const, error: 'Business not found.' }

    // Only allow changes when subscription is in an active-ish state
    const changeableStatuses: string[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL, SubscriptionStatus.GRACE_PERIOD]
    if (!changeableStatuses.includes(currentSub.status)) {
      return {
        success: false as const,
        error: `Cannot change subscription from status "${currentSub.status}". Use reactivate instead.`,
      }
    }

    const creditBalance = latestCredit?.balanceAfter ?? null
    const now = new Date()
    const adapter = createStripeAdapter()
    const appUrl = process.env['CANONICAL_URL'] ?? process.env['APP_URL'] ?? 'http://localhost:3000'

    // ------------------------------------------------------------------
    // PATH B — Any subscription → PREPAID_CREDITS
    // Cancel Stripe sub immediately; preserve credit balance as buffer.
    // ------------------------------------------------------------------

    if (data.billingModel === BillingModel.PREPAID_CREDITS) {
      // Cancel with Stripe if we have an active external subscription
      if (currentSub.externalId) {
        try {
          await adapter.cancelSubscription({
            externalSubscriptionId: currentSub.externalId,
            cancelImmediately: true,
            reason: 'Business switched billing model to prepaid credits.',
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { success: false as const, error: `Stripe cancellation failed: ${msg}` }
        }
      }

      await rootPrisma.$transaction([
        rootPrisma.businessSubscription.update({
          where: { id: currentSub.id },
          data: {
            planId: data.planId,
            billingModel: 'PREPAID_CREDITS',
            status: SubscriptionStatus.ACTIVE,
            // Clear Stripe subscription reference — credits are one-time purchases
            externalId: null,
            cancelledAt: null,
            cancelReason: null,
            currentPeriodStart: now,
            currentPeriodEnd: null,
            activatedAt: now,
            updatedAt: now,
          },
        }),
        rootPrisma.subscriptionStatusHistory.create({
          data: {
            subscriptionId: currentSub.id,
            fromStatus: currentSub.status,
            toStatus: SubscriptionStatus.ACTIVE,
            reason: `Billing model changed to PREPAID_CREDITS. Plan: "${targetPlan.name}". Credit balance preserved as buffer.`,
            triggeredBy: userId,
          },
        }),
      ])

      return {
        success: true as const,
        path: 'credits' as const,
        checkoutUrl: null,
        creditBalance,
        message: 'Switched to prepaid credits. Your existing credit balance is preserved.',
      }
    }

    // ------------------------------------------------------------------
    // PATH C — PREPAID_CREDITS → Subscription
    // Create a new Stripe checkout session. Credit balance becomes a buffer.
    // ------------------------------------------------------------------

    const isFromCredits = currentSub.billingModel === BillingModel.PREPAID_CREDITS

    if (isFromCredits) {
      const priceId = getStripePriceId(targetPlan.name, data.billingInterval)
      if (!priceId) {
        return {
          success: false as const,
          error: `Stripe Price ID not configured for plan "${targetPlan.name}" (${data.billingInterval}). Set STRIPE_PLAN_${targetPlan.name.toUpperCase().replace(/\s+/g, '_')}${data.billingInterval === 'annual' ? '_ANNUAL' : ''}_PRICE_ID.`,
        }
      }

      const userEmail = context.user.email ?? `billing+${businessId}@startpos.app`
      const customer = await adapter.createCustomer({ businessId, businessName: business.name, email: userEmail })

      const resolvedModel = resolveTargetBillingModel(
        data.billingInterval === 'annual' ? 'YEARLY_SUBSCRIPTION' : 'MONTHLY_SUBSCRIPTION',
        currentSub.billingModel,
        creditBalance,
      )

      const successUrl = `${appUrl}/billing/success?plan=${encodeURIComponent(targetPlan.name)}&billing=${data.billingInterval}`

      const providerResult = await adapter.createSubscription({
        externalCustomerId: customer.externalCustomerId,
        externalPriceId: priceId,
        metadata: { businessId, planId: data.planId, userId, switchedFromCredits: 'true' },
        successUrl,
        cancelUrl: `${appUrl}/billing/plans`,
      })

      // Update DB to reflect the pending switch — status GRACE_PERIOD until
      // invoice.paid webhook promotes to ACTIVE. billingModel updated now so
      // the session reflects HYBRID if credits remain.
      await rootPrisma.$transaction([
        rootPrisma.businessSubscription.update({
          where: { id: currentSub.id },
          data: {
            planId: data.planId,
            billingModel: resolvedModel,
            status: SubscriptionStatus.GRACE_PERIOD,
            updatedAt: now,
          },
        }),
        rootPrisma.subscriptionStatusHistory.create({
          data: {
            subscriptionId: currentSub.id,
            fromStatus: currentSub.status,
            toStatus: SubscriptionStatus.GRACE_PERIOD,
            reason: `Billing model switch from PREPAID_CREDITS to ${resolvedModel}. Plan: "${targetPlan.name}". Awaiting payment. Credit balance preserved as buffer.`,
            triggeredBy: userId,
          },
        }),
      ])

      return {
        success: true as const,
        path: 'credits_to_subscription' as const,
        checkoutUrl: providerResult.checkoutUrl,
        creditBalance,
        message:
          creditBalance && creditBalance > 0
            ? `Redirecting to payment. Your ${creditBalance} credit${creditBalance === 1 ? '' : 's'} will remain as a buffer.`
            : 'Redirecting to payment.',
      }
    }

    // ------------------------------------------------------------------
    // PATH A — Subscription → Subscription (plan or interval change)
    // Use updateSubscription (inline price swap) if externalId exists.
    // If no externalId (e.g. checkout was abandoned), fall back to a new
    // checkout session identical to create-subscription flow.
    // ------------------------------------------------------------------

    const priceId = getStripePriceId(targetPlan.name, data.billingInterval)
    if (!priceId) {
      return {
        success: false as const,
        error: `Stripe Price ID not configured for plan "${targetPlan.name}" (${data.billingInterval}). Set STRIPE_PLAN_${targetPlan.name.toUpperCase().replace(/\s+/g, '_')}${data.billingInterval === 'annual' ? '_ANNUAL' : ''}_PRICE_ID.`,
      }
    }

    const resolvedModel = data.billingInterval === 'annual' ? 'YEARLY_SUBSCRIPTION' : 'MONTHLY_SUBSCRIPTION'

    if (currentSub.externalId) {
      // Inline update via Stripe subscriptions.update (proration invoiced immediately)
      let updateResult: { checkoutUrl: string | null; currentPeriodStart: Date; currentPeriodEnd: Date }
      try {
        updateResult = await adapter.updateSubscription({
          externalSubscriptionId: currentSub.externalId,
          externalPriceId: priceId,
          metadata: { businessId, planId: data.planId, userId },
          successUrl: `${appUrl}/billing/success?plan=${encodeURIComponent(targetPlan.name)}&billing=${data.billingInterval}`,
          cancelUrl: `${appUrl}/billing/plans`,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false as const, error: `Stripe subscription update failed: ${msg}` }
      }

      await rootPrisma.$transaction([
        rootPrisma.businessSubscription.update({
          where: { id: currentSub.id },
          data: {
            planId: data.planId,
            billingModel: resolvedModel,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: updateResult.currentPeriodStart,
            currentPeriodEnd: updateResult.currentPeriodEnd,
            updatedAt: now,
          },
        }),
        rootPrisma.subscriptionStatusHistory.create({
          data: {
            subscriptionId: currentSub.id,
            fromStatus: currentSub.status,
            toStatus: SubscriptionStatus.ACTIVE,
            reason: `Plan changed to "${targetPlan.name}" (${resolvedModel}) via inline Stripe subscription update. Prorated difference invoiced immediately.`,
            triggeredBy: userId,
          },
        }),
      ])

      return {
        success: true as const,
        path: 'inline_update' as const,
        checkoutUrl: updateResult.checkoutUrl,
        message: `Switched to ${targetPlan.name} (${data.billingInterval}). Prorated difference will appear on your next invoice.`,
      }
    }

    // Fallback: no externalId (checkout was never completed) — treat as a new checkout
    const userEmail = context.user.email ?? `billing+${businessId}@startpos.app`
    const customer = await adapter.createCustomer({ businessId, businessName: business.name, email: userEmail })

    const successUrl = `${appUrl}/billing/success?plan=${encodeURIComponent(targetPlan.name)}&billing=${data.billingInterval}`

    const providerResult = await adapter.createSubscription({
      externalCustomerId: customer.externalCustomerId,
      externalPriceId: priceId,
      metadata: { businessId, planId: data.planId, userId },
      successUrl,
      cancelUrl: `${appUrl}/billing/plans`,
    })

    await rootPrisma.$transaction([
      rootPrisma.businessSubscription.update({
        where: { id: currentSub.id },
        data: {
          planId: data.planId,
          billingModel: resolvedModel,
          status: SubscriptionStatus.GRACE_PERIOD,
          updatedAt: now,
        },
      }),
      rootPrisma.subscriptionStatusHistory.create({
        data: {
          subscriptionId: currentSub.id,
          fromStatus: currentSub.status,
          toStatus: SubscriptionStatus.GRACE_PERIOD,
          reason: `Plan change to "${targetPlan.name}" (${resolvedModel}) via new checkout (no prior externalId). Awaiting payment.`,
          triggeredBy: userId,
        },
      }),
    ])

    return {
      success: true as const,
      path: 'new_checkout' as const,
      checkoutUrl: providerResult.checkoutUrl,
      message: 'Redirecting to payment to complete the plan change.',
    }
  })
