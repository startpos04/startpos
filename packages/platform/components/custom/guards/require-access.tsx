/**
 * require-access.tsx — Combined capability + permission guard
 *
 * Convenience component that combines RequireCapability and RequirePermission
 * into a single gate. Use when access requires BOTH business-level capability
 * enablement AND user-level permission.
 *
 * This is equivalent to nesting RequireCapability > RequirePermission, but
 * with cleaner syntax and better error messages that distinguish between
 * "feature not enabled" and "permission denied".
 *
 * Usage — single permission:
 *   <RequireAccess
 *     capability={Capabilities.MANAGE_BILLING}
 *     permission={PermissionKeys.BUSINESS.MANAGE_BILLING}
 *   >
 *     <BillingSettings />
 *   </RequireAccess>
 *
 * Usage — multiple permissions (ANY):
 *   <RequireAccess
 *     capability={Capabilities.MANAGE_INVENTORY}
 *     permissions={[
 *       PermissionKeys.BRANCH.MANAGE_INVENTORY,
 *       PermissionKeys.BRANCH.VIEW_INVENTORY_REPORTS
 *     ]}
 *   >
 *     <InventoryDashboard />
 *   </RequireAccess>
 *
 * Usage — multiple permissions (ALL):
 *   <RequireAccess
 *     capability={Capabilities.MANAGE_EMPLOYEES}
 *     permissions={[
 *       PermissionKeys.USER.VIEW_USER,
 *       PermissionKeys.USER.EDIT_USER
 *     ]}
 *     requireAllPermissions
 *   >
 *     <EmployeeManagement />
 *   </RequireAccess>
 *
 * Usage — inline mode:
 *   <RequireAccess
 *     capability={Capabilities.EXPORT_DATA}
 *     permission={PermissionKeys.BUSINESS.EXPORT_DATA}
 *     inline
 *   >
 *     <ExportButton />
 *   </RequireAccess>
 *
 * Why use RequireAccess instead of nesting?
 *   - Cleaner syntax: one component instead of two
 *   - Better UX: shows capability-locked message if capability is disabled,
 *     permission-denied message if user lacks permission
 *   - Less boilerplate: no need to repeat inline/fallback props
 *
 * When NOT to use RequireAccess:
 *   - When you only need capability check → use RequireCapability
 *   - When you only need permission check → use RequirePermission
 *   - When you need custom fallback for each gate → nest manually
 */

import type { PermissionKey } from '@platform/lib/authorization/permission-keys'
import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import type React from 'react'
import { RequireCapability } from './require-capability'
import { RequirePermission } from './require-permission'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RequireAccessSingleProps {
  /** The capability that must be enabled for the business */
  capability: CapabilityKey
  /** The permission that must be granted to the user */
  permission: PermissionKey
  permissions?: never
  requireAllPermissions?: never
  /** Content to render when both capability and permission are granted */
  children: React.ReactNode
  /**
   * When true, renders inline messages instead of full-page cards.
   * Use for section-level gates inside a page that has other content.
   */
  inline?: boolean
}

interface RequireAccessMultipleProps {
  /** The capability that must be enabled for the business */
  capability: CapabilityKey
  permission?: never
  /** Array of permissions to check (defaults to ANY logic) */
  permissions: PermissionKey[]
  /** When true, ALL permissions must be granted. When false, ANY permission grants access. Default: false (ANY) */
  requireAllPermissions?: boolean
  /** Content to render when both capability and permission requirements are met */
  children: React.ReactNode
  /**
   * When true, renders inline messages instead of full-page cards.
   * Use for section-level gates inside a page that has other content.
   */
  inline?: boolean
}

type RequireAccessProps = RequireAccessSingleProps | RequireAccessMultipleProps

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Combined capability + permission guard.
 * Checks capability first (business-level), then permission (user-level).
 * Shows appropriate error message for each failure mode.
 */
export function RequireAccess({ capability, permission, permissions, requireAllPermissions = false, children, inline = false }: RequireAccessProps) {
  return (
    <RequireCapability cap={capability} inline={inline}>
      {permission ? (
        <RequirePermission permission={permission} inline={inline}>
          {children}
        </RequirePermission>
      ) : (
        <RequirePermission permissions={permissions} requireAll={requireAllPermissions} inline={inline}>
          {children}
        </RequirePermission>
      )}
    </RequireCapability>
  )
}
