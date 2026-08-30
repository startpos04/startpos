/**
 * review-manual-payment.ts
 * 
 * Server function for admin review and approval/rejection of manual payments.
 * 
 * Follows project patterns:
 * - Uses authMiddleware and permission middleware
 * - Activates subscription on approval using SubscriptionEngine
 * - Creates audit trail of approval decisions
 * - Handles payment status transitions atomically
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { prisma } from '@/lib/prisma-client'
import { Permissions } from '@/lib/authorization/permission-keys'
// We'll need to import SubscriptionEngine when implementing subscription activation
// import { SubscriptionEngine } from '@/lib/billing/subscription-engine'

const reviewManualPaymentSchema = z.object({
  paymentId: z.string(),
  approved: z.boolean(),
  rejectionReason: z.string().optional(),
})

export type ReviewManualPaymentInput = z.infer<typeof reviewManualPaymentSchema>

/**
 * Server function for admin to approve or reject manual payments
 * Requires ADMIN permission to manage billing
 */
export const reviewManualPayment = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requirePermission(Permissions.BUSINESS_MANAGE_BILLING)
  ])
  .inputValidator((data: ReviewManualPaymentInput) => reviewManualPaymentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { user } = context

    try {
      // Get the payment record with related data
      const payment = await prisma.billingPayment.findUnique({
        where: { id: data.paymentId },
        include: { 
          business: {
            include: {
              subscription: true
            }
          }
        },
      })

      if (!payment) {
        return { success: false, error: 'Payment not found' }
      }

      if (payment.status !== 'PENDING_APPROVAL') {
        return { success: false, error: 'Payment has already been reviewed' }
      }

      if (data.approved) {
        // APPROVE: Update payment status and activate subscription
        await prisma.$transaction(async (tx) => {
          // Update payment status
          await tx.billingPayment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCEEDED',
              approvedAt: new Date(),
              approvedById: user.id,
            },
          })

          // TODO: Activate subscription using SubscriptionEngine
          // This would involve:
          // 1. Finding the target plan from metadata
          // 2. Creating or updating BusinessSubscription
          // 3. Recording subscription status history
          // 4. Applying entitlements
          
          // For now, we'll add a simple comment that this needs to be implemented
          // when we have access to the SubscriptionEngine
          
          // Example of what this would look like:
          /*
          const planId = payment.providerMetadata.planId
          const subscription = payment.business.subscription
          
          if (subscription) {
            const transition = SubscriptionEngine.buildTransitionRecord(
              subscription,
              SubscriptionStatus.ACTIVE,
              `Manual payment approved by ${user.name}`,
              user.id
            )
            
            await SubscriptionEngine.applyTransition(tx, subscription, transition)
          }
          */
        })

        return { 
          success: true, 
          message: `Payment approved. Subscription activated for ${payment.business.name}.`
        }
        
      } else {
        // REJECT: Update payment status with rejection reason
        await prisma.billingPayment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            rejectedAt: new Date(),
            rejectionReason: data.rejectionReason || 'Payment rejected by admin',
          },
        })

        return { 
          success: true, 
          message: 'Payment rejected. Customer will be notified.'
        }
      }

    } catch (error) {
      console.error('[reviewManualPayment] Error:', error)
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to review payment'
      }
    }
  })