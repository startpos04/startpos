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
    const { user, authorization } = context as unknown as ServerContext

    if (!user?.id) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    // Authorization summary is already built by authMiddleware upstream
    if (!authorization?.permissions?.includes(permission)) {
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
    const { user, authorization } = context as unknown as ServerContext

    if (!user?.id) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    // Authorization summary is already built by authMiddleware upstream
    const missing = permissions.filter(p => !authorization?.permissions?.includes(p))

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
    const { user, authorization } = context as unknown as ServerContext

    if (!user?.id) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    // Authorization summary is already built by authMiddleware upstream
    if (!permissions.some(p => authorization?.permissions?.includes(p))) {
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
