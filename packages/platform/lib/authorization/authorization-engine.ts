/**
 * authorization-engine.ts - Phase 0: Authorization System Foundation
 *
 * Core permission checking engine. Mirrors the EntitlementEngine pattern.
 *
 * Architecture:
 *   Infrastructure fetches data â†’ Engine evaluates permissions â†’ Infrastructure acts on result
 *
 * Evaluation order:
 *   1. Get role default permissions
 *   2. Get user-specific grants from database
 *   3. Get user-specific revokes from database
 *   4. Calculate final permission set (defaults + grants - revokes)
 *   5. Return result
 *
 * Usage:
 *   const result = await AuthorizationEngine.check(Permissions.BUSINESS_VIEW_BILLING, context)
 *   if (!result.granted) throw new Error(result.reason)
 */

import { permissionCollection, userPermissionCollection } from '../../db/collections'
import { coreAPI } from '@platform/lib/prisma-client/core-api'
import type { PermissionKey } from './permission-keys'
import { getDefaultPermissionsForRole } from './role-permissions'

export interface AuthorizationContext {
  userId: string
  role: string
  branchId?: string
  businessId?: string
}

export interface PermissionSummary {
  permissions: PermissionKey[]
  role: string
  customGrants: PermissionKey[] // Permissions added beyond role defaults
  customRevokes: PermissionKey[] // Permissions removed from role defaults
}

export interface PermissionCheckResult {
  granted: boolean
  reason?: string | undefined
}

export interface MultiPermissionCheckResult {
  granted: boolean
  missing?: PermissionKey[] | undefined
  matched?: PermissionKey[] | undefined
}

/**
 * AuthorizationEngine - Permission checking system
 * Mirrors the EntitlementEngine pattern for capabilities
 */
