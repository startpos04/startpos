/**
 * review-manual-payment.ts
 *
 * Server function for admin review and approval/rejection of manual payments.
 *
 * Enhanced for advance payments:
 * - Applies advance payment credits to subscription
 * - Triggers provider synchronization (Stripe, PayMongo)
 * - Sends approval/rejection notifications
 * - Schedules advance payment expiration warnings
 * - Records comprehensive audit trail
 *
 * Follows project patterns:
 * - Uses authMiddleware and permission middleware
 * - Activates subscription on approval using SubscriptionEngine
 * - Handles payment status transitions atomically
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { advancePaymentService } from '@/lib/billing/advance-payment-service'
import { paymentNotificationService } from '@/lib/services/payment-notification-service'

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
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
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
              subscription: true,
            },
          },
        },
      })

      if (!payment) {
        return { success: false, error: 'Payment not found' }
      }

      if (payment.status !== 'PENDING_APPROVAL') {
        return { success: false, error: 'Payment has already been reviewed' }
      }

      if (data.approved) {
        // APPROVE: Update payment status and apply advance payment
        const result = await prisma.$transaction(async tx => {
          // Update payment status
          const updatedPayment = await tx.billingPayment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCEEDED',
              approvedAt: new Date(),
              approvedById: user.id,
            },
          })

          // Apply advance payment credits and trigger provider sync
          const advanceResult = await advancePaymentService.applyAdvancePayment(payment.id, payment.businessId, tx)

          if (!advanceResult.success) {
            throw new Error(`Failed to apply advance payment: ${advanceResult.error}`)
          }

          return {
            payment: updatedPayment,
            advanceResult: advanceResult.data,
          }
        })

        // Send approval notification (outside transaction)
        try {
          await paymentNotificationService.sendApprovalNotification(payment.id)
        } catch (notifyError) {
          console.error('[reviewManualPayment] Failed to send approval notification:', notifyError)
          // Don't fail the approval if notification fails
        }

        // Schedule advance expiration warning if applicable (outside transaction)
        if (payment.isAdvancePayment && payment.periodsAdvancePaid > 1) {
          try {
            const subscription = await prisma.businessSubscription.findUnique({
              where: { businessId: payment.businessId },
            })

            if (subscription) {
              await paymentNotificationService.scheduleAdvanceExpirationWarning(subscription)
            }
          } catch (scheduleError) {
            console.error('[reviewManualPayment] Failed to schedule expiration warning:', scheduleError)
            // Don't fail the approval if scheduling fails
          }
        }

        // Build success message
        const periodsText = payment.periodsAdvancePaid > 1 ? ` for ${payment.periodsAdvancePaid} billing periods` : ''

        const syncText =
          result.advanceResult?.syncStatus === 'COMPLETED'
            ? ' Payment synced to provider.'
            : result.advanceResult?.syncStatus === 'PENDING'
              ? ' Provider sync in progress.'
              : ''

        return {
          success: true,
          message: `Payment approved${periodsText}. Subscription activated for ${payment.business.name}.${syncText}`,
          data: {
            periodsGranted: payment.periodsAdvancePaid,
            syncStatus: result.advanceResult?.syncStatus,
            creditsApplied: result.advanceResult?.creditsApplied,
          },
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

        // Send rejection notification (outside transaction)
        try {
          await paymentNotificationService.sendRejectionNotification(payment.id, data.rejectionReason || 'Payment rejected by admin')
        } catch (notifyError) {
          console.error('[reviewManualPayment] Failed to send rejection notification:', notifyError)
          // Don't fail the rejection if notification fails
        }

        return {
          success: true,
          message: 'Payment rejected. Customer will be notified.',
        }
      }
    } catch (error) {
      console.error('[reviewManualPayment] Error:', error)

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to review payment',
      }
    }
  })
