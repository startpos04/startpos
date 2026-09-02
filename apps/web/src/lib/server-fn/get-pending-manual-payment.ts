/**
 * get-pending-manual-payment.ts
 *
 * Returns the most recent PENDING_APPROVAL manual payment for the current
 * business, if one exists. Used to lock the checkout flow and prevent
 * duplicate submissions while a payment is under review.
 */

import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'

export const getPendingManualPayment = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { user } = context

    if (!user?.businessId) {
      return { hasPending: false, payment: null }
    }

    const payment = await prisma.billingPayment.findFirst({
      where: {
        businessId: user.businessId,
        provider: 'MANUAL',
        status: 'PENDING_APPROVAL',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        createdAt: true,
        periodsAdvancePaid: true,
        providerReference: true,
        subscriptionId: true,
      },
    })

    return {
      hasPending: !!payment,
      payment: payment
        ? {
            id: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            createdAt: payment.createdAt.toISOString(),
            periodsAdvancePaid: payment.periodsAdvancePaid,
            providerReference: payment.providerReference,
          }
        : null,
    }
  })
