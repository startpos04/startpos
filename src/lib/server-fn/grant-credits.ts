/**
 * grant-credits.ts
 *
 * Admin credit grant server function — Phase 3.
 *
 * Allows a platform admin (or business ADMIN role) to insert a PROMOTIONAL
 * or ADJUSTMENT CreditLedger entry for a business. No payment provider is
 * involved in Phase 3; Phase 4 will add PURCHASE entries via webhook.
 *
 * Architecture:
 *   - Server function — runs on the server, never in the browser bundle.
 *   - Uses rootPrisma (platform-level) to write to credit_ledger.
 *   - CreditEngine is pure; this function is the Application Layer glue.
 *   - Tenant isolation: businessId is taken from the session context, not
 *     from the client payload, to prevent cross-tenant writes.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { CreditEngine, CreditEventType } from '../billing/credit-engine'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const GrantCreditsInputSchema = z.object({
  amount: z.number().int().min(1, 'Amount must be at least 1 credit'),
  eventType: z.enum(['PROMOTIONAL', 'ADJUSTMENT']).default('PROMOTIONAL'),
  note: z.string().max(500).nullable().default(null),
})

export type GrantCreditsInput = z.infer<typeof GrantCreditsInputSchema>

// ---------------------------------------------------------------------------
// grantCredits server function
// ---------------------------------------------------------------------------

export const grantCredits = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING)])
  .inputValidator((data: GrantCreditsInput) => GrantCreditsInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId, id: actorId } = context.user

    // Fetch the latest ledger snapshot for this business (O(1) balance read).
    const latestEntry = await rootPrisma.creditLedger.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    })

    const eventType = data.eventType === 'ADJUSTMENT' ? CreditEventType.ADJUSTMENT : CreditEventType.PROMOTIONAL

    const result = CreditEngine.grant(businessId, latestEntry, data.amount, eventType, data.note, actorId)

    if (!result.ok) {
      return { success: false as const, error: result.reason }
    }

    const entry = result.value

    await rootPrisma.creditLedger.create({
      data: {
        businessId: entry.businessId,
        eventType: entry.eventType as import('prisma/generated/prisma/enums').CreditEventType,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        transactionId: entry.transactionId,
        note: entry.note,
        actorId: entry.actorId,
      },
    })

    return {
      success: true as const,
      newBalance: entry.balanceAfter,
    }
  })
