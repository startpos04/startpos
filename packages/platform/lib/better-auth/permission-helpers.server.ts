/**
 * permission-helpers.server.ts — Server-only permission check utilities
 *
 * These are for manual permission checks inside server function handlers,
 * when you need conditional logic based on permissions.
 *
 * For middleware-based enforcement, use permission-middleware.ts instead.
 */

import type { Role } from 'prisma/generated/prisma/enums'
import { buildSummaryFromDatabase } from '../authorization/authorization-engine.server'
import type { PermissionKey } from '../authorization/permission-keys'

/**
 * Check if a user has a specific permission.
 * Queries the database directly - only use in server function handlers.
 */
export async function checkPermission(userId: string, role: Role, permission: PermissionKey): Promise<boolean> {
  const authorization = await buildSummaryFromDatabase({ userId, role })
  return authorization.permissions.includes(permission)
}

/**
 * Check if a user has ALL of the specified permissions.
 * Queries the database directly - only use in server function handlers.
 */
export async function checkAllPermissions(userId: string, role: Role, permissions: PermissionKey[]): Promise<boolean> {
  const authorization = await buildSummaryFromDatabase({ userId, role })
  return permissions.every(p => authorization.permissions.includes(p))
}

/**
 * Check if a user has ANY of the specified permissions.
 * Queries the database directly - only use in server function handlers.
 */
export async function checkAnyPermission(userId: string, role: Role, permissions: PermissionKey[]): Promise<boolean> {
  const authorization = await buildSummaryFromDatabase({ userId, role })
  return permissions.some(p => authorization.permissions.includes(p))
}
