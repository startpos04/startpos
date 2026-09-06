/**
 * require-permission.tsx — Per-permission route guard component
 *
 * Wraps a route or feature section and renders a "not authorized" placeholder
 * when the current user does not have the required permission.
 *
 * This is the permission-based equivalent of RequireCapability. Use
 * RequirePermission when access depends on role-based or custom-assigned
 * permissions rather than business-wide capability enablement.
 *
 * Usage — wrapping a full route:
 *   function BillingPage() {
 *     return (
 *       <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
 *         <BillingContent />
 *       </RequirePermission>
 *     )
 *   }
 *
 * Usage — wrapping a section (inline):
 *   <RequirePermission permission={PermissionKeys.BUSINESS.EDIT_BUSINESS_PROFILE} inline>
 *     <BusinessProfileForm />
 *   </RequirePermission>
 *
 * Usage — require ALL permissions:
 *   <RequirePermission
 *     permissions={[
 *       PermissionKeys.BUSINESS.MANAGE_BILLING,
 *       PermissionKeys.BUSINESS.VIEW_REPORTS
 *     ]}
 *     requireAll
 *   >
 *     <AdvancedBillingPanel />
 *   </RequirePermission>
 *
 * Usage — require ANY permission:
 *   <RequirePermission
 *     permissions={[
 *       PermissionKeys.BUSINESS.MANAGE_BILLING,
 *       PermissionKeys.BUSINESS.VIEW_BILLING
 *     ]}
 *   >
 *     <BillingDashboard />
 *   </RequirePermission>
 *
 * Usage — custom fallback:
 *   <RequirePermission
 *     permission={PermissionKeys.BUSINESS.DELETE_BRANCH}
 *     fallback={<p>You don't have permission to delete branches.</p>}
 *   >
 *     <DeleteBranchButton />
 *   </RequirePermission>
 *
 * Architecture:
 *   - Reads from authStore.authorization.permissions (session-loaded).
 *   - No server call on render — purely reactive to the session.
 *   - Does NOT replace server-side checks. Use permission middleware on
 *     server functions that perform mutations.
 */

import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { useHasAllPermissions, useHasAnyPermission, usePermission } from '@platform/hooks/use-permission'
import type { PermissionKey } from '@platform/lib/authorization/permission-keys'
import { Link } from '@tanstack/react-router'
import { ShieldAlertIcon } from 'lucide-react'
import type React from 'react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RequirePermissionSingleProps {
  /** The permission key that must be granted for children to render */
  permission: PermissionKey
  permissions?: never
  requireAll?: never
  /** Content to render when the permission IS granted */
  children: React.ReactNode
  /**
   * Content to render when permission is NOT granted.
   * Defaults to PermissionDeniedView (full-page card with help message).
   */
  fallback?: React.ReactNode
  /**
   * When true, renders an inline denied message instead of a full-page card.
   * Use for section-level gates inside a page that has other content.
   */
  inline?: boolean
}

interface RequirePermissionMultipleProps {
  permission?: never
  /** Array of permission keys to check */
  permissions: PermissionKey[]
  /** When true, ALL permissions must be granted. When false, ANY permission grants access. Default: false (ANY) */
  requireAll?: boolean
  /** Content to render when the permission requirement IS met */
  children: React.ReactNode
  /**
   * Content to render when permission is NOT granted.
   * Defaults to PermissionDeniedView (full-page card with help message).
   */
  fallback?: React.ReactNode
  /**
   * When true, renders an inline denied message instead of a full-page card.
   * Use for section-level gates inside a page that has other content.
   */
  inline?: boolean
}

type RequirePermissionProps = RequirePermissionSingleProps | RequirePermissionMultipleProps

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RequirePermission({ permission, permissions, requireAll = false, children, fallback, inline = false }: RequirePermissionProps) {
  const hasSinglePermission = usePermission(permission ?? ('' as PermissionKey))
  const hasAllPermissions = useHasAllPermissions(permissions ?? [])
  const hasAnyPermission = useHasAnyPermission(permissions ?? [])

  // Determine if user is granted access
  let granted = false
  if (permission) {
    granted = hasSinglePermission
  } else if (permissions) {
    granted = requireAll ? hasAllPermissions : hasAnyPermission
  }

  if (granted) return <>{children}</>

  if (fallback) return <>{fallback}</>

  if (inline) return <PermissionDeniedInline permission={permission} permissions={permissions} />

  return <PermissionDeniedView permission={permission} permissions={permissions} />
}

// ---------------------------------------------------------------------------
// Full-page denied view (default fallback for route-level guards)
// ---------------------------------------------------------------------------

