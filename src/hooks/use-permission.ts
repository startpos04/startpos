/**
 * use-permission.ts — Client-side permission access hooks
 *
 * Reads from authStore.authorization (populated at session load by
 * AuthorizationEngine.buildSummary). No server call on every render —
 * the permission list is already in the session.
 *
 * OFFLINE SUPPORT: AuthorizationEngine.buildSummary reads from collections,
 * so these hooks work offline as long as the user has logged in at least once
 * while online (to sync permission collections).
 *
 * Usage:
 *   // Check a single permission
 *   const canManageBilling = usePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
 *   if (!canManageBilling) return <AccessDenied />
 *
 *   // Check multiple permissions
 *   const { canEdit, canDelete } = usePermissions([
 *     PermissionKeys.BUSINESS.EDIT_BUSINESS_PROFILE,
 *     PermissionKeys.BUSINESS.DELETE_BRANCH,
 *   ])
 *
 *   // Check if user has all permissions
 *   const hasAllPermissions = useHasAllPermissions([
 *     PermissionKeys.BUSINESS.MANAGE_BILLING,
 *     PermissionKeys.BUSINESS.VIEW_REPORTS,
 *   ])
 *
 *   // Check if user has any permission
 *   const hasAnyPermission = useHasAnyPermission([
 *     PermissionKeys.BUSINESS.MANAGE_BILLING,
 *     PermissionKeys.BUSINESS.VIEW_REPORTS,
 *   ])
 *
 * Architecture note:
 *   This is UI-layer gating only. It prevents rendering features the user
 *   can't access, but it does NOT replace server-side checks. Server functions
 *   that mutate data must use permission middleware to enforce access
 *   independently of what the client sends.
 */

import { useStore } from '@tanstack/react-store'
import type { Role } from 'prisma/generated/prisma/enums'
import type { PermissionKey } from '@/lib/authorization/permission-keys'
import { authStore } from '@/store/auth-store'

// ---------------------------------------------------------------------------
// Single permission check
// ---------------------------------------------------------------------------

/**
 * Returns true if the current session has the given permission granted.
 *
 * @param permission - A PermissionKey constant from permission-keys.ts
 *
 * @example
 * const canManageBilling = usePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)
 */
export function usePermission(permission: PermissionKey): boolean {
  return useStore(authStore, state => state.authorization?.permissions?.includes(permission) ?? false)
}

// ---------------------------------------------------------------------------
// Multiple permission check (batch — avoids multiple store subscriptions)
// ---------------------------------------------------------------------------

/**
 * Returns a record of boolean values for each requested permission.
 * Use when you need to check several permissions in the same component.
 *
 * @param permissions - Array of PermissionKey constants
 *
 * @example
 * const perms = usePermissions([
 *   PermissionKeys.BUSINESS.MANAGE_BILLING,
 *   PermissionKeys.BUSINESS.VIEW_REPORTS,
 * ])
 * if (perms[PermissionKeys.BUSINESS.MANAGE_BILLING]) { ... }
 */
export function usePermissions<T extends PermissionKey>(permissions: T[]): Record<T, boolean> {
  const granted = useStore(authStore, state => state.authorization?.permissions ?? [])

  return Object.fromEntries(permissions.map(perm => [perm, granted.includes(perm)])) as Record<T, boolean>
}

// ---------------------------------------------------------------------------
// All permissions check
// ---------------------------------------------------------------------------

/**
 * Returns true if the user has ALL of the specified permissions.
 *
 * @param permissions - Array of PermissionKey constants
 *
 * @example
 * const canManageBillingAndReports = useHasAllPermissions([
 *   PermissionKeys.BUSINESS.MANAGE_BILLING,
 *   PermissionKeys.BUSINESS.VIEW_REPORTS,
 * ])
 */
export function useHasAllPermissions(permissions: PermissionKey[]): boolean {
  return useStore(authStore, state => {
    const granted = state.authorization?.permissions ?? []
    return permissions.every(perm => granted.includes(perm))
  })
}

// ---------------------------------------------------------------------------
// Any permission check
// ---------------------------------------------------------------------------

/**
 * Returns true if the user has AT LEAST ONE of the specified permissions.
 *
 * @param permissions - Array of PermissionKey constants
 *
 * @example
 * const canAccessBilling = useHasAnyPermission([
 *   PermissionKeys.BUSINESS.MANAGE_BILLING,
 *   PermissionKeys.BUSINESS.VIEW_BILLING,
 * ])
 */
export function useHasAnyPermission(permissions: PermissionKey[]): boolean {
  return useStore(authStore, state => {
    const granted = state.authorization?.permissions ?? []
    return permissions.some(perm => granted.includes(perm))
  })
}

// ---------------------------------------------------------------------------
// User role check
// ---------------------------------------------------------------------------

/**
 * Returns the current user's role, or undefined if not loaded.
 *
 * @example
 * const role = useUserRole()
 * if (role === Role.OWNER) return <OwnerDashboard />
 */
export function useUserRole(): Role | undefined {
  return useStore(authStore, state => state.user?.role)
}

// ---------------------------------------------------------------------------
// Custom permission grants/revokes
// ---------------------------------------------------------------------------

/**
 * Returns the current user's custom permission grants and revokes.
 * Useful for displaying what custom permissions have been assigned.
 *
 * @example
 * const { customGrants, customRevokes } = useCustomPermissions()
 */
export function useCustomPermissions(): { customGrants: PermissionKey[]; customRevokes: PermissionKey[] } {
  return useStore(authStore, state => ({
    customGrants: state.authorization?.customGrants ?? [],
    customRevokes: state.authorization?.customRevokes ?? [],
  }))
}
