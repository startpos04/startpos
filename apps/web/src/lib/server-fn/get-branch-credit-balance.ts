/**
 * get-branch-credit-balance.ts
 *
 * Server function: fetch the current credit balance for a branch.
 *
 * Architecture:
 *   - Reads the most recent CreditLedger entry for this branch
 *   - The `balanceAfter` field is a running snapshot (O(1) lookup, no SUM needed)
 *   - Returns 0 if no ledger entries exist yet
 *
 * Used by:
 *   - Branch billing dashboard (/billing)
 *   - Transaction processing (to validate sufficient credits)
 *   - Business consolidated credit view
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'

// ---------------------------------------------------------------------------
// getBranchCreditBalance server function
// ---------------------------------------------------------------------------

export const getBranchCreditBalance = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_BILLING), requireTenantContext()])
  .handler(async ({ context }) => {
    const { businessId, branchId } = getTenantContext(context).user

    const { prisma: rootPrisma } = await import('@platform/lib/prisma-client')

    // Verify branch belongs to this business (security check)
    const branch = await rootPrisma.branch.findFirst({
      where: { id: branchId, businessId },
      select: { id: true, name: true },
    })

    if (!branch) {
      return {
        success: false as const,
        error: 'Branch not found or does not belong to this business',
        balance: 0,
      }
    }

    // Get the most recent ledger entry for this branch
    // The balanceAfter field contains the current balance
    const latestEntry = await rootPrisma.creditLedger.findFirst({
      where: { businessId, branchId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true, createdAt: true },
    })

    return {
      success: true as const,
      balance: latestEntry?.balanceAfter ?? 0,
      branchId: branch.id,
      branchName: branch.name,
      lastUpdated: latestEntry?.createdAt,
    }
  })

// ---------------------------------------------------------------------------
// getAllBranchCreditBalances - for business consolidated view
// ---------------------------------------------------------------------------

export const getAllBranchCreditBalances = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING), requireTenantContext()])
  .handler(async ({ context }) => {
    const { businessId } = getTenantContext(context).user
    const { prisma: rootPrisma } = await import('@platform/lib/prisma-client')

    // Get all branches for this business
    const branches = await rootPrisma.branch.findMany({
      where: { businessId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    // For each branch, get the latest credit balance
    const branchBalances = await Promise.all(
      branches.map(async branch => {
        const latestEntry = await rootPrisma.creditLedger.findFirst({
          where: { businessId, branchId: branch.id },
          orderBy: { createdAt: 'desc' },
          select: { balanceAfter: true, createdAt: true },
        })

        return {
          branchId: branch.id,
          branchName: branch.name,
          balance: latestEntry?.balanceAfter ?? 0,
          lastUpdated: latestEntry?.createdAt,
        }
      }),
    )

    // Calculate total credits across all branches
    const totalCredits = branchBalances.reduce((sum, b) => sum + b.balance, 0)

    return {
      success: true as const,
      branches: branchBalances,
      totalCredits,
      branchCount: branches.length,
    }
  })
