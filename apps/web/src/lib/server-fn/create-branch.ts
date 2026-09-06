/**
 * create-branch.ts
 *
 * Server function that creates a new Branch for the authenticated business.
 * Uses rootPrisma because Branch is a platform-level entity (like Business)
 * and must be created outside tenant-scoped Prisma isolation.
 *
 * After creation, the branchCollection sync will pick it up on the next
 * eager refresh — no manual collection.insert needed here.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'

export const CreateBranchInputSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(255).optional(),
  country: z.string().length(2).default('PH'),
})

export type CreateBranchInput = z.infer<typeof CreateBranchInputSchema>

export const createBranch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_CREATE_BRANCH), requireTenantContext()])
  .inputValidator((data: CreateBranchInput) => CreateBranchInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId } = getTenantContext(context).user

    // Check current branch count
    const currentBranchCount = await rootPrisma.branch.count({
      where: { businessId, deletedAt: null },
    })

    // Check branch limit from subscription plan
    const subscription = await rootPrisma.businessSubscription.findUnique({
      where: { businessId },
      select: {
        plan: {
          select: {
            entitlements: {
              where: { featureKey: 'MANAGE_BRANCHES' },
              select: { usageLimit: true },
            },
          },
        },
      },
    })

    // Check for branch add-ons
    const activeBranchAddons = await rootPrisma.businessSubscriptionAddon.findMany({
      where: {
        businessId,
        addonType: 'BRANCH',
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      select: { quantity: true },
    })

    const branchEntitlement = subscription?.plan.entitlements[0]
    const planBranchLimit = branchEntitlement?.usageLimit ?? 0 // 0 means no access
    const addonBranchCount = activeBranchAddons.reduce((sum, addon) => sum + addon.quantity, 0)
    const totalBranchLimit = planBranchLimit === -1 ? -1 : planBranchLimit + addonBranchCount // -1 means unlimited

    if (totalBranchLimit !== -1 && currentBranchCount >= totalBranchLimit) {
      return {
        success: false as const,
        error: `Branch limit reached. Your plan allows ${totalBranchLimit} branch${totalBranchLimit === 1 ? '' : 'es'}. Consider upgrading your plan or purchasing branch add-ons.`,
      }
    }

    // Derive a sequential branch code from the existing branch count
    const nextCode = String(currentBranchCount + 1).padStart(5, '0')

    const branch = await rootPrisma.branch.create({
      data: {
        name: data.name.trim(),
        address: data.address?.trim() ?? null,
        country: data.country,
        businessId,
        serialNumber: `SN-${Date.now()}`,
        minInvoiceNo: 1,
        maxInvoiceNo: 99999,
        branchCode: nextCode,
      },
      select: {
        id: true,
        name: true,
        address: true,
        country: true,
        branchCode: true,
        serialNumber: true,
      },
    })

    return { success: true as const, branch }
  })