export const AuthorizationEngine = {
  /**
   * Build a complete permission summary for a user.
   * This is called once at session load and cached in authStore.
   *
   * OFFLINE SUPPORT: Reads from collections instead of database for offline capability.
   *
   * @param ctx - Authorization context with userId and role
   * @returns PermissionSummary with final permissions and custom grants/revokes
   *
   * @example
   * const summary = await AuthorizationEngine.buildSummary({ userId: '123', role: 'ADMIN' })
   * console.log(summary.permissions) // ['business:view:billing', ...]
   */
  async buildSummary(ctx: AuthorizationContext): Promise<PermissionSummary> {
    // 1. Get role default permissions
    const roleDefaults = getDefaultPermissionsForRole(ctx.role)

    // 2. Get user-specific permission grants/revokes
    const now = new Date()

    // Check if we're on the server or client
    const isServer = typeof window === 'undefined'

    let userPermissions: Array<{ userId: string; permissionId: string; granted: boolean; expiresAt: Date | null }>
    let allPermissions: Array<{ id: string; key: string }>

    if (isServer) {
      // Server-side: use Prisma directly (rootPrisma for platform-wide permissions table)
      const { prisma: rootPrisma } = await import('@platform/lib/prisma-client')

      // Fetch user permissions from database
      const dbUserPermissions = await rootPrisma.userPermission.findMany({
        where: {
          userId: ctx.userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          userId: true,
          permissionId: true,
          granted: true,
          expiresAt: true,
        },
      })

      // Fetch all permissions to build the map
      const dbPermissions = await rootPrisma.permission.findMany({
        select: {
          id: true,
          key: true,
        },
      })

      userPermissions = dbUserPermissions
      allPermissions = dbPermissions
    } else {
      // Client-side: use collections (offline-capable)
      const allUserPermissions = [...userPermissionCollection.values()]
      userPermissions = allUserPermissions.filter(up => {
        // Filter for this user and non-expired permissions
        if (up.userId !== ctx.userId) return false
        if (up.expiresAt && new Date(up.expiresAt) <= now) {
          return false
        }
        return true
      })

      // Get all permissions from collection
      allPermissions = [...permissionCollection.values()]
    }

    const permissionMap = new Map(allPermissions.map(p => [p.id, p.key]))

    // 3. Separate grants and revokes
    const grants = userPermissions
      .filter(up => up.granted)
      .map(up => permissionMap.get(up.permissionId) as PermissionKey)
      .filter(Boolean) // Remove undefined values

    const revokes = userPermissions
      .filter(up => !up.granted)
      .map(up => permissionMap.get(up.permissionId) as PermissionKey)
      .filter(Boolean) // Remove undefined values

    // 4. Calculate final permission set
    const finalPermissions = new Set<PermissionKey>([...roleDefaults, ...grants])

    // Remove explicitly revoked permissions
    revokes.forEach(permission => {
      finalPermissions.delete(permission)
    })

    // 5. Calculate custom grants and revokes for UI display
    const customGrants = grants.filter(p => !roleDefaults.includes(p))
    const customRevokes = revokes.filter(p => roleDefaults.includes(p))

    return {
      permissions: Array.from(finalPermissions),
      role: ctx.role,
      customGrants,
      customRevokes,
    }
  },

  /**
   * Check if a user has a specific permission.
   * Used in server-side middleware and server functions.
   *
   * @param permission - Permission key to check (e.g., Permissions.BUSINESS_VIEW_BILLING)
   * @param ctx - Authorization context with userId and role
   * @returns PermissionCheckResult with granted status and optional reason
   *
   * @example
   * const result = await AuthorizationEngine.check(Permissions.BUSINESS_MANAGE_BILLING, ctx)
   * if (!result.granted) throw new Error(result.reason)
   */
  async check(permission: PermissionKey, ctx: AuthorizationContext): Promise<PermissionCheckResult> {
    const summary = await this.buildSummary(ctx)

    const granted = summary.permissions.includes(permission)

    return {
      granted,
      reason: granted ? undefined : `Permission ${permission} not granted to user`,
    }
  },

  /**
   * Check multiple permissions at once.
   * Returns true only if ALL permissions are granted.
   *
   * @param permissions - Array of permission keys to check
   * @param ctx - Authorization context with userId and role
   * @returns MultiPermissionCheckResult with granted status and missing permissions
   *
   * @example
   * const result = await AuthorizationEngine.checkAll([
   *   Permissions.BRANCH_VIEW_EMPLOYEES,
   *   Permissions.BRANCH_MANAGE_EMPLOYEES
   * ], ctx)
   * if (!result.granted) console.log('Missing:', result.missing)
   */
  async checkAll(permissions: PermissionKey[], ctx: AuthorizationContext): Promise<MultiPermissionCheckResult> {
    const summary = await this.buildSummary(ctx)

    const missing = permissions.filter(p => !summary.permissions.includes(p))

    return {
      granted: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
    }
  },

  /**
   * Check if user has ANY of the given permissions.
   * Returns true if at least ONE permission is granted.
   *
   * @param permissions - Array of permission keys to check
   * @param ctx - Authorization context with userId and role
   * @returns MultiPermissionCheckResult with granted status and matched permissions
   *
   * @example
   * const result = await AuthorizationEngine.checkAny([
   *   Permissions.BUSINESS_VIEW_BILLING,
   *   Permissions.BUSINESS_MANAGE_BILLING
   * ], ctx)
   * if (result.granted) console.log('Has:', result.matched)
   */
  async checkAny(permissions: PermissionKey[], ctx: AuthorizationContext): Promise<MultiPermissionCheckResult> {
    const summary = await this.buildSummary(ctx)

    const matched = permissions.filter(p => summary.permissions.includes(p))

    return {
      granted: matched.length > 0,
      matched: matched.length > 0 ? matched : undefined,
    }
  },

  /**
   * Grant a permission to a user.
   * Can be used to add permissions beyond role defaults.
   *
   * OFFLINE SUPPORT: Writes to database which will sync to collections when online.
   * Collections auto-sync on successful mutation.
   *
   * @param userId - ID of user to grant permission to
   * @param permissionKey - Permission key to grant
   * @param grantedBy - ID of user granting the permission
   * @param note - Optional reason for grant
   * @param expiresAt - Optional expiration date for temporary grants
   *
   * @example
   * await AuthorizationEngine.grant(
   *   'user123',
   *   Permissions.BUSINESS_MANAGE_BILLING,
   *   'admin456',
   *   'Temporary access for quarterly review',
   *   new Date('2026-12-31')
   * )
   */
  async grant(userId: string, permissionKey: PermissionKey, grantedBy: string, note?: string, expiresAt?: Date): Promise<void> {
    // Find permission in collection first (offline-capable lookup)
    const permission = [...permissionCollection.values()].find(p => p.key === permissionKey)

    if (!permission) {
      throw new Error(`Permission ${permissionKey} not found`)
    }

    // Upsert to database (will sync to collection automatically)
    const upsertResult = await coreAPI.userPermission('upsert', {
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id,
        },
      },
      create: {
        userId,
        permissionId: permission.id,
        granted: true,
        grantedBy,
        note: note ?? null,
        expiresAt: expiresAt ?? null,
      },
      update: {
        granted: true,
        grantedBy,
        grantedAt: new Date(),
        note: note ?? null,
        expiresAt: expiresAt ?? null,
      },
    })

    if (upsertResult.isErr()) {
      throw new Error(`Failed to grant permission: ${upsertResult.error}`)
    }
  },

  /**
   * Revoke a permission from a user.
   * Creates an explicit revoke record that overrides role defaults.
   *
   * OFFLINE SUPPORT: Writes to database which will sync to collections when online.
   *
   * @param userId - ID of user to revoke permission from
   * @param permissionKey - Permission key to revoke
   * @param revokedBy - ID of user revoking the permission
   * @param note - Optional reason for revoke
   *
   * @example
   * await AuthorizationEngine.revoke(
   *   'user123',
   *   Permissions.BRANCH_DELETE_PRODUCT,
   *   'admin456',
   *   'Training period - read-only access for now'
   * )
   */
  async revoke(userId: string, permissionKey: PermissionKey, revokedBy: string, note?: string): Promise<void> {
    // Find permission in collection first (offline-capable lookup)
    const permission = [...permissionCollection.values()].find(p => p.key === permissionKey)

    if (!permission) {
      throw new Error(`Permission ${permissionKey} not found`)
    }

    // Upsert to database (will sync to collection automatically)
    const upsertResult = await coreAPI.userPermission('upsert', {
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id,
        },
      },
      create: {
        userId,
        permissionId: permission.id,
        granted: false,
        grantedBy: revokedBy,
        note: note ?? null,
      },
      update: {
        granted: false,
        grantedBy: revokedBy,
        grantedAt: new Date(),
        note: note ?? null,
      },
    })

    if (upsertResult.isErr()) {
      throw new Error(`Failed to revoke permission: ${upsertResult.error}`)
    }
  },

  /**
   * Remove a permission override (grant or revoke).
   * Returns user to role default for this permission.
   *
   * OFFLINE SUPPORT: Deletes from database which will sync to collections when online.
   *
   * @param userId - ID of user to reset permission for
   * @param permissionKey - Permission key to reset
   *
   * @example
   * await AuthorizationEngine.resetToDefault('user123', Permissions.BRANCH_MANAGE_PRODUCTS)
   */
  async resetToDefault(userId: string, permissionKey: PermissionKey): Promise<void> {
    // Find permission in collection first (offline-capable lookup)
    const permission = [...permissionCollection.values()].find(p => p.key === permissionKey)

    if (!permission) return

    // Delete from database (will sync to collection automatically)
    const deleteResult = await coreAPI.userPermission('deleteMany', {
      where: {
        userId,
        permissionId: permission.id,
      },
    })

    if (deleteResult.isErr()) {
      throw new Error(`Failed to reset permission: ${deleteResult.error}`)
    }
  },
}
