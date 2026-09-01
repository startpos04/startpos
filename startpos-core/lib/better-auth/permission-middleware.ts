/**
 * permission-middleware.ts — Server-side permission enforcement middleware
 *
 * Use this middleware on any createServerFn that requires a specific permission.
 * It rebuilds the permission summary from the DB on every call (not from the
 * client session) so it cannot be spoofed.
 *
 * Usage:
 *   import { requirePermission, requireAllPermissions, requireAnyPermission } from '@startpos-core/lib/better-auth/permission-middleware'
 *   import { PermissionKeys } from '@startpos-core/lib/authorization/permission-keys'
 *
 *   // Single permission
 *   export const updateBilling = createServerFn({ method: 'POST' })
 *     .middleware([authMiddleware, requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)])
 *     .handler(async ({ data, context }) => {
 *       // context.authorization is available here if needed
 *       // If the permission is denied, this handler is never called —
 *       // the middleware throws before reaching it.
 *     })
 *
 *   // Multiple permissions (ALL required)
 *   export const advancedBillingAction = createServerFn({ method: 'POST' })
 *     .middleware([
 *       authMiddleware,
 *       requireAllPermissions([
 *         PermissionKeys.BUSINESS.MANAGE_BILLING,
 *         PermissionKeys.BUSINESS.VIEW_REPORTS
 *       ])
 *     ])
 *     .handler(async ({ data, context }) => { ... })
 *
 *   // Multiple permissions (ANY sufficient)
 *   export const viewBillingData = createServerFn({ method: 'GET' })
 *     .middleware([
 *       authMiddleware,
 *       requireAnyPermission([
 *         PermissionKeys.BUSINESS.MANAGE_BILLING,
 *         PermissionKeys.BUSINESS.VIEW_BILLING
 *       ])
 *     ])
 *     .handler(async ({ data, context }) => { ... })
 *
 * What it does:
 *   1. Reads the user's role and custom permissions from coreAPI (authoritative)
 *   2. Calls AuthorizationEngine.buildSummary(userId, role)
 *   3. Checks if the user has the required permission(s)
 *   4. If denied: throws an error with PERMISSION_DENIED code
 *      (TanStack Start serializes this as a 403-equivalent response)
 *   5. If granted: calls next() so the handler proceeds
 *
 * Why rebuild from DB (not from session):
 *   The client session is a snapshot taken at login. Custom permissions could
 *   be granted or revoked between logins, or role defaults could be updated.
 *   For mutation server functions, the server must be the authority.
 *
 * Architecture:
 *   - Composed with authMiddleware (must come after it so context.user exists)
 *   - Pure middleware — no side effects beyond the permission check
 *   - Uses coreAPI for permission reads (respects multi-tenant/soft-delete)
 *   - Mirrors entitlementMiddleware pattern for consistency
 */

import { createMiddleware } from '@tanstack/react-start'
import { Role } from 'prisma/generated/prisma/enums'
import { AuthorizationEngine } from '../authorization/authorization-engine'
import type { PermissionKey } from '../authorization/permission-keys'

// ---------------------------------------------------------------------------
// Permission error — thrown when the permission is denied
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly missingPermissions?: PermissionKey[],
  ) {
    super(message)
    this.name = 'PermissionDeniedError'
  }
}

// ---------------------------------------------------------------------------
// Single permission middleware
// ---------------------------------------------------------------------------

/**
 * Creates a TanStack Start middleware that enforces a single permission check.
 * Compose after authMiddleware in the .middleware() array.
 *
 * @param permission - The PermissionKey that must be GRANTED for the handler to run
 *
 * @example
 * export const deleteBranch = createServerFn({ method: 'POST' })
 *   .middleware([authMiddleware, requirePermission(PermissionKeys.BRANCH.DELETE_BRANCH)])
 *   .handler(async ({ data, context }) => { ... })
 */
