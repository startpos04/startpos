/**
 * fetch-pricing-quote.ts
 *
 * Server function: Fetch a single pricing quote by ID
 *
 * Security:
 *   - Requires BUSINESS_VIEW_BILLING permission
 *   - Scoped to user's businessId (tenant isolation)
 *   - Quote must belong to the user's business
 *   - Permission check enforced by middleware (cannot be bypassed)
 *
 * Returns:
 *   - Full quote detail including line items and catalog info
 *   - null if quote not found or doesn't belong to the business
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

const FetchPricingQuoteInputSchema = z.object({
  quoteId: z.string().cuid('Invalid quote ID'),
})

export type FetchPricingQuoteInput = z.infer<typeof FetchPricingQuoteInputSchema>

// ---------------------------------------------------------------------------
// fetchPricingQuote server function
// ---------------------------------------------------------------------------

export const fetchPricingQuote = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING), requireTenantContext()])
  .inputValidator((data: FetchPricingQuoteInput) => FetchPricingQuoteInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId } = getTenantContext(context).user

    // Fetch quote scoped to the business (tenant isolation)
    return rootPrisma.pricingQuote.findFirst({
      where: {
        id: data.quoteId,
        businessId, // Critical: only return if it belongs to this business
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        catalog: { select: { version: true, label: true } },
      },
    })
  })
