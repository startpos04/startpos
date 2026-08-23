/**
 * accept-pricing-quote.ts
 *
 * Server function: mark a PricingQuote as ACCEPTED.
 *
 * Transitions a quote from SENT or CALCULATED → ACCEPTED.
 * The business must explicitly accept a quote before it can be converted
 * to a subscription. This creates an auditable acceptance record.
 *
 * Architecture:
 *   - businessId comes from session context — not the payload.
 *   - Only the business that owns the quote may accept it.
 *   - Idempotent: re-accepting an already ACCEPTED quote is a no-op.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const AcceptPricingQuoteInputSchema = z.object({
  quoteId: z.string().cuid('Invalid quote ID'),
})

export type AcceptPricingQuoteInput = z.infer<typeof AcceptPricingQuoteInputSchema>

// ---------------------------------------------------------------------------
// acceptPricingQuote server function
// ---------------------------------------------------------------------------

export const acceptPricingQuote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
  .inputValidator((data: AcceptPricingQuoteInput) => AcceptPricingQuoteInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId } = context.user

    const quote = await rootPrisma.pricingQuote.findUnique({
      where: { id: data.quoteId },
      select: { id: true, businessId: true, status: true, validUntil: true },
    })

    if (!quote) {
      return { success: false as const, error: 'Quote not found' }
    }

    if (quote.businessId !== businessId) {
      return { success: false as const, error: 'You do not have permission to accept this quote' }
    }

    // Idempotent: already accepted
    if (quote.status === 'ACCEPTED') {
      return { success: true as const, quoteId: quote.id, alreadyAccepted: true }
    }

    // Cannot accept terminal states
    if (quote.status === 'CONVERTED' || quote.status === 'CANCELLED') {
      return { success: false as const, error: `Quote is already ${quote.status.toLowerCase()} and cannot be accepted` }
    }

    // Check expiry
    if (quote.validUntil && new Date(quote.validUntil) < new Date()) {
      // Mark as expired first
      await rootPrisma.pricingQuote.update({
        where: { id: quote.id },
        data: { status: 'EXPIRED', expiredAt: new Date() },
      })
      return { success: false as const, error: 'This quote has expired. Please generate a new quote.' }
    }

    // Only CALCULATED or SENT quotes can be accepted
    if (quote.status !== 'CALCULATED' && quote.status !== 'SENT') {
      return { success: false as const, error: `Quote in "${quote.status}" status cannot be accepted` }
    }

    await rootPrisma.pricingQuote.update({
      where: { id: quote.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    })

    return { success: true as const, quoteId: quote.id, alreadyAccepted: false }
  })
