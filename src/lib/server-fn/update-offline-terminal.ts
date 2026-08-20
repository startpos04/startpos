/**
 * update-offline-terminal.ts — Update branch offline terminal designation
 *
 * Phase 2: Offline checkout restriction
 * Sets which user can perform checkouts while offline for a given branch.
 * Only one user per branch can be designated as the offline terminal.
 * Setting null blocks all offline checkouts for that branch.
 */

import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '../better-auth/auth-middleware'
import { getTenantPrisma } from '../prisma-client'

export const updateOfflineTerminal = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { branchId: string; offlineTerminalId: string | null }) => data)
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { success: false as const, error: 'Unauthorized' }
    }

    const { businessId } = context.user
    const prisma = getTenantPrisma(businessId, data.branchId)

    try {
      // Verify the branch exists and belongs to this business
      const branch = await prisma.branch.findFirst({
        where: {
          id: data.branchId,
          businessId,
        },
      })

      if (!branch) {
        return { success: false as const, error: 'Branch not found' }
      }

      // If setting a user, verify they have membership in this branch
      if (data.offlineTerminalId) {
        const membership = await prisma.membership.findFirst({
          where: {
            userId: data.offlineTerminalId,
            businessId,
            branchId: data.branchId,
          },
        })

        if (!membership) {
          return { success: false as const, error: 'User is not a member of this branch' }
        }
      }

      // Update the branch's offlineTerminalId
      await prisma.branch.update({
        where: { id: data.branchId },
        data: { offlineTerminalId: data.offlineTerminalId },
      })

      return { success: true as const }
    } catch (error) {
      console.error('[updateOfflineTerminal] Error:', error)
      return { success: false as const, error: 'Failed to update offline terminal designation' }
    }
  })
