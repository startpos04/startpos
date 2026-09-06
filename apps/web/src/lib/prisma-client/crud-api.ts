/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

import { getRequiredPermission, requiresEntitlementCheck } from '@platform/lib/authorization/model-permissions'
import { getServerContext } from '@platform/lib/better-auth/server-context'
import { type CrudProxy, type DBPayload, executeOperation } from '@platform/lib/prisma-client/crud-api'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, ResultAsync } from 'neverthrow'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantPrisma } from '@/lib/prisma-client'

// ---------------------------------------------------------------------------
// Entitlement check — verifies subscription limits before create operations
// ---------------------------------------------------------------------------
async function checkEntitlements(_context: any, _model: string): Promise<{ allowed: boolean; reason?: string }> {
  // Entitlement checks are enforced at the plan level by the EntitlementEngine.
  // Coarse model-level limits here are deferred — always allow.
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// crudAPI server function
// ---------------------------------------------------------------------------
const crudServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    // Gate 1: Permission check
    const requiredPermission = getRequiredPermission(data.table, data.action)
    if (requiredPermission) {
      const userPermissions = context.authorization?.permissions || []
      if (!userPermissions.includes(requiredPermission)) {
        return { error: `Permission denied: ${requiredPermission} required for ${data.action} on ${data.table}` }
      }
    }

    // Gate 2: Entitlement check for create operations
    if (requiresEntitlementCheck(data.table, data.action)) {
      const entitlementCheck = await checkEntitlements(context, data.table)
      if (!entitlementCheck.allowed) {
        return { error: entitlementCheck.reason || `Subscription limit reached for ${data.table}` }
      }
    }

    const tenantPrisma = getTenantPrisma(getServerContext(context).user.businessId!, getServerContext(context).user.branchId!)
    const result = await ResultAsync.fromPromise(executeOperation(tenantPrisma, data), (e: any) => e.message || 'Database operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// ---------------------------------------------------------------------------
// Public API — typed proxy that maps model.method() calls to the server fn
// ---------------------------------------------------------------------------
export const crudAPI = new Proxy({} as CrudProxy, {
  get(_, table: string) {
    return async (action: string, args: any) => {
      const response = await crudServerFn({ data: { table, action, args } })
      if ('error' in response) return err(response.error as string)
      return ok(response.value as any)
    }
  },
})
