/**
 * entitlement-middleware.ts — Web-layer superset
 *
 * This is the app-layer middleware that owns the full capability enforcement flow:
 *   1. Extract businessId from session context (tenant concern — web only)
 *   2. Build EntitlementContext from DB (app-layer DB queries)
 *   3. Delegate to platform assertCapability for the pure domain check
 *
 * Import THIS file (not the platform version) in apps/web server functions:
 *
 *   import { requireCapability } from '@/lib/better-auth/entitlement-middleware'
 *
 *   createServerFn({ method: 'POST' })
 *     .middleware([authMiddleware, requireCapability(Capabilities.CREATE_ORDER)])
 *     .handler(async ({ context }) => { ... })
 */

import { assertCapability, EntitlementDeniedError } from '@platform/lib/better-auth/entitlement-middleware'
import { getServerContext } from '@platform/lib/better-auth/server-context'
import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import type { EntitlementContext } from '@platform/lib/entitlement/entitlement-types'
import { createMiddleware } from '@tanstack/react-start'
import { buildEntitlementContext } from '@/lib/better-auth/entitlement-resolver'

export { EntitlementDeniedError }

// ---------------------------------------------------------------------------
// requireCapability — app-layer middleware
//
// Owns the full flow: tenant extraction → DB resolution → platform assertion.
// Platform never sees businessId; it only receives the resolved EntitlementContext.
// ---------------------------------------------------------------------------

export function requireCapability(capability: CapabilityKey) {
  return createMiddleware({ type: 'function' }).server(async ({ next, context }) => {
    const user = getServerContext(context).user

    if (!user?.id) {
      throw new EntitlementDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    if (!user.businessId) {
      throw new EntitlementDeniedError('NO_TENANT_CONTEXT', 'No business context found. Please log in again.')
    }

    // App layer: resolve EntitlementContext from DB using businessId
    const entitlementContext: EntitlementContext = await buildEntitlementContext(user.businessId)

    // Platform: pure domain assertion — no tenant data crosses this boundary
    assertCapability(capability, entitlementContext)

    return next({
      context: {
        user,
        entitlement: entitlementContext,
        capabilityGranted: capability,
      },
    })
  })
}
