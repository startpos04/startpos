/** biome-ignore-all lint/suspicious/noExplicitAny:  allowing any type for flexibility */
/**
 * permission-middleware-examples.ts — Reference implementations for permission-protected server functions
 *
 * This file contains example server functions demonstrating various permission middleware patterns.
 * Use these as templates when implementing new permission-protected endpoints.
 *
 * ⚠️ DO NOT delete this file — it serves as living documentation and reference for the team.
 *
 * Key patterns used here:
 *   - getServerContext(context) to access user fields safely (businessId, branchId, etc.)
 *   - requirePermission / requireAllPermissions / requireAnyPermission for middleware-level guards
 *   - requireCapability for entitlement checks — import from '@/lib/better-auth/entitlement-middleware'
 *     in apps/web (NOT from this package — requireCapability is a web-layer concern)
 *   - checkPermission for in-handler conditional logic
 *   - crudAPI for tenant-scoped Prisma reads/writes
 *   - coreAPI for platform-level reads (permissions, user-permission records)
 */

import { createServerFn } from '@tanstack/react-start'
import type { Role } from 'prisma/generated/prisma/enums'
import { OrderStatus } from 'prisma/generated/prisma/enums'
import { Permissions } from '../authorization/permission-keys'
import { Capabilities } from '../entitlement/capability-keys'
import { coreAPI } from '../prisma-client/core-api'
import { platformAuthMiddleware as authMiddleware } from './create-auth-middleware'
import { checkPermission, PermissionDeniedError, requireAllPermissions, requireAnyPermission, requirePermission } from './permission-middleware'
import { getServerContext } from './server-context'

// NOTE: crudAPI is injected by the app layer at startup via registerDataAPIs().
// In real server functions import it from the app-local path:
//   import { crudAPI } from '@/lib/prisma-client/crud-api'
// These examples use a concrete interface matching the models referenced below.
type CrudAPIResult = Promise<{ isOk(): boolean; isErr(): boolean; value: any; error: string }>
declare const crudAPI: {
  business: (action: string, args?: any) => CrudAPIResult
  billingInvoice: (action: string, args?: any) => CrudAPIResult
  usageCounter: (action: string, args?: any) => CrudAPIResult
  payment: (action: string, args?: any) => CrudAPIResult
  order: (action: string, args?: any) => CrudAPIResult
  user: (action: string, args?: any) => CrudAPIResult
  product: (action: string, args?: any) => CrudAPIResult
}

// NOTE: requireCapability is a web-layer middleware — import it in apps/web:
//   import { requireCapability } from '@/lib/better-auth/entitlement-middleware'
// It is referenced below in Example 4 for documentation purposes only.
declare const requireCapability: (capability: (typeof Capabilities)[keyof typeof Capabilities]) => ReturnType<typeof requirePermission>

// ---------------------------------------------------------------------------
// Example 1: Single Permission - Business Settings
// ---------------------------------------------------------------------------

/**
 * Update business profile information.
 * Requires: BUSINESS_MANAGE_PROFILE permission.
 *
 * Pattern: Single permission check via middleware.
 */
export const updateBusinessProfile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_PROFILE)])
  .inputValidator((data: { name: string; description?: string }) => data)
  .handler(async ({ data, context }) => {
    const { businessId } = getServerContext(context).user
    if (!businessId) throw new Error('No business context')

    const result = await crudAPI.business('update', {
      where: { id: businessId },
      data: { name: data.name, description: data.description },
    })

    if (result.isErr()) throw new Error('Failed to update business profile')

    return { success: true, business: result.value }
  })

// ---------------------------------------------------------------------------
// Example 2: Multiple Permissions (ALL) - Advanced Billing
// ---------------------------------------------------------------------------

/**
 * Export billing data and reports.
 * Requires: BOTH BUSINESS_MANAGE_BILLING and BUSINESS_EXPORT_DATA permissions.
 *
 * Pattern: Multiple permissions (ALL required) via middleware.
 */
export const exportBillingData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireAllPermissions([Permissions.BUSINESS_MANAGE_BILLING, Permissions.BUSINESS_EXPORT_DATA])])
  .inputValidator((data: { startDate: string; endDate: string; format: 'csv' | 'pdf' }) => data)
  .handler(async ({ data, context }) => {
    const { businessId } = getServerContext(context).user
    if (!businessId) throw new Error('No business context')

    const invoicesResult = await crudAPI.billingInvoice('findMany', {
      where: {
        businessId,
        createdAt: { gte: new Date(data.startDate), lte: new Date(data.endDate) },
      },
      include: { usageCounter: true },
    })

    if (invoicesResult.isErr()) throw new Error('Failed to fetch billing data')

    return { success: true, exportData: generateBillingExport(data.format) }
  })

