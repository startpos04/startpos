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

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'

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
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING), requireTenantContext()])
  .inputValidator((data: FetchPricingQuotesInput) => FetchPricingQuotesInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId } = getTenantContext(context).user

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
