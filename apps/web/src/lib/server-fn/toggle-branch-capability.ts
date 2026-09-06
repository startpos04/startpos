/**
 * toggle-branch-capability.ts — Enable or disable a capability at the branch level
 *
 * This allows branch managers to control which capabilities are active for their
 * specific branch, independent of other branches in the business.
 *
 * The implementation uses BusinessConfiguration entries with keys like:
 *   ENABLE_CREATE_ORDER = "true" | "false"
 *
 * These are read by the EntitlementEngine and added to branchDisabledFeatures
 * when set to "false".
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { Capabilities, type CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const ToggleBranchCapabilitySchema = z.object({
  capabilityKey: z.string().refine((val): val is CapabilityKey => {
    return Object.values(Capabilities).includes(val as CapabilityKey)
  }, 'Invalid capability key'),
  enabled: z.boolean(),
})

type ToggleBranchCapabilityInput = z.infer<typeof ToggleBranchCapabilitySchema>

// ---------------------------------------------------------------------------
// Helper: Convert capability key to config key
// Example: "CREATE_ORDER" â†’ "ENABLE_CREATE_ORDER"
// ---------------------------------------------------------------------------

function _getConfigKey(capabilityKey: CapabilityKey): string {
  return `ENABLE_${capabilityKey}`
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const toggleBranchCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_MANAGE_SETTINGS), requireTenantContext()])
  .inputValidator((data: ToggleBranchCapabilityInput) => ToggleBranchCapabilitySchema.parse(data))
  .handler(async ({ context, data }): Promise<{ success: boolean; message?: string }> => {
    const { businessId, branchId } = getTenantContext(context).user

    const { capabilityKey, enabled } = data

    try {
      // Upsert the branch-level capability config
      await rootPrisma.branchCapabilityConfig.upsert({
        where: {
          branchId_capabilityId: {
            branchId,
            capabilityId: capabilityKey,
          },
        },
        create: {
          branchId,
          capabilityId: capabilityKey,
          enabled,
        },
        update: {
          enabled,
        },
      })

      return {
        success: true,
        message: enabled ? `${capabilityKey} enabled for this branch` : `${capabilityKey} disabled for this branch`,
      }
    } catch (error) {
      console.error('[toggleBranchCapability] Error:', error)
      return {
        success: false,
        message: 'Failed to update capability state',
      }
    }
  })