// ---------------------------------------------------------------------------
// Example 3: Multiple Permissions (ANY) - View Billing
// ---------------------------------------------------------------------------

/**
 * View billing dashboard data.
 * Requires: EITHER BUSINESS_MANAGE_BILLING or BUSINESS_VIEW_BILLING permission.
 *
 * Pattern: Multiple permissions (ANY sufficient) via middleware.
 */
export const viewBillingDashboard = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requireAnyPermission([Permissions.BUSINESS_MANAGE_BILLING, Permissions.BUSINESS_VIEW_BILLING])])
  .handler(async ({ context }) => {
    const { businessId } = getServerContext(context).user
    if (!businessId) throw new Error('No business context')

    const [currentUsage, currentInvoice, paymentHistory] = await Promise.all([
      crudAPI.usageCounter('findFirst', { where: { businessId, isClosed: false }, orderBy: { billingPeriodStart: 'desc' } }),
      crudAPI.billingInvoice('findFirst', { where: { businessId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
      crudAPI.payment('findMany', { where: { businessId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ])

    return {
      success: true,
      usage: currentUsage.isOk() ? currentUsage.value : null,
      invoice: currentInvoice.isOk() ? currentInvoice.value : null,
      payments: paymentHistory.isOk() ? paymentHistory.value : [],
    }
  })

// ---------------------------------------------------------------------------
// Example 4: Dual Gating (Capability + Permission) - Create Order
// ---------------------------------------------------------------------------

/**
 * Create a new order.
 * Requires: Orders feature enabled AND BRANCH_CREATE_ORDER permission.
 *
 * Pattern: Both capability and permission checks.
 * Note: requireCapability is declared above — in apps/web import from '@/lib/better-auth/entitlement-middleware'.
 */
export const createOrder = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requireCapability(Capabilities.CREATE_ORDER), // Business-level: feature enabled?
    requirePermission(Permissions.BRANCH_CREATE_ORDER), // User-level: has permission?
  ])
  .inputValidator((data: { customerId?: string; items: Array<{ productId: string; quantity: number }> }) => data)
  .handler(async ({ data, context }) => {
    const { businessId, branchId, id: userId } = getServerContext(context).user
    if (!businessId || !branchId) throw new Error('No tenant context')

    const orderResult = await crudAPI.order('create', {
      data: {
        businessId,
        branchId,
        userId,
        customerId: data.customerId,
        status: 'PENDING',
        items: { create: data.items.map((item: { productId: string; quantity: number }) => ({ productId: item.productId, quantity: item.quantity })) },
      },
      include: { items: true },
    })

    if (orderResult.isErr()) throw new Error('Failed to create order')

    return { success: true, order: orderResult.value }
  })

// ---------------------------------------------------------------------------
// Example 5: Conditional Permission - Cancel Own vs Others' Orders
// ---------------------------------------------------------------------------

/**
 * Cancel an order.
 * - Own orders: No special permission needed
 * - Others' orders: BRANCH_CANCEL_ORDER permission required
 *
 * Pattern: Conditional permission check inside handler.
 */
export const cancelOrder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data, context }) => {
    const { id: userId, role } = getServerContext(context).user

    const orderResult = await crudAPI.order('findUnique', {
      where: { id: data.orderId },
      select: { id: true, userId: true, status: true },
    })

    if (orderResult.isErr() || !orderResult.value) throw new Error('Order not found')

    const order = orderResult.value

    if (order.status === OrderStatus.SERVED) throw new Error('Cannot cancel served orders')

    if (order.userId !== userId) {
      const hasPermission = await checkPermission(userId, role as Role, Permissions.BRANCH_CANCEL_ORDER)
      if (!hasPermission) {
        throw new PermissionDeniedError('PERMISSION_DENIED', 'You can only cancel your own orders unless you have CANCEL_ORDER permission', [
          Permissions.BRANCH_CANCEL_ORDER,
        ])
      }
    }

    const updateResult = await crudAPI.order('update', {
      where: { id: data.orderId },
      data: { status: 'CANCELLED' },
    })
    if (updateResult.isErr()) throw new Error('Failed to cancel order')

    return { success: true }
  })

// ---------------------------------------------------------------------------
// Example 6: Dynamic Permission - Role Assignment via Permission Management
// ---------------------------------------------------------------------------

/**
 * Assign a role to a user.
 * Requires: USER_MANAGE_PERMISSIONS permission.
 *
 * Pattern: Dynamic permission check based on input data.
 */
export const assignUserRole = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .inputValidator((data: { userId: string; role: string }) => data)
  .handler(async ({ data }) => {
    if (data.role === 'OWNER') {
      throw new Error('OWNER role cannot be assigned. Each business can only have one owner.')
    }

    const targetUserResult = await crudAPI.user('findUnique', {
      where: { id: data.userId },
      select: { id: true, role: true },
    })

    if (targetUserResult.isErr() || !targetUserResult.value) throw new Error('User not found')

    const updateResult = await crudAPI.user('update', {
      where: { id: data.userId },
      data: { role: data.role as Role },
    })

    if (updateResult.isErr()) throw new Error('Failed to assign role')

    return { success: true, user: updateResult.value }
  })

// ---------------------------------------------------------------------------
// Example 7: Custom Permission Grant/Revoke (Platform Admin)
// ---------------------------------------------------------------------------

/**
 * Grant or revoke a custom permission to/from a user.
 * Requires: USER_MANAGE_PERMISSIONS permission.
 *
 * Pattern: Platform-level permission management using coreAPI.
 */
export const manageUserPermission = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.USER_MANAGE_PERMISSIONS)])
  .inputValidator((data: { userId: string; permissionKey: string; granted: boolean; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { id: grantedBy } = getServerContext(context).user

    const permissionResult = await coreAPI.permission('findUnique', {
      where: { key: data.permissionKey },
      select: { id: true },
    })

    if (permissionResult.isErr() || !permissionResult.value) throw new Error('Permission not found')

    const permissionId = permissionResult.value.id
    const upsertData = {
      userId: data.userId,
      permissionId,
      granted: data.granted,
      grantedBy,
      grantedAt: new Date(),
      reason: data.reason,
      ...(data.granted ? {} : { revokedBy: grantedBy, revokedAt: new Date() }),
    }

    const result = await coreAPI.userPermission('upsert', {
      where: { userId_permissionId: { userId: data.userId, permissionId } },
      create: upsertData,
      update: upsertData,
    })

    if (result.isErr()) throw new Error(`Failed to ${data.granted ? 'grant' : 'revoke'} permission`)

    return { success: true, action: data.granted ? 'granted' : 'revoked', permission: result.value }
  })

// ---------------------------------------------------------------------------
// Example 8: Batch Operations with Permission Check
// ---------------------------------------------------------------------------

/**
 * Bulk delete products.
 * Requires: BRANCH_DELETE_PRODUCT permission.
 *
 * Pattern: Permission check + batch operation.
 */
export const bulkDeleteProducts = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_DELETE_PRODUCT)])
  .inputValidator((data: { productIds: string[] }) => data)
  .handler(async ({ data, context }) => {
    const { businessId, branchId } = getServerContext(context).user
    if (!businessId || !branchId) throw new Error('No tenant context')

    const productsResult = await crudAPI.product('findMany', {
      where: { id: { in: data.productIds }, businessId, branchId },
      select: { id: true },
    })

    if (productsResult.isErr()) throw new Error('Failed to verify products')

    const foundIds = productsResult.value.map((p: { id: string }) => p.id)
    const notFoundIds = data.productIds.filter((id: string) => !foundIds.includes(id))

    if (notFoundIds.length > 0) {
      throw new Error(`Some products not found or don't belong to your branch: ${notFoundIds.join(', ')}`)
    }

    const deleteResult = await crudAPI.product('deleteMany', {
      where: { id: { in: data.productIds }, businessId, branchId },
    })

    if (deleteResult.isErr()) throw new Error('Failed to delete products')

    return { success: true, deletedCount: deleteResult.value.count }
  })

// ---------------------------------------------------------------------------
// Helper (internal)
// ---------------------------------------------------------------------------

function generateBillingExport(format: 'csv' | 'pdf'): string {
  return format === 'csv' ? 'Invoice,Date,Amount\n...' : 'PDF_DATA_HERE'
}
