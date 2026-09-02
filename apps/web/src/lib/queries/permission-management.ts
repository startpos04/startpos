/**
 * permission-management.ts â€” Server functions for permission management
 *
 * Provides functions for admins to:
 * - List all users with their permissions
 * - Grant custom permissions to users
 * - Revoke custom permissions from users
 * - View permission audit history
 *
 * All functions require USER.MANAGE_PERMISSIONS permission.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { coreAPI } from '@platform/lib/prisma-client/core-api'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { createServerFn } from '@tanstack/react-start'
import type { UserPermission } from 'prisma/generated/prisma/browser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// UserPermission with permission relation included
type UserPermissionWithPermission = UserPermission & {
  permission: {
    id: string
    key: string
    name: string
    description: string | null
    scope: string
    action: string
    resource: string
  }
}

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
    grantedBy: string | null
    grantedAt: Date | null
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
// Fetch all permissions with their employee assignments
// ---------------------------------------------------------------------------

export interface PermissionWithEmployees {
  id: string
  key: string
  name: string
  description: string | null
  scope: string
  action: string
  resource: string
  category: string | null
  employeesWithGrant: Array<{
    id: string
    name: string | null
    email: string
    role: string
    image: string | null
    grantedAt: Date | null
    grantedBy: string | null
    reason: string | null
  }>
  employeesWithRevoke: Array<{
    id: string
    name: string | null
    email: string
    role: string
    image: string | null
    grantedAt: Date | null
    grantedBy: string | null
    reason: string | null
  }>
}

/**
 * Fetch all permissions with their assigned employees.
 * Returns permissions with lists of employees who have custom grants or revokes.
 */
