/**
 * entitlement-middleware.ts
 *
 * Server-side entitlement middleware for TanStack Start server functions.
 *
 * Architecture Compliance — Phase 6 (Section 6.1, Deferred Item):
 *   Addresses the 🔴 Missing item: "Entitlement middleware for server functions —
 *   No per-action server-side capability check."
 *
 * Usage:
 *   createServerFn({ method: 'POST' })
 *     .middleware([authMiddleware, entitlementMiddleware(Capabilities.COMPLETE_CHECKOUT)])
 *     .handler(async ({ context }) => { ... })
 *
 * What it does:
 *   1. Reads the business's live subscription from rootPrisma (platform-level table,
 *      not tenant-scoped — same pattern as getAuthUser).
 *   2. Assembles a minimal EntitlementContext from the subscription record.
 *   3. Calls EntitlementEngine.check(capability, context).
 *   4. Throws an HTTP 403 if access is denied, propagating the EntitlementCode
 *      and human-readable reason to the caller.
 *   5. On success, passes the entitlement result through the middleware chain so
 *      handlers can read it without re-fetching.
 *
 * Architectural constraints:
 *   - Must come AFTER authMiddleware in the chain (requires context.user).
 *   - Does NOT import from collections — always reads live data from rootPrisma.
 *     Server functions run in the server process where collections are not available.
 *   - Does NOT re-implement authStore's entitlement summary — this is a fresh DB
 *     read so it is authoritative even if the client's authStore is stale.
 *   - EntitlementEngine is pure and has no infrastructure imports. This file is the
 *     sole infrastructure call site that feeds data into the engine.
 *
 * Note on open-context fallback:
 *   If no BusinessSubscription exists (dev / seed mode), the middleware falls back to
 *   GRANTED so development workflows are not broken. The fallback is identical to
 *   getAuthUser's open-context fallback. Production businesses will always have a
 *   subscription record (auto-provisioned by getAuthUser at first login — Phase 0).
 */

import { createMiddleware } from '@tanstack/react-start'
import type { CapabilityKey } from '../entitlement/capability-keys'
import { Capabilities } from '../entitlement/capability-keys'
import { EntitlementEngine } from '../entitlement/entitlement-engine'
import { EntitlementCode, type EntitlementContext, type EntitlementOverrideDTO } from '../entitlement/entitlement-types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Shared type injected into middleware context downstream
// ---------------------------------------------------------------------------

export type EntitlementMiddlewareContext = {
  /** The capability that was checked */
  checkedCapability: CapabilityKey
  /** EntitlementCode.GRANTED — the middleware throws before reaching handlers on denial */
  entitlementCode: typeof EntitlementCode.GRANTED
}

// ---------------------------------------------------------------------------
// Factory — returns a configured middleware for the given capability
// ---------------------------------------------------------------------------

/**
 * Creates a middleware that enforces the given capability before the handler runs.
 *
 * @param capability  The CapabilityKey that must be granted for the handler to execute.
 *                    Use constants from `Capabilities`, e.g. `Capabilities.COMPLETE_CHECKOUT`.
 *
 * @example
 *   .middleware([authMiddleware, entitlementMiddleware(Capabilities.CREATE_TASK)])
 */
