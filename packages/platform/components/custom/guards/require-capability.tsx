/**
 * require-capability.tsx â€” Per-capability route guard component
 *
 * Wraps a route or feature section and renders a "not available" placeholder
 * when the current session does not have the required capability.
 *
 * This is the per-feature equivalent of useSubscriptionGate (which blocks
 * entire routes based on subscription status). Use RequireCapability when a
 * specific feature may be unavailable depending on the business's plan or
 * BOS capability state.
 *
 * Usage â€” wrapping a full route:
 *   function OrdersPage() {
 *     return (
 *       <RequireCapability cap={Capabilities.CREATE_ORDER}>
 *         <OrdersContent />
 *       </RequireCapability>
 *     )
 *   }
 *
 * Usage â€” wrapping a section (inline):
 *   <RequireCapability cap={Capabilities.MANAGE_INVENTORY} inline>
 *     <InventoryTable />
 *   </RequireCapability>
 *
 * Usage â€” custom fallback:
 *   <RequireCapability
 *     cap={Capabilities.VIEW_ANALYTICS}
 *     fallback={<p>Analytics not available on your plan.</p>}
 *   >
 *     <AnalyticsDashboard />
 *   </RequireCapability>
 *
 * Usage â€” nested with RequirePermission for dual gating:
 *   <RequireCapability cap={Capabilities.MANAGE_BILLING}>
 *     <RequirePermission permission={PermissionKeys.BUSINESS.MANAGE_BILLING}>
 *       <BillingSettings />
 *     </RequirePermission>
 *   </RequireCapability>
 *
 * When to use RequireCapability vs RequirePermission:
 *   - RequireCapability: Business-wide feature enablement
 *     â†’ "Is this feature enabled for the business?"
 *     â†’ Checks subscription plan, capability states, survey answers
 *     â†’ Example: Is inventory tracking enabled?
 *
 *   - RequirePermission: User-level authorization
 *     â†’ "Does this user have permission to perform this action?"
 *     â†’ Checks role-based and custom-assigned permissions
 *     â†’ Example: Can this CASHIER edit business settings?
 *
 *   - Use both (nested): Feature must be enabled AND user must have permission
 *     â†’ Outer: RequireCapability (business-level gate)
 *     â†’ Inner: RequirePermission (user-level gate)
 *
 * Architecture:
 *   - Reads from authStore.user.entitlement.capabilities (session-loaded).
 *   - No server call on render â€” purely reactive to the session.
 *   - Does NOT replace server-side checks. Use entitlementMiddleware on
 *     server functions that perform mutations.
 */

import { Link } from '@tanstack/react-router'
import { LockIcon } from 'lucide-react'
import type React from 'react'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { useCapability } from '@platform/hooks/use-capability'
import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RequireCapabilityProps {
  /** The capability key that must be granted for children to render */
  cap: CapabilityKey
  /** Content to render when the capability IS granted */
  children: React.ReactNode
  /**
   * Content to render when capability is NOT granted.
   * Defaults to CapabilityLockedView (full-page card with upgrade CTA).
   */
  fallback?: React.ReactNode
  /**
   * When true, renders an inline locked message instead of a full-page card.
   * Use for section-level gates inside a page that has other content.
   */
  inline?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RequireCapability({ cap, children, fallback, inline = false }: RequireCapabilityProps) {
  const granted = useCapability(cap)

  if (granted) return <>{children}</>

  if (fallback) return <>{fallback}</>

  if (inline) return <CapabilityLockedInline cap={cap} />

  return <CapabilityLockedView cap={cap} />
}

// ---------------------------------------------------------------------------
// Full-page locked view (default fallback for route-level guards)
// ---------------------------------------------------------------------------

function CapabilityLockedView({ cap }: { cap: CapabilityKey }) {
  const label = CAPABILITY_LABELS[cap] ?? cap

  return (
    <div className='flex items-center justify-center min-h-[60vh] p-6'>
      <Card className='w-full max-w-sm text-center'>
        <CardHeader className='pb-3'>
          <div className='flex justify-center mb-3'>
            <div className='rounded-full bg-muted p-3'>
              <LockIcon className='size-6 text-muted-foreground' />
            </div>
          </div>
          <CardTitle className='text-lg'>{label} is not available</CardTitle>
          <CardDescription className='text-sm'>This feature is not included in your current setup. Enable it in Settings to get started.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          <Button asChild variant='default'>
            <Link to='/settings' search={{ tab: 'Capabilities' }}>
              View capabilities
            </Link>
          </Button>
          <Button asChild variant='ghost'>
            <Link to='/dashboard'>Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline locked message (for section-level gates)
// ---------------------------------------------------------------------------

function CapabilityLockedInline({ cap }: { cap: CapabilityKey }) {
  const label = CAPABILITY_LABELS[cap] ?? cap

  return (
    <div className='flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground'>
      <LockIcon className='size-3.5 shrink-0' />
      <span>{label} is not enabled for your business.</span>
      <Link to='/settings' search={{ tab: 'Capabilities' }} className='ml-auto shrink-0 text-xs text-primary hover:underline underline-offset-2'>
        Enable
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Human-readable labels for capability keys
// ---------------------------------------------------------------------------

const CAPABILITY_LABELS: Partial<Record<CapabilityKey, string>> = {
  COMPLETE_CHECKOUT: 'POS Checkout',
  CREATE_ORDER: 'Order Queue',
  EDIT_ACTIVE_ORDER: 'Order Editing',
  RECORD_PAYMENT: 'Payment Recording',
  ISSUE_REFUND: 'Refunds',
  PRINT_RECEIPT: 'Receipt Printing',
  START_VENDOR_SESSION: 'Cash Reconciliation',
  MANAGE_INVENTORY: 'Inventory Tracking',
  VIEW_INVENTORY_REPORTS: 'Inventory Reports',
  CREATE_PURCHASE: 'Purchase Orders',
  MANAGE_SUPPLIERS: 'Supplier Management',
  CREATE_TASK: 'Task Management',
  MANAGE_CUSTOMERS: 'Customer Profiles',
  MANAGE_BRANCHES: 'Multi-branch',
  // Non-V1 capabilities - labels removed from public display
  // VIEW_ANALYTICS: 'Analytics',
  // ACCESS_API: 'API Access',
  // LOYALTY_POINTS: 'Loyalty Points',
  // KITCHEN_DISPLAY: 'Kitchen Display',
  // DELIVERY_MANAGEMENT: 'Delivery Management',
  VIEW_ORDER_HISTORY: 'Order History',
  MANAGE_PRODUCTS: 'Product Management',
  MANAGE_EMPLOYEES: 'Employee Management',
  VIEW_SALES_REPORTS: 'Sales Reports',
  VIEW_TRANSACTION_HISTORY: 'Transaction History',
  EXPORT_DATA: 'Data Export',
  MANAGE_SETTINGS: 'Settings',
  MANAGE_BILLING: 'Billing',
  REACTIVATE_SUBSCRIPTION: 'Subscription Management',
}
