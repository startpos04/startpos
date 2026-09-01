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

import { Link } from '@tanstack/react-router'
import { ShieldAlertIcon } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useHasAllPermissions, useHasAnyPermission, usePermission } from '@/hooks/use-permission'
import type { PermissionKey } from '@/lib/authorization/permission-keys'

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
  const hasSinglePermission = usePermission(permission!)
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
  // Business scope
  'business:view:business_profile': 'View business profile',
  'business:edit:business_profile': 'Edit business profile',
  'business:manage:billing': 'Manage billing',
  'business:view:billing': 'View billing',
  'business:manage:subscription': 'Manage subscription',
  'business:view:reports': 'View reports',
  'business:export:data': 'Export data',
  'business:manage:integrations': 'Manage integrations',
  'business:view:audit_logs': 'View audit logs',

  // Branch scope
  'branch:create:branch': 'Create branches',
  'branch:edit:branch': 'Edit branches',
  'branch:delete:branch': 'Delete branches',
  'branch:view:branch': 'View branch details',
  'branch:manage:branch_settings': 'Manage branch settings',

  // User scope
  'user:create:user': 'Create users',
  'user:edit:user': 'Edit users',
  'user:delete:user': 'Delete users',
  'user:view:user': 'View user details',
  'user:assign:role': 'Assign roles',
  'user:manage:permissions': 'Manage permissions',
  'user:view:activity': 'View user activity',

  // Product scope
  'branch:create:product': 'Create products',
  'branch:edit:product': 'Edit products',
  'branch:delete:product': 'Delete products',
  'branch:view:product': 'View products',
  'branch:manage:inventory': 'Manage inventory',
  'branch:view:inventory_reports': 'View inventory reports',

  // Transaction scope
  'branch:create:transaction': 'Create transactions',
  'branch:view:transaction': 'View transactions',
  'branch:void:transaction': 'Void transactions',
  'branch:refund:transaction': 'Refund transactions',

  // Order scope
  'branch:create:order': 'Create orders',
  'branch:edit:order': 'Edit orders',
  'branch:delete:order': 'Delete orders',
  'branch:view:order': 'View orders',
  'branch:fulfill:order': 'Fulfill orders',

  // Payment scope
  'branch:process:payment': 'Process payments',
  'branch:void:payment': 'Void payments',
  'branch:refund:payment': 'Refund payments',
  'branch:view:payment': 'View payments',

  // Customer scope
  'branch:create:customer': 'Create customers',
  'branch:edit:customer': 'Edit customers',
  'branch:delete:customer': 'Delete customers',
  'branch:view:customer': 'View customers',

  // Supplier scope
  'branch:create:supplier': 'Create suppliers',
  'branch:edit:supplier': 'Edit suppliers',
  'branch:delete:supplier': 'Delete suppliers',
  'branch:view:supplier': 'View suppliers',

  // Purchase scope
  'branch:create:purchase': 'Create purchases',
  'branch:edit:purchase': 'Edit purchases',
  'branch:delete:purchase': 'Delete purchases',
  'branch:view:purchase': 'View purchases',
  'branch:approve:purchase': 'Approve purchases',

  // Task scope
  'branch:create:task': 'Create tasks',
  'branch:edit:task': 'Edit tasks',
  'branch:delete:task': 'Delete tasks',
  'branch:view:task': 'View tasks',
  'branch:assign:task': 'Assign tasks',
  'branch:complete:task': 'Complete tasks',

  // Vendor session scope
  'branch:start:vendor_session': 'Start vendor sessions',
  'branch:end:vendor_session': 'End vendor sessions',
  'branch:view:vendor_session': 'View vendor sessions',

  // Settings scope
  'branch:manage:settings': 'Manage settings',
  'branch:view:settings': 'View settings',
}
