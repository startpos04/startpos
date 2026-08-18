/**
 * update-branch.ts
 *
 * Server function that updates a Branch's name, address, and country.
 * Uses rootPrisma — Branch is a platform-level entity.
 *
 * The branchCollection is eager-synced so the local collection will reflect
 * the change on the next server sync. No manual collection.update needed.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { prisma as rootPrisma } from '@/lib/prisma-client'

export const UpdateBranchInputSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1).max(100),
  address: z.string().max(255).optional(),
  country: z.string().length(2).default('PH'),
})

export type UpdateBranchInput = z.infer<typeof UpdateBranchInputSchema>

export const updateBranch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: UpdateBranchInput) => UpdateBranchInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'Not authenticated' }
    }

    const { businessId } = context.user as typeof context.user & { businessId: string }

    // Confirm the branch belongs to this business before updating
    const existing = await rootPrisma.branch.findUnique({
      where: { id: data.branchId },
      select: { businessId: true, deletedAt: true },
    })

    if (!existing || existing.businessId !== businessId || existing.deletedAt) {
      return { success: false as const, error: 'Branch not found' }
    }

    const branch = await rootPrisma.branch.update({
      where: { id: data.branchId },
      data: {
        name: data.name.trim(),
        address: data.address?.trim() ?? null,
        country: data.country,
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
