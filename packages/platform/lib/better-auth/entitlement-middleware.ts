/**
 * entitlement-middleware.ts — Pure capability assertion
 *
 * Platform responsibility: given an already-resolved EntitlementContext,
 * assert that a capability is granted. Throw a structured error if not.
 *
 * Platform knows nothing about:
 *   - Who the user is
 *   - What businessId they belong to
 *   - How to fetch subscription / billing data
 *
 * All of that belongs in the app layer. The web app owns a superset:
 *   apps/web/src/lib/better-auth/entitlement-middleware.ts
 *   → extracts businessId from session context
 *   → builds EntitlementContext via buildEntitlementContext(businessId)
 *   → calls assertCapability(capability, context) from this file
 */

import type { CapabilityKey } from '../entitlement/capability-keys'
import { EntitlementEngine } from '../entitlement/entitlement-engine'
import type { EntitlementContext } from '../entitlement/entitlement-types'

// ---------------------------------------------------------------------------
// Error type — exported so web layer can catch and re-throw with the same type
// ---------------------------------------------------------------------------

export class EntitlementDeniedError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'EntitlementDeniedError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// assertCapability — pure domain assertion, no tenant coupling
//
// @param capability     The capability key to check
// @param entitlement    Pre-built EntitlementContext (app layer provides this)
//
// @throws EntitlementDeniedError if the capability is not granted
//
// Usage (in web-layer middleware):
//   const entitlement = await buildEntitlementContext(user.businessId)
//   assertCapability(Capabilities.CREATE_ORDER, entitlement) // throws if denied
// ---------------------------------------------------------------------------

export function assertCapability(capability: CapabilityKey, entitlement: EntitlementContext): void {
  const result = EntitlementEngine.check(capability, entitlement)
  if (!result.granted) {
    throw new EntitlementDeniedError(result.code, result.reason)
  }
}
