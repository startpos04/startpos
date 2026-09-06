/**
 * reactivate-subscription.ts
 *
 * Server function: reactivate an expired, cancelled, or long-term inactive subscription.
 *
 * This is a specialized wrapper around createSubscription that adds reactivation-specific
 * logic and validation. It ensures that:
 *   1. Only businesses with reactivatable statuses can proceed
 *   2. Previous subscription data is properly cleared/reset
 *   3. Reactivation history is accurately recorded
 *   4. Credit balances are preserved during reactivation
 *
 * Flow:
 *   1. Business with expired/cancelled/inactive subscription visits /subscription/reactivate
 *   2. This server function validates the business can reactivate
 *   3. Clears previous external subscription references if needed
 *   4. Delegates to createSubscription for the actual subscription creation
 *   5. Records reactivation-specific history and metrics
 *
 * Reactivatable statuses (per canReactivate function):
 *   - EXPIRED: Subscription ended but within reactivation window
 *   - CANCELLED: Business cancelled but can resubscribe
 *   - LONG_TERM_INACTIVE: Expired subscription that's been inactive for extended period
 *
 * Non-reactivatable statuses:
 *   - SUSPENDED: Requires admin intervention (contact support)
 *   - ACTIVE/TRIAL/GRACE_PERIOD: Already active, use change-subscription instead
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { SubscriptionStatus } from '@platform/lib/entitlement/entitlement-types'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'
import { type CreateSubscriptionInput, createSubscription } from './create-subscription'

// ---------------------------------------------------------------------------
// Input schema - same as createSubscription but with reactivation context
// ---------------------------------------------------------------------------

const ReactivateSubscriptionInputSchema = z.object({
  /** The planId to reactivate with (Prisma SubscriptionPlan.id) */
  planId: z.string().min(1),
  /** Billing interval — defaults to monthly */
  billingInterval: z.enum(['monthly', 'annual']).default('monthly'),
  /** Billing model override — defaults to MONTHLY_SUBSCRIPTION; use PREPAID_CREDITS for credits plan */
  billingModel: z.enum(['MONTHLY_SUBSCRIPTION', 'YEARLY_SUBSCRIPTION', 'PREPAID_CREDITS']).optional(),
})

export type ReactivateSubscriptionInput = z.infer<typeof ReactivateSubscriptionInputSchema>

// ---------------------------------------------------------------------------
// reactivateSubscription server function
// ---------------------------------------------------------------------------

export const reactivateSubscription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING), requireTenantContext()])
  .inputValidator((data: ReactivateSubscriptionInput) => ReactivateSubscriptionInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId, id: userId } = getTenantContext(context).user

    // ------------------------------------------------------------------
    // 1. Validate current subscription state for reactivation
    // ------------------------------------------------------------------

    const [currentSubscription, business] = await Promise.all([
      rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: {
          id: true,
          status: true,
          externalId: true,
          billingModel: true,
          planId: true,
          cancelledAt: true,
          expiredAt: true,
          suspendedAt: true,
        },
      }),
      rootPrisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true },
      }),
    ])

    if (!currentSubscription) {
      return { success: false as const, error: 'No subscription record found for this business.' }
    }

    if (!business) {
      return { success: false as const, error: 'Business not found.' }
    }

    // Check if the current status can be reactivated using domain logic
    const currentStatus = currentSubscription.status as SubscriptionStatus

    // Import the status validation functions
    const { canReactivate } = await import('../billing/value-objects/subscription-status')

    if (!canReactivate(currentStatus)) {
      // Provide specific error messages for different non-reactivatable statuses
      if (currentStatus === SubscriptionStatus.SUSPENDED) {
        return {
          success: false as const,
          error: 'Your account is currently suspended. Please contact support to resolve this issue before reactivating.',
          contactSupport: true,
        }
      }

      // Check if already active
      if (currentStatus === SubscriptionStatus.ACTIVE || currentStatus === SubscriptionStatus.TRIAL || currentStatus === SubscriptionStatus.GRACE_PERIOD) {
        return {
          success: false as const,
          error: 'Your subscription is already active. Use the billing dashboard to make changes instead.',
          alreadyActive: true,
        }
      }

      return {
        success: false as const,
        error: `Cannot reactivate subscription with current status: ${currentStatus}. Please contact support if you believe this is an error.`,
      }
    }

    // ------------------------------------------------------------------
    // 2. Clean up previous subscription state for reactivation
    // ------------------------------------------------------------------

    const now = new Date()
    const adapter = createStripeAdapter()

    // If there's an old external subscription ID, we should clean it up
    // This can happen if the subscription was cancelled in our system but
    // the Stripe subscription wasn't properly cancelled, or vice versa
    if (currentSubscription.externalId) {
      try {
        // Attempt to cancel the old Stripe subscription if it still exists
        await adapter.cancelSubscription({
          externalSubscriptionId: currentSubscription.externalId,
          cancelImmediately: true,
          reason: 'Cleaning up before reactivation - previous subscription being replaced.',
        })
      } catch (error) {
        // If the subscription doesn't exist in Stripe, that's fine - it was already cancelled
        // We'll clear the externalId below regardless
        console.warn(`Failed to cancel old subscription ${currentSubscription.externalId} during reactivation:`, error)
      }

      // Clear the external ID so createSubscription can create a fresh one
      await rootPrisma.businessSubscription.update({
        where: { id: currentSubscription.id },
        data: {
          externalId: null,
          updatedAt: now,
        },
      })
    }

    // ------------------------------------------------------------------
    // 3. Record reactivation attempt in history before delegation
    // ------------------------------------------------------------------

    await rootPrisma.subscriptionStatusHistory.create({
      data: {
        subscriptionId: currentSubscription.id,
        fromStatus: currentSubscription.status,
        toStatus: null, // Will be filled in by createSubscription
        reason: `Reactivation initiated for plan "${data.planId}". Previous status: ${currentSubscription.status}.`,
        triggeredBy: userId,
      },
    })

    // ------------------------------------------------------------------
    // 4. Delegate to createSubscription for the actual work
    // ------------------------------------------------------------------

    const createSubscriptionData: CreateSubscriptionInput = {
      planId: data.planId,
      billingInterval: data.billingInterval,
      billingModel: data.billingModel,
    }

    const result = await createSubscription({
      data: createSubscriptionData,
      context,
    })

    // ------------------------------------------------------------------
    // 5. Add reactivation-specific response context
    // ------------------------------------------------------------------

    if (!result.success) {
      return result
    }

    // Get previous plan info for messaging
    const previousPlan = currentSubscription.planId
      ? await rootPrisma.subscriptionPlan.findUnique({
          where: { id: currentSubscription.planId },
          select: { name: true },
        })
      : null

    const newPlan = await rootPrisma.subscriptionPlan.findUnique({
      where: { id: data.planId },
      select: { name: true },
    })

    let reactivationMessage = 'Subscription reactivated successfully'
    if (previousPlan && newPlan && previousPlan.name !== newPlan.name) {
      reactivationMessage += ` and upgraded from ${previousPlan.name} to ${newPlan.name}`
    } else if (newPlan) {
      reactivationMessage += ` with ${newPlan.name} plan`
    }

    return {
      ...result,
      reactivated: true,
      previousStatus: currentSubscription.status,
      message: reactivationMessage,
    }
  })
