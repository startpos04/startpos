/**
 * permission-middleware.ts — Server-side permission enforcement middleware
 *
 * Usage:
 *   import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
 *   import { authMiddleware } from '@/lib/better-auth/auth-middleware'
 *   import { Permissions } from '@platform/lib/authorization/permission-keys'
 *
 *   export const updateBilling = createServerFn({ method: 'POST' })
 *     .middleware([authMiddleware, requirePermission(Permissions.BUSINESS.MANAGE_BILLING)])
 *     .handler(async ({ context }) => { ... })
 *
 */

import { createMiddleware } from '@tanstack/react-start'
import { Role } from 'prisma/generated/prisma/enums'
import { AuthorizationEngine } from '../authorization/authorization-engine'
import type { PermissionKey } from '../authorization/permission-keys'
import type { ServerContext } from './server-context'

// ---------------------------------------------------------------------------
// Permission error
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  readonly code: string
  readonly missingPermissions?: PermissionKey[] | undefined

  constructor(code: string, message: string, missingPermissions?: PermissionKey[]) {
    super(message)
    this.name = 'PermissionDeniedError'
    this.code = code
    this.missingPermissions = missingPermissions
  }
}

// ---------------------------------------------------------------------------
// Shared context shape — populated by authMiddleware upstream
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// requirePermission
// ---------------------------------------------------------------------------

export function requirePermission(permission: PermissionKey) {
  return createMiddleware({ type: 'function' }).server(async ({ next, context }) => {
    const { user } = context as unknown as ServerContext

    if (!user?.id) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    const authorization = await AuthorizationEngine.buildSummary({
      userId: user.id,
      role: user.role ?? Role.CASHIER,
    })

    if (!authorization.permissions.includes(permission)) {
      throw new PermissionDeniedError('PERMISSION_DENIED', `You don't have permission to perform this action. Required: ${permission}`, [permission])
    }

    return next({
      context: { user, authorization, permissionGranted: permission },
    })
  })
}

// ---------------------------------------------------------------------------
// requireAllPermissions
// ---------------------------------------------------------------------------

export function requireAllPermissions(permissions: PermissionKey[]) {
  return createMiddleware({ type: 'function' }).server(async ({ next, context }) => {
    const { user } = context as unknown as ServerContext

    if (!user?.id) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    const authorization = await AuthorizationEngine.buildSummary({
      userId: user.id,
      role: user.role ?? Role.CASHIER,
    })

    const missing = permissions.filter(p => !authorization.permissions.includes(p))

    if (missing.length > 0) {
      throw new PermissionDeniedError('PERMISSION_DENIED', `You don't have all required permissions. Missing: ${missing.join(', ')}`, missing)
    }

    return next({
      context: { user, authorization, permissionsGranted: permissions },
    })
  })
}

// ---------------------------------------------------------------------------
// requireAnyPermission
// ---------------------------------------------------------------------------

export function requireAnyPermission(permissions: PermissionKey[]) {
  return createMiddleware({ type: 'function' }).server(async ({ next, context }) => {
    const { user } = context as unknown as ServerContext

    if (!user?.id) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    const authorization = await AuthorizationEngine.buildSummary({
      userId: user.id,
      role: user.role ?? Role.CASHIER,
    })

    if (!permissions.some(p => authorization.permissions.includes(p))) {
      throw new PermissionDeniedError(
        'PERMISSION_DENIED',
        `You don't have any of the required permissions. Required (any): ${permissions.join(', ')}`,
        permissions,
      )
    }

    return next({
      context: { user, authorization, permissionsChecked: permissions },
    })
  })
}

// ---------------------------------------------------------------------------
// Manual utilities (for conditional checks inside handlers)
// ---------------------------------------------------------------------------

export async function checkPermission(userId: string, role: Role, permission: PermissionKey): Promise<boolean> {
  const authorization = await AuthorizationEngine.buildSummary({ userId, role })
  return authorization.permissions.includes(permission)
}

export async function checkAllPermissions(userId: string, role: Role, permissions: PermissionKey[]): Promise<boolean> {
  const authorization = await AuthorizationEngine.buildSummary({ userId, role })
  return permissions.every(p => authorization.permissions.includes(p))
}

export async function checkAnyPermission(userId: string, role: Role, permissions: PermissionKey[]): Promise<boolean> {
  const authorization = await AuthorizationEngine.buildSummary({ userId, role })
  return permissions.some(p => authorization.permissions.includes(p))
}
