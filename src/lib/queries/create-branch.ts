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

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { prisma as rootPrisma } from '@/lib/prisma-client'

export const CreateBranchInputSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(255).optional(),
  country: z.string().length(2).default('PH'),
})

export type CreateBranchInput = z.infer<typeof CreateBranchInputSchema>

export const createBranch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: CreateBranchInput) => CreateBranchInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'Not authenticated' }
    }

    const { businessId } = context.user as typeof context.user & { businessId: string }

    // Derive a sequential branch code from the existing branch count
    const branchCount = await rootPrisma.branch.count({
      where: { businessId, deletedAt: null },
    })

    const nextCode = String(branchCount + 1).padStart(5, '0')

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
