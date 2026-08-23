/**
 * cancel-pricing-quote.ts
 *
 * Server function: Cancel (decline) a pricing quote
 *
 * Security:
 *   - Requires BUSINESS_MANAGE_BILLING permission
 *   - Scoped to user's businessId (tenant isolation)
 *   - Quote must belong to the user's business
 *   - Permission check enforced by middleware (cannot be bypassed)
 *
 * Business Rules:
 *   - Cannot cancel quotes that are already CONVERTED, CANCELLED, or EXPIRED
 *   - Sets status to CANCELLED and records cancelledAt timestamp
 *
 * Returns:
 *   - { success: true } on successful cancellation
 *   - { success: false, error: string } on validation failure or not found
 *
 * Architecture:
 *   - Replaces inline rootPrisma usage in route handlers
 *   - Properly gates access with permission checks
 *   - Phase 0: Authorization Foundation compliance
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'
import { prisma as rootPrisma } from '@/lib/prisma-client'

// ---------------------------------------------------------------------------
// Input validation schema
// ---------------------------------------------------------------------------

const CancelPricingQuoteInputSchema = z.object({
  quoteId: z.string().cuid('Invalid quote ID'),
})

export type CancelPricingQuoteInput = z.infer<typeof CancelPricingQuoteInputSchema>

// ---------------------------------------------------------------------------
// cancelPricingQuote server function
// ---------------------------------------------------------------------------

export const cancelPricingQuote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
  .inputValidator((data: CancelPricingQuoteInput) => CancelPricingQuoteInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    // authMiddleware guarantees user context exists
    const { businessId } = context.user

    // Fetch quote to verify ownership and check current status
    const quote = await rootPrisma.pricingQuote.findUnique({
      where: { id: data.quoteId },
      select: { id: true, businessId: true, status: true },
    })

    // Validate quote exists and belongs to this business
    if (!quote || quote.businessId !== businessId) {
      return { success: false as const, error: 'Quote not found' }
    }

    // Validate quote is in a cancellable state
    if (['CONVERTED', 'CANCELLED', 'EXPIRED'].includes(quote.status)) {
      return { success: false as const, error: `Quote is already ${quote.status.toLowerCase()}` }
    }

    // Update quote to cancelled status
    await rootPrisma.pricingQuote.update({
      where: { id: data.quoteId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    })

    return { success: true as const }
  })