export const fetchPermissionsWithEmployees = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .handler(async ({ context }): Promise<{ permissions: PermissionWithEmployees[] }> => {
    const { businessId, branchId } = context.user

    // Fetch all permissions
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

    const permissions = permissionsResult.value

    // Fetch all user permissions with user info
    const userPermissionsResult = await crudAPI.userPermission('findMany', {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            image: true,
            memberships: {
              where: {
                businessId,
                branchId,
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    })

    if (userPermissionsResult.isErr()) {
      throw new Error('Failed to fetch user permissions')
    }

    // Filter user permissions to only include users in this business/branch
    const userPermissions = userPermissionsResult.value.filter(up => up.user.memberships.length > 0)

    // Group employees by permission
    const employeesByPermission = userPermissions.reduce(
      (acc, up) => {
        if (!acc[up.permissionId]) {
          acc[up.permissionId] = { grants: [], revokes: [] }
        }

        const employee = {
          id: up.user.id,
          name: up.user.name,
          email: up.user.email,
          role: up.user.role,
          image: up.user.image,
          grantedAt: up.grantedAt,
          grantedBy: up.grantedBy,
          reason: up.note,
        }

        if (up.granted) {
          acc[up.permissionId].grants.push(employee)
        } else {
          acc[up.permissionId].revokes.push(employee)
        }
        return acc
      },
      {} as Record<
        string,
        {
          grants: PermissionWithEmployees['employeesWithGrant']
          revokes: PermissionWithEmployees['employeesWithRevoke']
        }
      >,
    )

    // Combine permissions with their employees
    const permissionsWithEmployees: PermissionWithEmployees[] = permissions.map(permission => ({
      ...permission,
      employeesWithGrant: employeesByPermission[permission.id]?.grants || [],
      employeesWithRevoke: employeesByPermission[permission.id]?.revokes || [],
    }))

    return { permissions: permissionsWithEmployees }
  })

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
    const userPermissionsResult = await crudAPI.userPermission('findMany', {
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

    console.log('[fetchUsersWithPermissions] Fetched UserPermissions:', userPermissions.length)
    console.log('[fetchUsersWithPermissions] UserPermissions data:', userPermissions)

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
      {} as Record<string, { grants: UserPermissionWithPermission[]; revokes: UserPermissionWithPermission[] }>,
    )

    console.log('[fetchUsersWithPermissions] Grouped by user:', permissionsByUser)

    // Combine users with their permissions
    const usersWithPermissions: UserWithPermissions[] = users.map(user => ({
      ...user,
      customGrants: (permissionsByUser[user.id]?.grants || []).map(g => ({
        id: g.id,
        permissionId: g.permissionId,
        permission: g.permission,
        grantedBy: g.grantedBy,
        grantedAt: g.grantedAt,
        reason: g.note,
      })),
      customRevokes: (permissionsByUser[user.id]?.revokes || []).map(r => ({
        id: r.id,
        permissionId: r.permissionId,
        permission: r.permission,
        grantedBy: r.grantedBy,
        grantedAt: r.grantedAt,
        reason: r.note,
      })),
    }))

    return { users: usersWithPermissions }
  })

// ---------------------------------------------------------------------------
// Fetch permission audit log
// ---------------------------------------------------------------------------

export interface PermissionAuditEntry {
  id: string
  action: 'PERMISSION_GRANTED' | 'PERMISSION_REVOKED' | 'PERMISSION_RESET'
  actorId: string
  targetId: string
  permissionKey: string
  permissionName: string
  reason?: string
  createdAt: Date
}

/**
 * Fetch audit log entries for permission management actions.
 * Returns a historical trail of all permission grants, revokes, and resets.
 */
export const fetchPermissionAuditLog = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .handler(async ({ context }): Promise<{ entries: PermissionAuditEntry[] }> => {
    const { businessId } = context.user

    // Fetch audit log entries for permission actions
    const auditResult = await crudAPI.auditLog('findMany', {
      where: {
        businessId,
        action: {
          in: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'PERMISSION_RESET'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (auditResult.isErr()) {
      throw new Error('Failed to fetch audit log')
    }

    const entries = auditResult.value.map(log => {
      const after = log.after as { permissionKey?: string; permissionName?: string; reason?: string } | null
      return {
        id: log.id,
        action: log.action as 'PERMISSION_GRANTED' | 'PERMISSION_REVOKED' | 'PERMISSION_RESET',
        actorId: log.actorId,
        targetId: log.targetId,
        permissionKey: after?.permissionKey || '',
        permissionName: after?.permissionName || '',
        reason: after?.reason,
        createdAt: log.createdAt,
      }
    })

    return { entries }
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
    const { id: grantedBy, businessId } = context.user
    const { userId, permissionKey, reason } = data

    console.log('[grantPermissionToUser] Context user:', context.user)
    console.log('[grantPermissionToUser] GrantedBy (actorId):', grantedBy)

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
    const grantResult = await crudAPI.userPermission('upsert', {
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
        note: reason || `Granted by admin`,
      },
      update: {
        granted: true,
        grantedBy,
        grantedAt: new Date(),
        note: reason || `Granted by admin`,
      },
    })

    if (grantResult.isErr()) {
      console.error('Failed to grant permission:', grantResult.error)
      throw new Error(`Failed to grant permission: ${grantResult.error.message || 'Unknown error'}`)
    }

    // Create audit log entry (don't fail the operation if audit log fails)
    console.log('[grantPermissionToUser] Creating audit log entry...')
    try {
      const auditResult = await crudAPI.auditLog('create', {
        data: {
          businessId,
          actorId: grantedBy,
          action: 'PERMISSION_GRANTED',
          targetType: 'UserPermission',
          targetId: userId,
          after: {
            userId,
            permissionKey,
            permissionName: permission.name,
            reason: reason || 'Granted by admin',
          },
        },
      })
      console.log('[grantPermissionToUser] Audit log created:', auditResult.isOk() ? 'SUCCESS' : 'FAILED')
      if (auditResult.isErr()) {
        console.error('[grantPermissionToUser] Audit log error:', auditResult.error)
      }
    } catch (error) {
      console.error('Failed to create audit log entry:', error)
      // Continue anyway - audit log failure shouldn't block the operation
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
    const { id: revokedBy, businessId } = context.user
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
    const revokeResult = await crudAPI.userPermission('upsert', {
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
        grantedAt: new Date(),
        note: reason || `Revoked by admin`,
      },
      update: {
        granted: false,
        grantedBy: revokedBy,
        grantedAt: new Date(),
        note: reason || `Revoked by admin`,
      },
    })

    if (revokeResult.isErr()) {
      console.error('Failed to revoke permission:', revokeResult.error)
      throw new Error(`Failed to revoke permission: ${revokeResult.error.message || 'Unknown error'}`)
    }

    // Create audit log entry (don't fail the operation if audit log fails)
    try {
      await crudAPI.auditLog('create', {
        data: {
          businessId,
          actorId: revokedBy,
          action: 'PERMISSION_REVOKED',
          targetType: 'UserPermission',
          targetId: userId,
          after: {
            userId,
            permissionKey,
            permissionName: permission.name,
            reason: reason || 'Revoked by admin',
          },
        },
      })
    } catch (error) {
      console.error('Failed to create audit log entry:', error)
      // Continue anyway - audit log failure shouldn't block the operation
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
  .handler(async ({ data, context }): Promise<{ success: boolean; message: string }> => {
    const { userId, permissionKey } = data
    const { businessId, id: actorId } = context.user

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
    const deleteResult = await crudAPI.userPermission('delete', {
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

    // Create audit log entry (don't fail the operation if audit log fails)
    try {
      await crudAPI.auditLog('create', {
        data: {
          businessId,
          actorId,
          action: 'PERMISSION_RESET',
          targetType: 'UserPermission',
          targetId: userId,
          after: {
            userId,
            permissionKey,
            permissionName: permission.name,
          },
        },
      })
    } catch (error) {
      console.error('Failed to create audit log entry:', error)
      // Continue anyway - audit log failure shouldn't block the operation
    }

    return {
      success: true,
      message: `Successfully removed custom override for "${permission.name}" from ${targetUser.name || targetUser.email}. Role defaults will now apply.`,
    }
  })