export function entitlementMiddleware(capability: CapabilityKey) {
  return createMiddleware().server(async ({ next, context }) => {
    // authMiddleware must run first — context.user is required
    const user = (context as unknown as { user?: { businessId?: string; branchId?: string } }).user

    if (!user?.businessId) {
      throw new Error(`[entitlementMiddleware] Unauthorized — no session context for capability: ${capability}`)
    }

    const { businessId } = user

    // -----------------------------------------------------------------------
    // 1. Fetch the live subscription + overrides in parallel.
    //    Uses rootPrisma — subscription data is platform-level, not tenant-scoped.
    //    Mirrors the fetch pattern in getAuthUser but is minimal: only fields
    //    required to assemble EntitlementContext are fetched.
    // -----------------------------------------------------------------------
    const [businessSubscription, entitlementOverrides, openUsageCounter, latestCreditLedger] = await Promise.all([
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

      // Phase 2 — txRemaining from live UsageCounter (not the deprecated column)
      rootPrisma.usageCounter.findFirst({
        where: { businessId, isClosed: false },
        select: { txCount: true },
        orderBy: { billingPeriodStart: 'desc' },
      }),

      // Phase 3 — credit balance from latest CreditLedger entry
      rootPrisma.creditLedger.findFirst({
        where: { businessId },
        select: { balanceAfter: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // -----------------------------------------------------------------------
    // 2. Open-context fallback — dev / seed mode safety.
    //    If no subscription record exists, grant everything so existing
    //    development workflows are not broken (mirrors getAuthUser fallback).
    // -----------------------------------------------------------------------
    if (!businessSubscription) {
      const entitlementCtx: EntitlementMiddlewareContext = {
        checkedCapability: capability,
        entitlementCode: EntitlementCode.GRANTED,
      }
      return await next({ context: entitlementCtx })
    }

    // -----------------------------------------------------------------------
    // 3. Assemble EntitlementContext from live subscription data.
    // -----------------------------------------------------------------------
    const status = businessSubscription.status as import('../entitlement/entitlement-types').SubscriptionStatus
    const billingModel = businessSubscription.billingModel as import('../entitlement/entitlement-types').BillingModelDomain

    const planFeatures = businessSubscription.plan.entitlements.map((e: { featureKey: string }) => e.featureKey as CapabilityKey)

    const usageLimits: Partial<Record<CapabilityKey, number>> = {}
    for (const e of businessSubscription.plan.entitlements) {
      if (e.usageLimit !== null) {
        usageLimits[e.featureKey as CapabilityKey] = e.usageLimit
      }
    }

    const includedTx = businessSubscription.plan.includedTxPerMonth
    const txUsed = openUsageCounter?.txCount ?? 0
    const txRemaining = includedTx === -1 ? null : Math.max(0, includedTx - txUsed)

    // Credit balance: only relevant for PREPAID_CREDITS; null for other models
    const creditBalance = billingModel === 'PREPAID_CREDITS' ? (latestCreditLedger?.balanceAfter ?? 0) : null

    const entitlementContext: EntitlementContext = {
      status,
      billingModel,
      planFeatures,
      usageLimits,
      currentUsage: {},
      txRemaining,
      overrides: entitlementOverrides.map(
        (o: { featureKey: string; granted: boolean; expiresAt: Date | null }): EntitlementOverrideDTO => ({
          featureKey: o.featureKey,
          granted: o.granted,
          expiresAt: o.expiresAt,
        }),
      ),
      creditBalance,
    }

    // -----------------------------------------------------------------------
    // 4. Run the entitlement check.
    // -----------------------------------------------------------------------
    const result = EntitlementEngine.check(capability, entitlementContext)

    if (!result.granted) {
      // Throw a structured error that the caller can catch and inspect.
      // The code and reason are included so error boundaries can show the
      // appropriate message (upgrade prompt, expired banner, etc.).
      throw new Error(
        JSON.stringify({
          type: 'EntitlementDenied',
          capability,
          code: result.code,
          reason: result.reason,
        }),
      )
    }

    // -----------------------------------------------------------------------
    // 5. Pass the result through to downstream handlers.
    // -----------------------------------------------------------------------
    const entitlementCtx: EntitlementMiddlewareContext = {
      checkedCapability: capability,
      entitlementCode: EntitlementCode.GRANTED,
    }

    return await next({ context: entitlementCtx })
  })
}

// ---------------------------------------------------------------------------
// Helper — parse the structured error thrown by this middleware
// ---------------------------------------------------------------------------

export type EntitlementDeniedError = {
  type: 'EntitlementDenied'
  capability: CapabilityKey
  code: Exclude<(typeof EntitlementCode)[keyof typeof EntitlementCode], typeof EntitlementCode.GRANTED>
  reason: string
}

/**
 * Attempts to parse an error thrown by `entitlementMiddleware`.
 * Returns null if the error is not an EntitlementDenied error.
 *
 * @example
 *   try {
 *     await someServerFn(...)
 *   } catch (err) {
 *     const denied = parseEntitlementDeniedError(err)
 *     if (denied) toast.error(denied.reason)
 *   }
 */
export function parseEntitlementDeniedError(err: unknown): EntitlementDeniedError | null {
  if (!(err instanceof Error)) return null
  try {
    const parsed = JSON.parse(err.message)
    if (parsed?.type === 'EntitlementDenied') return parsed as EntitlementDeniedError
  } catch {
    // not a JSON error
  }
  return null
}

// ---------------------------------------------------------------------------
// Re-export Capabilities for convenience — callers only need one import
// ---------------------------------------------------------------------------
export { Capabilities }
