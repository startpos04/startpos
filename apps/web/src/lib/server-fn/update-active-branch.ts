import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { getTenantPrisma } from '@/lib/prisma-client'

/**
 * updateActiveBranch
 *
 * Updates the user's active branch by switching their membership branchId.
 * This enables the context switcher to allow users to switch between branches
 * they have access to.
 *
 * @param branchId - The ID of the branch to switch to
 * @returns Success result or error message
 */
export const updateActiveBranch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireTenantContext()])
  .inputValidator((data: { branchId: string }) => data)
  .handler(async ({ data, context }) => {
    const { businessId, id: userId } = getTenantContext(context).user
    const { branchId } = data

    // Use root prisma to access membership across all branches
    const { rootPrisma } = getTenantPrisma(businessId, branchId)

    try {
      // Verify the branch exists and belongs to the user's business
      const branch = await rootPrisma.branch.findFirst({
        where: {
          id: branchId,
          businessId,
          deletedAt: null,
        },
      })

      if (!branch) {
        return { success: false as const, error: 'Branch not found or access denied' }
      }

      // Verify user has membership to this business
      const membership = await rootPrisma.membership.findUnique({
        where: {
          userId_businessId: {
            userId,
            businessId,
          },
        },
      })

      if (!membership) {
        return { success: false as const, error: 'User is not a member of this business' }
      }

      // Update the membership to point to the new branch
      await rootPrisma.membership.update({
        where: {
          userId_businessId: {
            userId,
            businessId,
          },
        },
        data: {
          branchId,
        },
      })

      // Update all active sessions for this user to use the new branch
      await rootPrisma.session.updateMany({
        where: {
          userId,
          expiresAt: {
            gt: new Date(), // Only update active sessions
          },
        },
        data: {
          branchId,
        },
      })

      return {
        success: true as const,
        branchId,
        branchName: branch.name,
      }
    } catch (error) {
      console.error('[updateActiveBranch] Error:', error)
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Failed to update active branch',
      }
    }
  })
