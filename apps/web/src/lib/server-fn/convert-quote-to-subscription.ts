/**
 * convert-quote-to-subscription.ts
 *
 * Server function: convert an ACCEPTED PricingQuote to a COMPOSABLE_FEATURES
 * BusinessSubscription with BusinessSubscriptionFeature snapshot rows.
 *
 * Atomicity guarantee (per v1-master-plan.md §2.18 and Compliance Gate G5):
 *   All writes are inside a single Prisma transaction:
 *     1. PricingQuote status → CONVERTED
 *     2. BusinessSubscription create/update (billingModel = COMPOSABLE_FEATURES)
 *     3. BusinessSubscriptionFeature rows (one per FEATURE line item)
 *   If any step fails, the entire transaction rolls back — quote status is NOT
 *   updated unless all writes succeed.
 *
 * Architecture:
 *   - businessId comes from session context — never from the payload.
 *   - Only ACCEPTED quotes may be converted.
 *   - Idempotent for the quote: re-converting an already CONVERTED quote
 *     returns the existing subscription without creating a duplicate.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const ConvertQuoteInputSchema = z.object({
  quoteId: z.string().cuid('Invalid quote ID'),
  /**
   * The plan ID to associate with the new subscription.
   * Pass 'COMPOSABLE' as a sentinel to auto-resolve the Composable plan from the DB.
   */
  planId: z.string(),
})

export type ConvertQuoteInput = z.infer<typeof ConvertQuoteInputSchema>

// ---------------------------------------------------------------------------
// convertQuoteToSubscription server function
// ---------------------------------------------------------------------------

export const convertQuoteToSubscription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING), requireTenantContext()])
  .inputValidator((data: ConvertQuoteInput) => ConvertQuoteInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId } = getTenantContext(context).user

    // Load the quote with its items and catalog version
    const quote = await rootPrisma.pricingQuote.findUnique({
      where: { id: data.quoteId },
      include: {
        items: { where: { lineType: 'FEATURE' } },
        catalog: { select: { version: true } },
      },
    })

    if (!quote) {
      return { success: false as const, error: 'Quote not found' }
    }

    if (quote.businessId !== businessId) {
      return { success: false as const, error: 'You do not have permission to convert this quote' }
    }

    // Idempotent: already converted
    if (quote.status === 'CONVERTED') {
      const existing = await rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: { id: true },
      })
      return { success: true as const, alreadyConverted: true, subscriptionId: existing?.id ?? null }
    }

    if (quote.status !== 'ACCEPTED') {
      return { success: false as const, error: `Only ACCEPTED quotes can be converted. Current status: ${quote.status}` }
    }

    if (quote.items.length === 0) {
      return { success: false as const, error: 'Quote has no FEATURE line items — cannot create a composable subscription' }
    }

    // Resolve plan ID — if caller passed sentinel 'COMPOSABLE', look up the plan
    let resolvedPlanId = data.planId
    if (data.planId === 'COMPOSABLE') {
      const composablePlan = await rootPrisma.subscriptionPlan.findFirst({
        where: { name: { in: ['Composable', 'Enterprise'] } },
        select: { id: true },
        orderBy: { sortOrder: 'desc' },
      })
      if (!composablePlan) {
        return { success: false as const, error: 'No Composable subscription plan found. Please contact support.' }
      }
      resolvedPlanId = composablePlan.id
    }

    // Execute atomically
    const result = await rootPrisma.$transaction(async tx => {
      // 1. Mark quote as CONVERTED
      await tx.pricingQuote.update({
        where: { id: quote.id },
        data: { status: 'CONVERTED', convertedAt: new Date() },
      })

      // 2. Upsert BusinessSubscription with COMPOSABLE_FEATURES billing model
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setMonth(periodEnd.getMonth() + 1)

      const subscription = await tx.businessSubscription.upsert({
        where: { businessId },
        update: {
          billingModel: 'COMPOSABLE_FEATURES',
          status: 'ACTIVE',
          planId: resolvedPlanId,
          activatedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          // Clear trial/lifecycle dates on conversion to paid composable
          trialEndsAt: null,
          gracePeriodEndsAt: null,
          expiredAt: null,
          cancelledAt: null,
          cancelReason: null,
        },
        create: {
          businessId,
          planId: resolvedPlanId,
          billingModel: 'COMPOSABLE_FEATURES',
          status: 'ACTIVE',
          activatedAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      })

      // 3. Delete existing composable feature snapshots then insert new ones
      // (handles re-conversion scenarios where a business upgrades their feature set)
      await tx.businessSubscriptionFeature.deleteMany({
        where: { subscriptionId: subscription.id },
      })

      await tx.businessSubscriptionFeature.createMany({
        data: quote.items.map(item => ({
          subscriptionId: subscription.id,
          featureKey: item.featureKey!,
          snapshotPrice: item.unitAmount,
          catalogVersion: quote.catalog.version,
        })),
      })

      // 4. Write status history record
      await tx.subscriptionStatusHistory.create({
        data: {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: 'ACTIVE',
          reason: `Converted from PricingQuote ${quote.id} — composable subscription activated.`,
          triggeredBy: context?.user?.id,
        },
      })

      return subscription
    })

    return {
      success: true as const,
      alreadyConverted: false,
      subscriptionId: result.id,
      featureCount: quote.items.length,
    }
  })
