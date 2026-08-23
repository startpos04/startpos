/**
 * permission-management.ts — Server functions for permission management
 *
 * Provides functions for admins to:
 * - List all users with their permissions
 * - Grant custom permissions to users
 * - Revoke custom permissions from users
 * - View permission audit history
 *
 * All functions require USER.MANAGE_PERMISSIONS permission.
 */

import { createServerFn } from '@tanstack/react-start'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { coreAPI } from '../prisma-client/core-api'
import { crudAPI } from '../prisma-client/crud-api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserWithPermissions {
  id: string
  name: string | null
  email: string
  role: string
  image: string | null
  customGrants: Array<{
    id: string
    permissionId: string
    permission: {
      key: string
      name: string
      description: string | null
      scope: string
      action: string
      resource: string
    }
    grantedBy: string | null
    grantedAt: Date | null
    reason: string | null
  }>
  customRevokes: Array<{
    id: string
    permissionId: string
    permission: {
      key: string
      name: string
      description: string | null
      scope: string
      action: string
      resource: string
    }
    revokedBy: string | null
    revokedAt: Date | null
    reason: string | null
  }>
}

export interface PermissionDefinition {
  id: string
  key: string
  name: string
  description: string | null
  scope: string
  action: string
  resource: string
  category: string | null
}

// ---------------------------------------------------------------------------
// Fetch all users with their permissions
// ---------------------------------------------------------------------------

/**
 * Fetch all users in the business with their custom permission grants and revokes.
 * Returns users with their role-based permissions and custom overrides.
 */
export const fetchUsersWithPermissions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .handler(async ({ context }): Promise<{ users: UserWithPermissions[] }> => {
    const { businessId, branchId } = context.user

    // Fetch all users in the business
    const usersResult = await crudAPI.user('findMany', {
      where: {
        memberships: {
          some: {
            businessId,
            branchId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    if (usersResult.isErr()) {
      throw new Error('Failed to fetch users')
    }

    const users = usersResult.value

    // Fetch custom permissions for all users
    const userIds = users.map(u => u.id)
    const userPermissionsResult = await coreAPI.userPermission('findMany', {
      where: {
        userId: { in: userIds },
      },
      include: {
        permission: {
          select: {
            id: true,
            key: true,
            name: true,
            description: true,
            scope: true,
            action: true,
            resource: true,
          },
        },
      },
    })

    if (userPermissionsResult.isErr()) {
      throw new Error('Failed to fetch user permissions')
    }

    const userPermissions = userPermissionsResult.value

    // Group permissions by user
    const permissionsByUser = userPermissions.reduce(
      (acc, up) => {
        if (!acc[up.userId]) {
          acc[up.userId] = { grants: [], revokes: [] }
        }
        if (up.granted) {
          acc[up.userId].grants.push(up)
        } else {
          acc[up.userId].revokes.push(up)
        }
        return acc
      },
      {} as Record<string, { grants: any[]; revokes: any[] }>,
    )

    // Combine users with their permissions
    const usersWithPermissions: UserWithPermissions[] = users.map(user => ({
      ...user,
      customGrants: permissionsByUser[user.id]?.grants || [],
      customRevokes: permissionsByUser[user.id]?.revokes || [],
    }))

    return { users: usersWithPermissions }
  })

// ---------------------------------------------------------------------------
// Fetch all available permissions
// ---------------------------------------------------------------------------

/**
 * Fetch all permission definitions available in the system.
 * Used to populate the permission selection UI.
 */
export const fetchAllPermissions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .handler(async (): Promise<{ permissions: PermissionDefinition[] }> => {
    const permissionsResult = await coreAPI.permission('findMany', {
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        scope: true,
        action: true,
        resource: true,
        category: true,
      },
      orderBy: [{ scope: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    })

    if (permissionsResult.isErr()) {
      throw new Error('Failed to fetch permissions')
    }

    return { permissions: permissionsResult.value }
  })

// ---------------------------------------------------------------------------
// Grant custom permission to user
// ---------------------------------------------------------------------------

/**
 * Grant a custom permission to a user.
 * Creates or updates a UserPermission record with granted=true.
 */
export const grantPermissionToUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .inputValidator((data: { userId: string; permissionKey: string; reason?: string }) => data)
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    const { userId: grantedBy } = context.user
    const { userId, permissionKey, reason } = data

    // Verify target user exists
    const userResult = await crudAPI.user('findUnique', {
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    })

    if (userResult.isErr() || !userResult.value) {
      throw new Error('User not found')
    }

    const targetUser = userResult.value

    // Fetch permission by key
    const permissionResult = await coreAPI.permission('findUnique', {
      where: { key: permissionKey },
      select: { id: true, name: true },
    })

    if (permissionResult.isErr() || !permissionResult.value) {
      throw new Error('Permission not found')
    }

    const permission = permissionResult.value

    // Cannot grant permissions to OWNER role
    if (targetUser.role === 'OWNER') {
      throw new Error('Cannot grant custom permissions to OWNER role. Owners have all permissions by default.')
    }

    // Grant permission (upsert to handle existing records)
    const grantResult = await coreAPI.userPermission('upsert', {
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
        grantedAt: new Date(),
        reason: reason || `Granted by admin`,
      },
      update: {
        granted: true,
        grantedBy,
        grantedAt: new Date(),
        reason: reason || `Granted by admin`,
        revokedBy: null,
        revokedAt: null,
      },
    })

    if (grantResult.isErr()) {
      throw new Error('Failed to grant permission')
    }

    return {
      success: true,
      message: `Successfully granted "${permission.name}" to ${targetUser.name || targetUser.email}`,
    }
  })

// ---------------------------------------------------------------------------
// Revoke custom permission from user
// ---------------------------------------------------------------------------

/**
 * Revoke a custom permission from a user.
 * Updates a UserPermission record with granted=false, or creates one if it doesn't exist
 * (to explicitly block a role-default permission).
 */
export const revokePermissionFromUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .inputValidator((data: { userId: string; permissionKey: string; reason?: string }) => data)
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    const { userId: revokedBy } = context.user
    const { userId, permissionKey, reason } = data

    // Verify target user exists
    const userResult = await crudAPI.user('findUnique', {
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    })

    if (userResult.isErr() || !userResult.value) {
      throw new Error('User not found')
    }

    const targetUser = userResult.value

    // Fetch permission by key
    const permissionResult = await coreAPI.permission('findUnique', {
      where: { key: permissionKey },
      select: { id: true, name: true },
    })

    if (permissionResult.isErr() || !permissionResult.value) {
      throw new Error('Permission not found')
    }

    const permission = permissionResult.value

    // Cannot revoke permissions from OWNER role
    if (targetUser.role === 'OWNER') {
      throw new Error('Cannot revoke permissions from OWNER role. Owners always have all permissions.')
    }

    // Revoke permission (upsert to handle cases where we're blocking a role default)
    const revokeResult = await coreAPI.userPermission('upsert', {
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
        revokedBy,
        revokedAt: new Date(),
        reason: reason || `Revoked by admin`,
      },
      update: {
        granted: false,
        revokedBy,
        revokedAt: new Date(),
        reason: reason || `Revoked by admin`,
        grantedBy: null,
        grantedAt: null,
      },
    })

    if (revokeResult.isErr()) {
      throw new Error('Failed to revoke permission')
    }

    return {
      success: true,
      message: `Successfully revoked "${permission.name}" from ${targetUser.name || targetUser.email}`,
    }
  })

