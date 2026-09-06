/**
 * server-context.ts — Web-layer superset
 *
 * Re-exports the platform base context helpers and adds tenant-specific
 * types and middleware (businessId / branchId are web concerns).
 *
 * Usage:
 *   import { getServerContext, getTenantContext, requireTenantContext }
 *     from '@/lib/better-auth/server-context'
 */

import { getServerContext, type ServerContext, type ServerContextUser } from '@platform/lib/better-auth/server-context'
import { createMiddleware } from '@tanstack/react-start'

// Re-export platform base so callers only need one import
export { getServerContext, type ServerContext, type ServerContextUser }

// ---------------------------------------------------------------------------
// Tenant-narrowed types
// ---------------------------------------------------------------------------

/**
 * Narrowed user shape guaranteed after requireTenantContext runs.
 * businessId and branchId are required strings — no optionality.
 */
export interface TenantContextUser extends ServerContextUser {
  businessId: string
  branchId: string
}

/**
 * Narrowed server context after requireTenantContext has run.
 */
export interface TenantServerContext extends ServerContext {
  user: TenantContextUser
}

/**
 * Cast raw middleware context to the narrowed TenantServerContext shape.
 * Only safe to call after requireTenantContext middleware has run.
 */
export function getTenantContext(context: unknown): TenantServerContext {
  return context as TenantServerContext
}

// ---------------------------------------------------------------------------
// TenantContextError
// ---------------------------------------------------------------------------

export class TenantContextError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'TenantContextError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// requireTenantContext — middleware that guards tenant presence
//
// Ensures businessId and branchId are present before any downstream handler
// runs. Downstream code receives a narrowed TenantContextUser with both IDs
// as required strings — no optional chaining, no null checks.
//
// Usage:
//   createServerFn({ method: 'POST' })
//     .middleware([authMiddleware, requireTenantContext()])
//     .handler(async ({ context }) => {
//       const { businessId, branchId } = getTenantContext(context).user
//     })
// ---------------------------------------------------------------------------

export function requireTenantContext() {
  return createMiddleware({ type: 'function' }).server(async ({ next, context }) => {
    const ctx = context as unknown as ServerContext
    const { user } = ctx

    if (!user?.id) {
      throw new TenantContextError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    if (!user.businessId || !user.branchId) {
      throw new TenantContextError('NO_TENANT_CONTEXT', 'No business or branch context found. Please log in again.')
    }

    const narrowedContext: TenantServerContext = {
      ...ctx,
      user: {
        ...user,
        businessId: user.businessId,
        branchId: user.branchId,
      },
    }

    return next({ context: narrowedContext })
  })
}