export function requirePermission(permission: PermissionKey) {
  return createMiddleware().server(async ({ next, context }) => {
    const user = (context as { user?: { id?: string; businessId?: string; role?: Role } }).user

    if (!user?.id || !user?.businessId) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    // -----------------------------------------------------------------------
    // Rebuild authorization summary from DB — not from the client session
    // -----------------------------------------------------------------------
    const authorization = await AuthorizationEngine.buildSummary({
      userId: user.id,
      role: user.role ?? Role.CASHIER,
    })

    // -----------------------------------------------------------------------
    // Check if the user has the required permission
    // -----------------------------------------------------------------------
    if (!authorization.permissions.includes(permission)) {
      throw new PermissionDeniedError('PERMISSION_DENIED', `You don't have permission to perform this action. Required: ${permission}`, [permission])
    }

    // -----------------------------------------------------------------------
    // Pass authorization summary to the handler (optional — handler can use it)
    // -----------------------------------------------------------------------
    return next({
      context: {
        ...(context as object),
        authorization,
        permissionGranted: permission,
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Multiple permissions (ALL required) middleware
// ---------------------------------------------------------------------------

/**
 * Creates a TanStack Start middleware that enforces ALL permissions must be granted.
 * Compose after authMiddleware in the .middleware() array.
 *
 * @param permissions - Array of PermissionKeys that ALL must be GRANTED for the handler to run
 *
 * @example
 * export const advancedAction = createServerFn({ method: 'POST' })
 *   .middleware([
 *     authMiddleware,
 *     requireAllPermissions([
 *       PermissionKeys.BUSINESS.MANAGE_BILLING,
 *       PermissionKeys.BUSINESS.VIEW_REPORTS
 *     ])
 *   ])
 *   .handler(async ({ data, context }) => { ... })
 */
export function requireAllPermissions(permissions: PermissionKey[]) {
  return createMiddleware().server(async ({ next, context }) => {
    const user = (context as { user?: { id?: string; businessId?: string; role?: Role } }).user

    if (!user?.id || !user?.businessId) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    // -----------------------------------------------------------------------
    // Rebuild authorization summary from DB
    // -----------------------------------------------------------------------
    const authorization = await AuthorizationEngine.buildSummary({
      userId: user.id,
      role: user.role ?? Role.CASHIER,
    })

    // -----------------------------------------------------------------------
    // Check if the user has ALL required permissions
    // -----------------------------------------------------------------------
    const missingPermissions = permissions.filter(p => !authorization.permissions.includes(p))

    if (missingPermissions.length > 0) {
      throw new PermissionDeniedError(
        'PERMISSION_DENIED',
        `You don't have all required permissions. Missing: ${missingPermissions.join(', ')}`,
        missingPermissions,
      )
    }

    // -----------------------------------------------------------------------
    // Pass authorization summary to the handler
    // -----------------------------------------------------------------------
    return next({
      context: {
        ...(context as object),
        authorization,
        permissionsGranted: permissions,
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Multiple permissions (ANY sufficient) middleware
// ---------------------------------------------------------------------------

/**
 * Creates a TanStack Start middleware that enforces AT LEAST ONE permission must be granted.
 * Compose after authMiddleware in the .middleware() array.
 *
 * @param permissions - Array of PermissionKeys where ANY one being GRANTED allows the handler to run
 *
 * @example
 * export const viewBillingData = createServerFn({ method: 'GET' })
 *   .middleware([
 *     authMiddleware,
 *     requireAnyPermission([
 *       PermissionKeys.BUSINESS.MANAGE_BILLING,
 *       PermissionKeys.BUSINESS.VIEW_BILLING
 *     ])
 *   ])
 *   .handler(async ({ data, context }) => { ... })
 */
export function requireAnyPermission(permissions: PermissionKey[]) {
  return createMiddleware().server(async ({ next, context }) => {
    const user = (context as { user?: { id?: string; businessId?: string; role?: Role } }).user

    if (!user?.id || !user?.businessId) {
      throw new PermissionDeniedError('UNAUTHENTICATED', 'You must be logged in to perform this action.')
    }

    // -----------------------------------------------------------------------
    // Rebuild authorization summary from DB
    // -----------------------------------------------------------------------
    const authorization = await AuthorizationEngine.buildSummary({
      userId: user.id,
      role: user.role ?? Role.CASHIER,
    })

    // -----------------------------------------------------------------------
    // Check if the user has AT LEAST ONE required permission
    // -----------------------------------------------------------------------
    const hasAnyPermission = permissions.some(p => authorization.permissions.includes(p))

    if (!hasAnyPermission) {
      throw new PermissionDeniedError(
        'PERMISSION_DENIED',
        `You don't have any of the required permissions. Required (any): ${permissions.join(', ')}`,
        permissions,
      )
    }

    // -----------------------------------------------------------------------
    // Pass authorization summary to the handler
    // -----------------------------------------------------------------------
    return next({
      context: {
        ...(context as object),
        authorization,
        permissionsChecked: permissions,
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Manual permission check utility (for use inside handlers)
// ---------------------------------------------------------------------------

/**
 * Manual permission check for use inside handler functions when middleware
 * is not appropriate (e.g., conditional checks, dynamic permissions).
 *
 * @param userId - The user ID to check permissions for
 * @param role - The user's role
 * @param permission - The permission to check
 * @returns Promise<boolean> - true if granted, false if denied
 *
 * @example
 * export const conditionalAction = createServerFn({ method: 'POST' })
 *   .middleware([authMiddleware])
 *   .handler(async ({ data, context }) => {
 *     const canDelete = await checkPermission(
 *       context.user.id,
 *       context.user.role,
 *       PermissionKeys.BRANCH.DELETE_PRODUCT
 *     )
 *     if (!canDelete) {
 *       throw new Error('Cannot delete product')
 *     }
 *     // ... proceed with deletion
 *   })
 */
export async function checkPermission(userId: string, role: Role, permission: PermissionKey): Promise<boolean> {
  const authorization = await AuthorizationEngine.buildSummary({
    userId,
    role,
  })

  return authorization.permissions.includes(permission)
}

/**
 * Manual check for ALL permissions (similar to requireAllPermissions but returns boolean).
 *
 * @example
 * const hasAllPerms = await checkAllPermissions(
 *   context.user.id,
 *   context.user.role,
 *   [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_REPORTS]
 * )
 */
export async function checkAllPermissions(userId: string, role: Role, permissions: PermissionKey[]): Promise<boolean> {
  const authorization = await AuthorizationEngine.buildSummary({
    userId,
    role,
  })

  return permissions.every(p => authorization.permissions.includes(p))
}

/**
 * Manual check for ANY permission (similar to requireAnyPermission but returns boolean).
 *
 * @example
 * const hasAnyPerm = await checkAnyPermission(
 *   context.user.id,
 *   context.user.role,
 *   [PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING]
 * )
 */
export async function checkAnyPermission(userId: string, role: Role, permissions: PermissionKey[]): Promise<boolean> {
  const authorization = await AuthorizationEngine.buildSummary({
    userId,
    role,
  })

  return permissions.some(p => authorization.permissions.includes(p))
}
