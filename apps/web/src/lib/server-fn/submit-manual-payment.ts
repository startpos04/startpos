/**
 * submit-manual-payment.ts
 *
 * Server function for submitting manual payment proof.
 * Used by the manual payment submission UI to create payment records
 * that await admin approval.
 *
 * Follows project patterns:
 * - Uses authMiddleware for authentication
 * - Input validation with Zod
 * - Creates BillingPayment record in PENDING_APPROVAL status
 * - Returns payment ID for tracking
 */

// import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { paymentProviderRegistry } from '@/lib/billing/payment-provider-registry'

const submitManualPaymentSchema = z.object({
  planId: z.string(),
  amount: z.number().positive(),
  periodsAdvancePaid: z.number().int().min(1).max(3).default(1), // Support 1-3 months advance
  paymentMethod: z.enum(['GCASH', 'BANK_TRANSFER', 'MAYA']),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
  proofImageUrl: z.string().min(1), // Base64 data URL or uploaded image URL
})

export type SubmitManualPaymentInput = z.infer<typeof submitManualPaymentSchema>

/**
 * Server function to submit manual payment for subscription
 */
export const submitManualPayment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: SubmitManualPaymentInput) => submitManualPaymentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { user } = context

    if (!user?.businessId) {
      throw new Error('Business ID is required')
    }

    // Get manual payment adapter
    const adapter = paymentProviderRegistry.getAdapter('manual')
    if (!adapter) {
      throw new Error('Manual payment provider is not available')
    }

    try {
      // Create subscription through manual adapter
      // This creates a BillingPayment in PENDING_APPROVAL status
      const result = await adapter.createSubscription({
        externalCustomerId: user.businessId,
        externalPriceId: 'manual-plan', // Not used for manual payments
        metadata: {
          planId: data.planId,
          amount: data.amount.toString(),
          periodsAdvancePaid: data.periodsAdvancePaid.toString(),
          referenceNo: data.referenceNo || '',
          proofImageUrl: data.proofImageUrl,
          notes: data.notes || '',
          userId: user.id,
        },
        successUrl: '/billing?payment=success',
        cancelUrl: '/billing?payment=cancelled',
      })

      // The externalSubscriptionId is actually the payment ID for manual payments
      const paymentId = result.externalSubscriptionId

      const periodsLabel = data.periodsAdvancePaid === 1 ? '1 month' : `${data.periodsAdvancePaid} months`

      return {
        success: true,
        paymentId,
        periodsGranted: data.periodsAdvancePaid,
        message: `Payment submitted for ${periodsLabel}. Admin will review within 24 hours.`,
      }
    } catch (error) {
      console.error('[submitManualPayment] Error:', error)

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit payment',
      }
    }
  })
