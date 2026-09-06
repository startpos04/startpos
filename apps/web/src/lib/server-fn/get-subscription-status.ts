/**
 * get-subscription-status.ts
 *
 * Server function to get subscription status after 3D Secure confirmation.
 * Called after user completes 3D Secure authentication.
 */

import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'

const getSubscriptionStatusSchema = z.object({
  subscriptionId: z.string(),
})

export type GetSubscriptionStatusInput = z.infer<typeof getSubscriptionStatusSchema>

/**
 * Server function to get subscription status
 */
export const getSubscriptionStatus = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: GetSubscriptionStatusInput) => getSubscriptionStatusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { user } = context

    if (!user?.businessId) {
      throw new Error('Business ID is required')
    }

    // Get subscription
    const subscription = await prisma.businessSubscription.findFirst({
      where: {
        id: data.subscriptionId,
        businessId: user.businessId,
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            monthlyPrice: true,
          },
        },
      },
    })

    if (!subscription) {
      throw new Error('Subscription not found')
    }

    // Return subscription data
    return {
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planId: subscription.planId,
        planName: subscription.plan.name,
        currentPeriodEnd: subscription.currentPeriodEnd,
        externalId: subscription.externalId,
      },
    }
  })
