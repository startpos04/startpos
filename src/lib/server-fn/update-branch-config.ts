/**
 * update-branch-config.ts
 *
 * Two server functions for branch-scoped SystemConfig:
 *
 *   fetchBranchConfig  — reads current ENABLE_* toggle values for a branch
 *   updateBranchConfig — writes one or more ENABLE_* toggle values for a branch
 *
 * Both use rootPrisma because SystemConfig is not a synced collection and
 * SystemConfig writes require direct DB access. Ownership is verified on
 * every call (branchId must belong to the caller's businessId).
 *
 * The ENABLE_* keys written here are the same ones read by auth-server.ts
 * when assembling branchDisabledFeatures for EntitlementEngine.check().
 *
 * Supported branch toggle keys:
 *   ENABLE_ORDER              — controls CREATE_ORDER, EDIT_ACTIVE_ORDER, VIEW_ORDER_HISTORY
 *   ENABLE_ORDER_TAB          — controls CREATE_ORDER, EDIT_ACTIVE_ORDER (order tab UI)
 *   ENABLE_TASK               — controls CREATE_TASK
 *   ENABLE_CASH_RECONCILIATION — controls START_VENDOR_SESSION
 *   ENABLE_PRINT_RECEIPT      — controls PRINT_RECEIPT
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { prisma as rootPrisma } from '@/lib/prisma-client'

// ---------------------------------------------------------------------------
// Branch config shape — only the toggleable ENABLE_* keys
// ---------------------------------------------------------------------------

export type BranchToggleConfig = {
  ENABLE_ORDER: boolean
  ENABLE_ORDER_TAB: boolean
  ENABLE_TASK: boolean
  ENABLE_CASH_RECONCILIATION: boolean
  ENABLE_PRINT_RECEIPT: boolean
}

export const BRANCH_TOGGLE_KEYS = ['ENABLE_ORDER', 'ENABLE_ORDER_TAB', 'ENABLE_TASK', 'ENABLE_CASH_RECONCILIATION', 'ENABLE_PRINT_RECEIPT'] as const

export type BranchToggleKey = (typeof BRANCH_TOGGLE_KEYS)[number]

/** Default values — all features enabled unless branch explicitly disables them */
export const BRANCH_TOGGLE_DEFAULTS: BranchToggleConfig = {
  ENABLE_ORDER: true,
  ENABLE_ORDER_TAB: false,
  ENABLE_TASK: false,
  ENABLE_CASH_RECONCILIATION: false,
  ENABLE_PRINT_RECEIPT: true,
}

// ---------------------------------------------------------------------------
// fetchBranchConfig
// ---------------------------------------------------------------------------

export const fetchBranchConfig = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { branchId: string }) => data)
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'Not authenticated' }
    }

    const { businessId } = context.user as typeof context.user & { businessId: string }

    // Ownership check
    const branch = await rootPrisma.branch.findUnique({
      where: { id: data.branchId },
      select: { businessId: true, deletedAt: true },
    })

    if (!branch || branch.businessId !== businessId || branch.deletedAt) {
      return { success: false as const, error: 'Branch not found' }
    }

    const rows = await rootPrisma.systemConfig.findMany({
      where: {
        branchId: data.branchId,
        scope: 'BRANCH',
        key: { in: BRANCH_TOGGLE_KEYS as unknown as string[] },
      },
      select: { key: true, value: true },
    })

    // Build the config map — start from defaults so unset keys return their default
    const config: BranchToggleConfig = { ...BRANCH_TOGGLE_DEFAULTS }
    for (const row of rows) {
      const k = row.key as BranchToggleKey
      if (BRANCH_TOGGLE_KEYS.includes(k)) {
        config[k] = row.value === 'true'
      }
    }

    return { success: true as const, config }
  })

// ---------------------------------------------------------------------------
// updateBranchConfig
// ---------------------------------------------------------------------------

const UpdateBranchConfigInputSchema = z.object({
  branchId: z.string().min(1),
  config: z.object({
    ENABLE_ORDER: z.boolean(),
    ENABLE_ORDER_TAB: z.boolean(),
    ENABLE_TASK: z.boolean(),
    ENABLE_CASH_RECONCILIATION: z.boolean(),
    ENABLE_PRINT_RECEIPT: z.boolean(),
  }),
})

export type UpdateBranchConfigInput = z.infer<typeof UpdateBranchConfigInputSchema>

export const updateBranchConfig = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: UpdateBranchConfigInput) => UpdateBranchConfigInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'Not authenticated' }
    }

    const { businessId } = context.user as typeof context.user & { businessId: string }

    // Ownership check
    const branch = await rootPrisma.branch.findUnique({
      where: { id: data.branchId },
      select: { businessId: true, deletedAt: true },
    })

    if (!branch || branch.businessId !== businessId || branch.deletedAt) {
      return { success: false as const, error: 'Branch not found' }
    }

    // Upsert each toggle key using the branch-scoped unique constraint
    // @@unique([key, branchId, scope]) → Prisma generates key_branchId_scope
    for (const [key, value] of Object.entries(data.config) as [BranchToggleKey, boolean][]) {
      await rootPrisma.systemConfig.upsert({
        where: {
          key_branchId_scope: {
            key: key as string,
            branchId: data.branchId,
            scope: 'BRANCH',
          },
        },
        update: { value: String(value) },
        create: {
          key: key as string,
          value: String(value),
          scope: 'BRANCH',
          businessId,
          branchId: data.branchId,
        },
      })
    }

    return { success: true as const }
  })
