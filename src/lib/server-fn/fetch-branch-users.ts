/**
 * fetch-branch-users.ts — Fetch all users for a branch
 *
 * Used by the branch settings UI to populate the offline terminal dropdown.
 * Returns all users with memberships in the specified branch, regardless of role.
 */

import { createServerFn } from '@tanstack/react-start'
import { Permissions } from '@startpos-core/lib/authorization/permission-keys'
import { authMiddleware } from '@startpos-core/lib/better-auth/auth-middleware'
import { requirePermission } from '@startpos-core/lib/better-auth/permission-middleware'
import { getTenantPrisma } from '@startpos-core/lib/prisma-client'

export const fetchBranchUsers = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_EMPLOYEES)])
  .inputValidator((data: { branchId: string }) => data)
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { success: false as const, error: 'Unauthorized' }
    }

    const { businessId } = context.user
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
