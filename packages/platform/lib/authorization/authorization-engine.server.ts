/**
 * authorization-engine.server.ts - Server-only authorization functions
 *
 * This file contains authorization logic that directly queries the database.
 * It should NEVER be imported by client code.
 *
 * For client/universal code, use authorization-engine.ts which reads from collections.
 */

import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import type { AuthorizationContext, PermissionSummary } from './authorization-engine'
import type { PermissionKey } from './permission-keys'
import { getDefaultPermissionsForRole } from './role-permissions'

/**
 * Build a complete permission summary for a user by querying the database directly.
 * This is server-only and should be used when you need fresh data from the database.
 *
 * For most cases, use AuthorizationEngine.buildSummaryFromCollections() instead,
 * which works offline and is faster (reads from memory).
 *
 * @param ctx - Authorization context with userId and role
 * @returns PermissionSummary with final permissions and custom grants/revokes
 *
 * @example
 * const summary = await buildSummaryFromDatabase({ userId: '123', role: 'ADMIN' })
 * console.log(summary.permissions) // ['business:view:billing', ...]
 */
export async function buildSummaryFromDatabase(ctx: AuthorizationContext): Promise<PermissionSummary> {
  // 1. Get role default permissions
  const roleDefaults = getDefaultPermissionsForRole(ctx.role)

  // 2. Get user-specific permission grants/revokes from database
  const now = new Date()

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

  const permissionMap = new Map(dbPermissions.map(p => [p.id, p.key]))

  // 3. Separate grants and revokes
  const grants = dbUserPermissions
    .filter(up => up.granted)
    .map(up => permissionMap.get(up.permissionId) as PermissionKey)
    .filter(Boolean) // Remove undefined values

  const revokes = dbUserPermissions
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
}