function PermissionDeniedView({
  permission,
  permissions: _permissions,
}: {
  permission?: PermissionKey | undefined
  permissions?: PermissionKey[] | undefined
}) {
  const label = permission ? (PERMISSION_LABELS[permission] ?? permission) : 'This action'

  return (
    <div className='flex items-center justify-center min-h-[60vh] p-6'>
      <Card className='w-full max-w-sm text-center'>
        <CardHeader className='pb-3'>
          <div className='flex justify-center mb-3'>
            <div className='rounded-full bg-muted p-3'>
              <ShieldAlertIcon className='size-6 text-muted-foreground' />
            </div>
          </div>
          <CardTitle className='text-lg'>Access denied</CardTitle>
          <CardDescription className='text-sm'>
            {permission
              ? `You don't have permission to access ${label}. Contact your administrator if you need access.`
              : `You don't have the required permissions to access this feature. Contact your administrator if you need access.`}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          <Button asChild variant='default'>
            <Link to='/dashboard'>Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline denied message (for section-level gates)
// ---------------------------------------------------------------------------

function PermissionDeniedInline({
  permission,
  permissions: _permissions,
}: {
  permission?: PermissionKey | undefined
  permissions?: PermissionKey[] | undefined
}) {
  const label = permission ? (PERMISSION_LABELS[permission] ?? permission) : 'This action'

  return (
    <div className='flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground'>
      <ShieldAlertIcon className='size-3.5 shrink-0' />
      <span>{permission ? `You don't have permission to ${label.toLowerCase()}.` : `You don't have the required permissions for this action.`}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Human-readable labels for permission keys
// ---------------------------------------------------------------------------

const PERMISSION_LABELS: Partial<Record<PermissionKey, string>> = {
  // Business
  'business:view:billing': 'View billing',
  'business:manage:billing': 'Manage billing',
  'business:manage:subscription': 'Manage subscription',
  'business:view:branches': 'View branches',
  'business:manage:branches': 'Manage branches',
  'business:create:branch': 'Create branches',
  'business:delete:branch': 'Delete branches',
  'business:view:capabilities': 'View capabilities',
  'business:manage:capabilities': 'Manage capabilities',
  'business:view:profile': 'View business profile',
  'business:manage:profile': 'Edit business profile',
  'business:view:suppliers': 'View suppliers',
  'business:manage:suppliers': 'Manage suppliers',
  'business:view:customers': 'View customers',
  'business:manage:customers': 'Manage customers',
  'business:view:users': 'View users',
  'business:manage:users': 'Manage users',
  'business:invite:user': 'Invite users',
  'business:delete:user': 'Delete users',
  'business:view:analytics': 'View analytics',
  'business:export:data': 'Export data',

  // Branch — employees
  'branch:view:employees': 'View employees',
  'branch:manage:employees': 'Manage employees',
  'branch:create:employee': 'Create employees',
  'branch:edit:employee': 'Edit employees',
  'branch:delete:employee': 'Delete employees',

  // Branch — products
  'branch:view:products': 'View products',
  'branch:manage:products': 'Manage products',
  'branch:create:product': 'Create products',
  'branch:edit:product': 'Edit products',
  'branch:delete:product': 'Delete products',

  // Branch — inventory
  'branch:view:inventory': 'View inventory',
  'branch:manage:inventory': 'Manage inventory',
  'branch:adjust:inventory': 'Adjust inventory',

  // Branch — orders
  'branch:view:orders': 'View orders',
  'branch:create:order': 'Create orders',
  'branch:edit:order': 'Edit orders',
  'branch:cancel:order': 'Cancel orders',
  'branch:refund:order': 'Refund orders',

  // Branch — transactions
  'branch:view:transactions': 'View transactions',
  'branch:create:transaction': 'Create transactions',

  // Branch — reports
  'branch:view:sales-reports': 'View sales reports',
  'branch:view:inventory-reports': 'View inventory reports',
  'branch:view:employee-reports': 'View employee reports',
  'branch:export:reports': 'Export reports',

  // Branch — settings & billing
  'branch:view:settings': 'View settings',
  'branch:manage:settings': 'Manage settings',
  'branch:view:billing': 'View billing',
  'branch:manage:billing': 'Manage billing',

  // Branch — tasks
  'branch:view:tasks': 'View tasks',
  'branch:create:task': 'Create tasks',
  'branch:manage:tasks': 'Manage tasks',

  // Branch — purchases
  'branch:view:purchases': 'View purchases',
  'branch:create:purchase': 'Create purchases',
  'branch:manage:purchases': 'Manage purchases',

  // Branch — production
  'branch:view:production': 'View production',
  'branch:create:production': 'Create production orders',
  'branch:manage:production': 'Manage production',

  // User
  'user:view:account': 'View account',
  'user:manage:account': 'Manage account',
  'user:change:password': 'Change password',
  'user:manage:preferences': 'Manage preferences',
  'user:manage:permissions': 'Manage permissions',
}
