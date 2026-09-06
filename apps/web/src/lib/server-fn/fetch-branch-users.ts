/**
 * fetch-branch-users.ts — Fetch all users for a branch
 *
 * Used by the branch settings UI to populate the offline terminal dropdown.
 * Returns all users with memberships in the specified branch, regardless of role.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { getTenantPrisma } from '@/lib/prisma-client'

export const fetchBranchUsers = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_EMPLOYEES), requireTenantContext()])
  .inputValidator((data: { branchId: string }) => data)
  .handler(async ({ data, context }) => {
    const { businessId } = getTenantContext(context).user
    const prisma = getTenantPrisma(businessId, data.branchId)

    try {
      const users = await prisma.user.findMany({
        where: {
          memberships: {
            some: {
              businessId,
              branchId: data.branchId,
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      })

      return {
        success: true as const,
        users,
      }
    } catch (error) {
      console.error('[fetchBranchUsers] Error:', error)
      return { success: false as const, error: 'Failed to fetch branch users' }
    }
  })
