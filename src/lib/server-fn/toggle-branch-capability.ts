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

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { Capabilities, type CapabilityKey } from '../entitlement/capability-keys'
import { prisma as rootPrisma } from '../prisma-client'

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
// Example: "CREATE_ORDER" → "ENABLE_CREATE_ORDER"
// ---------------------------------------------------------------------------

function getConfigKey(capabilityKey: CapabilityKey): string {
  return `ENABLE_${capabilityKey}`
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const toggleBranchCapability = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_MANAGE_SETTINGS)])
  .inputValidator((data: ToggleBranchCapabilityInput) => ToggleBranchCapabilitySchema.parse(data))
  .handler(async ({ context, data }): Promise<{ success: boolean; message?: string }> => {
    const businessId = context?.user?.businessId
    const branchId = context?.user?.branchId

    if (!businessId || !branchId) {
      return { success: false, message: 'Authentication required' }
    }

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
        message: enabled 
          ? `${capabilityKey} enabled for this branch` 
          : `${capabilityKey} disabled for this branch`,
      }
    } catch (error) {
      console.error('[toggleBranchCapability] Error:', error)
      return {
        success: false,
        message: 'Failed to update capability state',
      }
    }
  })
