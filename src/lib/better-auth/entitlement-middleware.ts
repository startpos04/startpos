/**
 * entitlement-middleware.ts — Server-side capability enforcement middleware
 *
 * Use this middleware on any createServerFn that requires a specific capability.
 * It rebuilds the EntitlementContext from the DB on every call (not from the
 * client session) so it cannot be spoofed.
 *
 * Usage:
 *   import { requireCapability } from '@/lib/better-auth/entitlement-middleware'
 *   import { Capabilities } from '@/lib/entitlement/capability-keys'
 *
 *   export const createOrder = createServerFn({ method: 'POST' })
 *     .middleware([authMiddleware, requireCapability(Capabilities.CREATE_ORDER)])
 *     .handler(async ({ data, context }) => {
 *       // context.entitlement is available here if needed
 *       // If the capability is denied, this handler is never called —
 *       // the middleware throws before reaching it.
 *     })
 *
 * What it does:
 *   1. Reads the business's active subscription from rootPrisma (authoritative)
 *   2. Rebuilds EntitlementContext (same path as getAuthUser)
 *   3. Calls EntitlementEngine.check(capability, context)
 *   4. If denied: throws an error with the denial code + reason
 *      (TanStack Start serializes this as a 403-equivalent response)
 *   5. If granted: calls next() so the handler proceeds
 *
 * Why rebuild from DB (not from session):
 *   The client session is a snapshot taken at login. A subscription could
 *   expire between logins, or an admin could revoke a feature override.
 *   For mutation server functions, the server must be the authority.
 *   For read-only server functions (fetchCapabilityStates, etc.) the session
 *   check in useCapability() is sufficient — no need for this middleware.
 *
 * Architecture:
 *   - Composed with authMiddleware (must come after it so context.user exists)
 *   - Pure middleware — no side effects beyond the capability check
 *   - Uses rootPrisma for subscription reads (platform-level data)
 */

import { createMiddleware } from '@tanstack/react-start'
import { BillingModel } from '../billing/types'
import type { CapabilityKey } from '../entitlement/capability-keys'
import { EntitlementEngine } from '../entitlement/entitlement-engine'
import type { EntitlementContext, EntitlementOverrideDTO } from '../entitlement/entitlement-types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Entitlement error — thrown when the capability is denied
// ---------------------------------------------------------------------------

export class EntitlementDeniedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'EntitlementDeniedError'
  }
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates a TanStack Start middleware that enforces a capability check.
 * Compose after authMiddleware in the .middleware() array.
 *
 * @param capability - The CapabilityKey that must be GRANTED for the handler to run
 */
export function requireCapability(capability: CapabilityKey) {
  return createMiddleware().server(async ({ next, context }) => {
    const user = (context as { user?: { businessId?: string } }).user

    if (!user?.businessId) {
      throw new EntitlementDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    const businessId = user.businessId

    // -----------------------------------------------------------------------
    // Rebuild EntitlementContext from DB — not from the client session
    // -----------------------------------------------------------------------
    const [subscription, overrides, openCounter, latestCredit] = await Promise.all([
      rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: {
          status: true,
          billingModel: true,
          plan: {
            select: {
              includedTxPerMonth: true,
              entitlements: { select: { featureKey: true, usageLimit: true } },
            },
          },
        },
      }),
      rootPrisma.entitlementOverride.findMany({
        where: { businessId },
        select: { featureKey: true, granted: true, expiresAt: true },
      }),
      rootPrisma.usageCounter.findFirst({
        where: { businessId, isClosed: false },
        select: { txCount: true },
        orderBy: { billingPeriodStart: 'desc' },
      }),
      rootPrisma.creditLedger.findFirst({
        where: { businessId },
        select: { balanceAfter: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // If no subscription exists yet, use open context (dev / first login)
    let entitlementContext: EntitlementContext

    if (!subscription) {
      const allFeatures = await rootPrisma.planEntitlement.findMany({
        select: { featureKey: true },
      })
      entitlementContext = EntitlementEngine.buildOpenContext(allFeatures.map(f => f.featureKey as CapabilityKey))
    } else {
      const status = subscription.status as EntitlementContext['status']
      const planFeatures = subscription.plan.entitlements.map(e => e.featureKey as CapabilityKey)
      const usageLimits: Partial<Record<CapabilityKey, number>> = {}
      for (const e of subscription.plan.entitlements) {
        if (e.usageLimit !== null) usageLimits[e.featureKey as CapabilityKey] = e.usageLimit
      }

      const includedTx = subscription.plan.includedTxPerMonth
      const txUsed = openCounter?.txCount ?? 0
      const txRemaining = includedTx === -1 ? null : Math.max(0, includedTx - txUsed)
      const creditBalance = subscription.billingModel === BillingModel.PREPAID_CREDITS ? (latestCredit?.balanceAfter ?? 0) : null

      entitlementContext = {
        status,
        billingModel: subscription.billingModel as EntitlementContext['billingModel'],
        planFeatures,
        usageLimits,
        currentUsage: {},
        txRemaining,
        overrides: overrides.map(
          (o): EntitlementOverrideDTO => ({
            featureKey: o.featureKey,
            granted: o.granted,
            expiresAt: o.expiresAt,
          }),
        ),
        creditBalance,
      }
    }

    // -----------------------------------------------------------------------
    // Run the entitlement check
    // -----------------------------------------------------------------------
    const result = EntitlementEngine.check(capability, entitlementContext)

    if (!result.granted) {
      throw new EntitlementDeniedError(result.code, result.reason)
    }

    // -----------------------------------------------------------------------
    // Pass entitlement context to the handler (optional — handler can use it
    // for remaining quota, etc.)
    // -----------------------------------------------------------------------
    return next({
      context: {
        ...(context as object),
        entitlement: entitlementContext,
        capabilityGranted: capability,
      },
    })
  })
}