// ---------------------------------------------------------------------------
// Remove custom permission override (reset to role default)
// ---------------------------------------------------------------------------

/**
 * Remove a custom permission override, allowing the user's role defaults to apply.
 * Deletes the UserPermission record entirely.
 */
export const removePermissionOverride = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .inputValidator((data: { userId: string; permissionKey: string }) => data)
  .handler(async ({ data }): Promise<{ success: boolean; message: string }> => {
    const { userId, permissionKey } = data

    // Verify target user exists
    const userResult = await crudAPI.user('findUnique', {
      where: { id: userId },
      select: { id: true, name: true, email: true },
    })

    if (userResult.isErr() || !userResult.value) {
      throw new Error('User not found')
    }

    const targetUser = userResult.value

    // Fetch permission by key
    const permissionResult = await coreAPI.permission('findUnique', {
      where: { key: permissionKey },
      select: { id: true, name: true },
    })

    if (permissionResult.isErr() || !permissionResult.value) {
      throw new Error('Permission not found')
    }

    const permission = permissionResult.value

    // Delete the custom permission override
    const deleteResult = await coreAPI.userPermission('delete', {
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id,
        },
      },
    })

    if (deleteResult.isErr()) {
      // If the record doesn't exist, that's fine - it means no override exists
      if (deleteResult.error.message?.includes('Record to delete does not exist')) {
        return {
          success: true,
          message: `No custom override exists for "${permission.name}" on ${targetUser.name || targetUser.email}`,
        }
      }
      throw new Error('Failed to remove permission override')
    }

    return {
      success: true,
      message: `Successfully removed custom override for "${permission.name}" from ${targetUser.name || targetUser.email}. Role defaults will now apply.`,
    }
  })
