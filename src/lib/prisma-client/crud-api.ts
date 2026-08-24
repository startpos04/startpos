/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */
import { createServerFn } from '@tanstack/react-start'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { Prisma } from 'prisma/generated/prisma/client'
import { getRequiredPermission, requiresEntitlementCheck } from '@/lib/authorization/model-permissions'
import { getTenantPrisma, type prisma } from '@/lib/prisma-client'
import { authMiddleware } from '../better-auth/auth-middleware'

// --- ADVANCED TYPES ---

type DB = typeof prisma
type ModelName = Uncapitalize<Prisma.ModelName>
type DelegateMethods = 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany' | 'count' | 'groupBy'

type DeepPrettify<T> = T extends Date ? T : T extends object ? { [K in keyof T]: DeepPrettify<T[K]> } & {} : T

type DeepStrip<T> = T extends object
  ? {
      [K in keyof T as K extends 'businessId' | 'branchId' ? never : K]: T[K] extends Array<infer U> ? Array<DeepStrip<U>> : DeepStrip<T[K]>
    }
  : T
type CleanArgs<T extends ModelName, M extends DelegateMethods> = DeepStrip<Parameters<DB[T][M]>[0]>
type InferResult<T extends ModelName, M extends DelegateMethods, A> = Prisma.Result<DB[T], A, M>

type CrudProxy = {
  [K in ModelName]: <M extends DelegateMethods, A extends CleanArgs<K, M>>(action: M, args?: A) => Promise<Result<DeepPrettify<InferResult<K, M, A>>, string>>
}

// Export the input payload type so the transaction api can share it
export interface DBPayload {
  table: string
  action: string
  args?: any
}

/**
 * CORE REUSE ENGINEER: Resolves the table/model and method dynamically.
 * Accepts any db Client context (global prisma instance or inside a transactional tx client).
 */
export async function executeOperation(dbInstance: any, payload: DBPayload): Promise<any> {
  const delegate = dbInstance[payload.table]

  if (!delegate?.[payload.action]) {
    throw new Error(`Invalid operation: ${payload.action} on ${payload.table}`)
  }

  return await delegate[payload.action](payload.args)
}

/**
 * Check subscription entitlements for create operations
 * Validates that the business/branch has not exceeded their limits
 */
async function checkEntitlements(context: any, model: string): Promise<{ allowed: boolean; reason?: string }> {
  const { rootPrisma } = await import('@/lib/prisma-client')
  const { businessId, branchId } = context.user

  try {
    // Fetch business capabilities and entitlements
    const capabilities = await rootPrisma.capability.findMany({
      where: {
        businessId,
        branchId: branchId || null, // Business-level capabilities have null branchId
      },
      include: {
        entitlements: true,
      },
    })

    // Model-specific limit checks
    switch (model) {
      case 'branch': {
        // Check branch limit
        const branchEntitlement = capabilities.flatMap(c => c.entitlements).find(e => e.feature === 'BRANCHES' && e.quantityLimit !== null)

        if (branchEntitlement) {
          const currentBranchCount = await rootPrisma.branch.count({
            where: { businessId },
          })

          if (currentBranchCount >= branchEntitlement.quantityLimit!) {
            return {
              allowed: false,
              reason: `Branch limit reached (${branchEntitlement.quantityLimit}). Upgrade your plan to create more branches.`,
            }
          }
        }
        break
      }

      case 'employee': {
        // Check employee limit per branch
        const employeeEntitlement = capabilities.flatMap(c => c.entitlements).find(e => e.feature === 'EMPLOYEES' && e.quantityLimit !== null)

        if (employeeEntitlement && branchId) {
          const currentEmployeeCount = await rootPrisma.employee.count({
            where: { businessId, branchId },
          })

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
        // Check product limit per branch
        const productEntitlement = capabilities.flatMap(c => c.entitlements).find(e => e.feature === 'PRODUCTS' && e.quantityLimit !== null)

        if (productEntitlement && branchId) {
          const tenantPrisma = getTenantPrisma(businessId, branchId)
          const currentProductCount = await tenantPrisma.product.count({
            where: { businessId, branchId },
          })

          if (currentProductCount >= productEntitlement.quantityLimit!) {
            return {
              allowed: false,
              reason: `Product limit reached (${productEntitlement.quantityLimit}) for this branch. Upgrade your plan to add more products.`,
            }
          }
        }
        break
      }

      // Add other models as needed
      default:
        // No specific limit check for this model
        break
    }

    // All checks passed
    return { allowed: true }
  } catch (error) {
    console.error('[crudAPI] Entitlement check failed:', error)
    // On error, allow the operation (fail open)
    // This prevents entitlement check failures from blocking legitimate operations
    return { allowed: true }
  }
}

// --- SERVER FUNCTION ---

const crudServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ context, data }): Promise<{ value: any } | { error: any }> => {
    // ---------------------------------------------------------------------------
    // SECURITY GATES - Phase 0: Authorization Foundation
    // ---------------------------------------------------------------------------
    // 1. Permission Check: Verify user has required permission for this operation
    // 2. Entitlement Check: Verify subscription limits for create operations
    // ---------------------------------------------------------------------------

    // Gate 1: Permission Check
    const requiredPermission = getRequiredPermission(data.table, data.action)

    if (requiredPermission) {
      const userPermissions = context.authorization?.permissions || []
      const hasPermission = userPermissions.includes(requiredPermission)

      if (!hasPermission) {
        return {
          error: `Permission denied: ${requiredPermission} required for ${data.action} on ${data.table}`,
        }
      }
    }

    // Gate 2: Entitlement Check (for create operations on limited models)
    if (requiresEntitlementCheck(data.table, data.action)) {
      // Check subscription limits before allowing create
      const entitlementCheck = await checkEntitlements(context, data.table)

      if (!entitlementCheck.allowed) {
        return {
          error: entitlementCheck.reason || `Subscription limit reached for ${data.table}`,
        }
      }
    }

    // Execute the operation
    const tenantPrisma = getTenantPrisma(context.user.businessId, context.user.branchId!)

    // Reuses the core engine passing the global prisma client instance
    const result = await ResultAsync.fromPromise(executeOperation(tenantPrisma, data), (e: any) => e.message || 'Database operation failed')

    return result.isOk() ? { value: result.value } : { error: result.error }
  })

// --- EXPORTED PUBLIC API ---

export const crudAPI = new Proxy({} as CrudProxy, {
  get(_, table: string) {
    return async (action: string, args: any) => {
      const response = await crudServerFn({
        data: { table, action, args },
      })

      if ('error' in response) {
        return err(response.error as string)
      }

      return ok(response.value as any)
    }
  },
})
