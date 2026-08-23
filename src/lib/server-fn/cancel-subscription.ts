/**
 * cancel-subscription.ts
 *
 * Server function: cancel a business's active subscription.
 *
 * Flow:
 *   1. Business admin requests cancellation from /billing.
 *   2. This function validates the transition (ACTIVE/GRACE_PERIOD → CANCELLED).
 *   3. Cancellation is sent to the billing provider via the adapter.
 *   4. BusinessSubscription status is updated to CANCELLED atomically with a
 *      SubscriptionStatusHistory record.
 *
 * Cancellation modes:
 *   - immediate = true:  access revoked immediately; provider subscription cancelled now.
 *   - immediate = false: access continues until currentPeriodEnd; provider cancels at period end.
 *
 * Idempotency:
 *   - If status is already CANCELLED, return success (no-op).
 *   - If externalId is null (no provider subscription), perform a local-only cancellation.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { createStripeAdapter } from '../billing/adapters/stripe-adapter'
import { SubscriptionEngine } from '../billing/subscription-engine'
import { SubscriptionStatus } from '../entitlement/entitlement-types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CancelSubscriptionInputSchema = z.object({
  /** true = cancel immediately; false = cancel at current period end */
  immediate: z.boolean().default(false),
  /** Optional free-text reason recorded in SubscriptionStatusHistory */
  reason: z.string().max(500).optional(),
})

export type CancelSubscriptionInput = z.infer<typeof CancelSubscriptionInputSchema>

// ---------------------------------------------------------------------------
// cancelSubscription server function
// ---------------------------------------------------------------------------

export const cancelSubscription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
  .inputValidator((data: CancelSubscriptionInput) => CancelSubscriptionInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId, id: userId } = context.user

    const subscription = await rootPrisma.businessSubscription.findUnique({
      where: { businessId },
      select: {
        id: true,
        status: true,
        externalId: true,
        currentPeriodEnd: true,
      },
    })

    if (!subscription) {
      return { success: false as const, error: 'No subscription found for this business.' }
    }

    // Idempotency: already cancelled
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      return { success: true as const, alreadyCancelled: true }
    }

    // Validate state machine transition
    const canTransition = SubscriptionEngine.canTransition(
      subscription.status as (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus],
      SubscriptionStatus.CANCELLED,
    )
    if (!canTransition.ok) {
      return { success: false as const, error: canTransition.reason }
    }

    const now = new Date()
    const reason = data.reason ?? 'Business-initiated cancellation.'
    let cancelledAt = now

    // Cancel with the billing provider if a provider subscription exists
    if (subscription.externalId) {
      try {
        const adapter = createStripeAdapter()
        const result = await adapter.cancelSubscription({
          externalSubscriptionId: subscription.externalId,
          cancelImmediately: data.immediate,
          reason,
        })
        cancelledAt = result.cancelledAt
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          success: false as const,
          error: `Billing provider cancellation failed: ${message}`,
        }
      }
    }

    // For non-immediate cancellations, keep access until period end —
    // status stays as-is (ACTIVE/GRACE_PERIOD); we set cancelledAt only.
    // For immediate cancellations, transition to CANCELLED now.
    const newStatus = data.immediate ? SubscriptionStatus.CANCELLED : subscription.status // Access continues; the lifecycle job handles the final transition

    await rootPrisma.$transaction([
      rootPrisma.businessSubscription.update({
        where: { id: subscription.id },
        data: {
          status: newStatus,
          cancelledAt: cancelledAt,
          cancelReason: reason,
          updatedAt: now,
        },
      }),
      rootPrisma.subscriptionStatusHistory.create({
        data: {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: data.immediate ? SubscriptionStatus.CANCELLED : subscription.status,
          reason: data.immediate ? reason : `Cancellation scheduled at period end (${subscription.currentPeriodEnd?.toISOString() ?? 'unknown'}).`,
          triggeredBy: userId,
        },
      }),
    ])

    return {
      success: true as const,
      alreadyCancelled: false,
      immediate: data.immediate,
      cancelledAt: cancelledAt.toISOString(),
      accessUntil: data.immediate ? null : (subscription.currentPeriodEnd?.toISOString() ?? null),
    }
  })
