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
async function checkEntitlements(context: any, model: string): Promise<{ allowed: boolean; reason?: string }> {
  const { prisma: rootPrisma } = await import('@platform/lib/prisma-client')
  const { businessId, branchId } = getServerContext(context).user

  try {
    const capabilities = await rootPrisma.capability.findMany({
      where: { businessId, branchId: branchId || null },
      include: { entitlements: true },
    })

    switch (model) {
      case 'branch': {
        const branchEntitlement = capabilities.flatMap(c => c.entitlements).find(e => e.feature === 'BRANCHES' && e.quantityLimit !== null)
        if (branchEntitlement) {
          const currentBranchCount = await rootPrisma.branch.count({ where: { businessId } })
          if (currentBranchCount >= branchEntitlement.quantityLimit!) {
            return { allowed: false, reason: `Branch limit reached (${branchEntitlement.quantityLimit}). Upgrade your plan to create more branches.` }
          }
        }
        break
      }
      case 'employee': {
        const employeeEntitlement = capabilities.flatMap(c => c.entitlements).find(e => e.feature === 'EMPLOYEES' && e.quantityLimit !== null)
        if (employeeEntitlement && branchId) {
          const currentEmployeeCount = await rootPrisma.employee.count({ where: { businessId, branchId } })
          if (currentEmployeeCount >= employeeEntitlement.quantityLimit!) {
            return {
              allowed: false,
              reason: `Employee limit reached (${employeeEntitlement.quantityLimit}) for this branch. Upgrade your plan to add more employees.`,
            }
          }
        }
        break
      }
      case 'product': {
        const productEntitlement = capabilities.flatMap(c => c.entitlements).find(e => e.feature === 'PRODUCTS' && e.quantityLimit !== null)
        if (productEntitlement && branchId) {
          const tenantPrisma = getTenantPrisma(businessId, branchId)
          const currentProductCount = await tenantPrisma.product.count({ where: { businessId, branchId } })
          if (currentProductCount >= productEntitlement.quantityLimit!) {
            return {
              allowed: false,
              reason: `Product limit reached (${productEntitlement.quantityLimit}) for this branch. Upgrade your plan to add more products.`,
            }
          }
        }
        break
      }
      default:
        break
    }

    return { allowed: true }
  } catch (error) {
    console.error('[crudAPI] Entitlement check failed:', error)
    return { allowed: true } // fail open
  }
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

    const tenantPrisma = getTenantPrisma(getServerContext(context).user.businessId, getServerContext(context).user.branchId!)
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
