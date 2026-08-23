/**
 * fetch-pricing-quotes.ts
 *
 * Server function: Fetch all pricing quotes for the current business
 *
 * Security:
 *   - Requires BUSINESS_VIEW_BILLING permission
 *   - Scoped to user's businessId (tenant isolation)
 *   - Permission check enforced by middleware (cannot be bypassed)
 *
 * Returns:
 *   - Paginated list of pricing quotes with status, amounts, and metadata
 *   - Total count for pagination
 *
 * Architecture:
 *   - Replaces direct rootPrisma usage in route loaders
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

const FetchPricingQuotesInputSchema = z.object({
  page: z.number().int().min(1).default(1),
})

export type FetchPricingQuotesInput = z.infer<typeof FetchPricingQuotesInputSchema>

// ---------------------------------------------------------------------------
// fetchPricingQuotes server function
// ---------------------------------------------------------------------------

export const fetchPricingQuotes = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .inputValidator((data: FetchPricingQuotesInput) => FetchPricingQuotesInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    // authMiddleware guarantees user context exists
    const { businessId } = context.user

    const PAGE_SIZE = 20
    const skip = (data.page - 1) * PAGE_SIZE

    // Fetch quotes scoped to the business
    const [quotes, totalItems] = await Promise.all([
      rootPrisma.pricingQuote.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          status: true,
          grandTotal: true,
          subtotalMonthly: true,
          discountAmount: true,
          validUntil: true,
          createdAt: true,
          acceptedAt: true,
          convertedAt: true,
          _count: { select: { items: { where: { lineType: 'FEATURE' } } } },
        },
      }),
      rootPrisma.pricingQuote.count({ where: { businessId } }),
    ])

    return { quotes, totalItems }
  })
