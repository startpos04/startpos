/**
 * Authorization System - Phase 0: Foundation
 *
 * Public API for the authorization system.
 * Exports all necessary types, functions, and constants.
 */

export type {
  AuthorizationContext,
  MultiPermissionCheckResult,
  PermissionCheckResult,
  PermissionSummary,
} from './authorization-engine'
// Authorization Engine
export { AuthorizationEngine } from './authorization-engine'
// Permission Registry
export {
  getPermissionAction,
  getPermissionResource,
  getPermissionScope,
  type PermissionKey,
  Permissions,
} from './permission-keys'
// Role Permissions
export {
  getAllPermissions,
  getDefaultPermissionsForRole,
  getRolesWithPermission,
  RolePermissions,
  roleHasPermission,
} from './role-permissions'
