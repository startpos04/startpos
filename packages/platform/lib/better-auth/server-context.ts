/**
 * server-context.ts
 *
 * Typed context helpers for server functions that use authMiddleware.
 *
 * TanStack Start's middleware context merging doesn't always preserve the
 * full parent context type through the chain. Use `getServerContext` to
 * cast the raw context to the known shape so server functions can access
 * context.user fields without TS errors.
 *
 * Tenant-specific context (TenantContextUser, TenantServerContext,
 * requireTenantContext, getTenantContext) lives in the web layer:
 *   apps/web/src/lib/better-auth/server-context.ts
 *
 * Usage:
 *   import { getServerContext } from '@platform/lib/better-auth/server-context'
 *
 *   .handler(async ({ context }) => {
 *     const { user } = getServerContext(context)
 *     const { id, role } = user
 *   })
 */

import type { Role } from '@platform/prisma/generated/prisma/enums'
import type { PermissionKey } from '../authorization'

// Generic user shape for server context — apps extend this with their own
// full user type (e.g. AuthMiddlewareUser from apps/web/src/lib/better-auth/auth-middleware.ts).
export interface ServerContextUser {
  id: string
  email: string
  role?: string
  businessId?: string | undefined
  branchId?: string | undefined
  [key: string]: unknown
}

export interface ServerContext {
  user: ServerContextUser
  authorization?: {
    permissions: PermissionKey[]
    role: Role
  }
}

/**
 * Cast raw middleware context to the typed ServerContext shape.
 * Safe to use — authMiddleware always populates these fields at runtime.
 */
export function getServerContext(context: unknown): ServerContext {
  return context as ServerContext
}
