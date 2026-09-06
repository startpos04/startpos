/**
 * prisma-client/index.ts — Web-layer Prisma client superset
 *
 * Re-exports the platform base client (prisma, softDeleteExtension) and
 * adds the web-specific tenant-scoped client (getTenantPrisma).
 *
 * Tenant scoping is a web-app concern — the Business/Branch model belongs
 * here, not in the platform package.
 *
 * All apps/web code should import from '@/lib/prisma-client', not from
 * '@platform/lib/prisma-client', so that getTenantPrisma resolves here.
 */

// Re-export platform base (global client + soft-delete extension)
export { prisma } from '@platform/lib/prisma-client'

// Web-specific: tenant-scoped client
import { prisma } from '@platform/lib/prisma-client'
import { multiTenantExtension, type TenantAwareClient } from './multi-tenant-extension'

export type { TenantAwareClient }

/**
 * getTenantPrisma — returns a Prisma client scoped to a specific business/branch.
 *
 * Every query issued through the returned client automatically has
 * `businessId` and `branchId` injected — callers never pass them manually.
 * Attempting to query data belonging to a different business throws immediately.
 *
 * @param businessId  Required — the business to scope all queries to
 * @param branchId    Optional — also scope to a specific branch
 */
export const getTenantPrisma = (businessId: string, branchId?: string) => {
  const scopedClient = prisma.$extends(multiTenantExtension(businessId, branchId))
  return scopedClient as unknown as TenantAwareClient<typeof scopedClient>
}

export type TenantPrismaClient = ReturnType<typeof getTenantPrisma>
