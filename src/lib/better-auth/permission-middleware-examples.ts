/**
 * permission-middleware-examples.ts — Reference implementations for permission-protected server functions
 *
 * This file contains example server functions demonstrating various permission middleware patterns.
 * Use these as templates when implementing new permission-protected endpoints.
 *
 * ⚠️ DO NOT delete this file — it serves as living documentation and reference for the team.
 */

import { createServerFn } from '@tanstack/react-start'
import { PermissionKeys } from '../authorization/permission-keys'
import { Capabilities } from '@startpos-core/lib/entitlement/capability-keys'
import { coreAPI } from '@startpos-core/lib/prisma-client/core-api'
import { crudAPI } from '@startpos-core/lib/prisma-client/crud-api'
import { authMiddleware } from './auth-middleware'
import { requireCapability } from './entitlement-middleware'
import { checkPermission, PermissionDeniedError, requireAllPermissions, requireAnyPermission, requirePermission } from './permission-middleware'

// ---------------------------------------------------------------------------
// Example 1: Single Permission - Business Settings
// ---------------------------------------------------------------------------

/**
 * Update business profile information.
 * Requires: BUSINESS.EDIT_BUSINESS_PROFILE permission.
 *
 * Pattern: Single permission check via middleware.
 */
export const updateBusinessProfile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(PermissionKeys.BUSINESS.EDIT_BUSINESS_PROFILE)])
  .inputValidator((data: { name: string; description?: string }) => data)
  .handler(async ({ data, context }) => {
    const { businessId } = context.user

    const result = await crudAPI.business('update', {
      where: { id: businessId },
      data: {
        name: data.name,
        description: data.description,
      },
    })

    if (result.isErr()) {
      throw new Error('Failed to update business profile')
    }

    return { success: true, business: result.value }
  })

// ---------------------------------------------------------------------------
// Example 2: Multiple Permissions (ALL) - Advanced Billing
// ---------------------------------------------------------------------------

/**
 * Export billing data and reports.
 * Requires: BOTH MANAGE_BILLING and EXPORT_DATA permissions.
 *
 * Pattern: Multiple permissions (ALL required) via middleware.
 */
export const exportBillingData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireAllPermissions([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.EXPORT_DATA])])
  .inputValidator((data: { startDate: string; endDate: string; format: 'csv' | 'pdf' }) => data)
  .handler(async ({ data, context }) => {
    const { businessId } = context.user

    // Fetch billing data
    const invoicesResult = await crudAPI.billingInvoice('findMany', {
      where: {
        businessId,
        createdAt: {
          gte: new Date(data.startDate),
          lte: new Date(data.endDate),
        },
      },
      include: { usageCounter: true },
    })

    if (invoicesResult.isErr()) {
      throw new Error('Failed to fetch billing data')
    }

    // Generate export in requested format
    const exportData = generateBillingExport(invoicesResult.value, data.format)

    return { success: true, exportData }
  })

// ---------------------------------------------------------------------------
// Example 3: Multiple Permissions (ANY) - View Billing
// ---------------------------------------------------------------------------

/**
 * View billing dashboard data.
 * Requires: EITHER MANAGE_BILLING or VIEW_BILLING permission.
 *
 * Pattern: Multiple permissions (ANY sufficient) via middleware.
 */
export const viewBillingDashboard = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requireAnyPermission([PermissionKeys.BUSINESS.MANAGE_BILLING, PermissionKeys.BUSINESS.VIEW_BILLING])])
  .handler(async ({ context }) => {
    const { businessId } = context.user

    const [currentUsage, currentInvoice, paymentHistory] = await Promise.all([
      // Fetch current usage counter
      crudAPI.usageCounter('findFirst', {
        where: { businessId, isClosed: false },
        orderBy: { billingPeriodStart: 'desc' },
      }),
      // Fetch current invoice
      crudAPI.billingInvoice('findFirst', {
        where: { businessId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }),
      // Fetch payment history
      crudAPI.payment('findMany', {
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
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
 * Requires: Orders feature enabled AND CREATE_ORDER permission.
 *
 * Pattern: Both capability and permission checks.
 */
export const createOrder = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requireCapability(Capabilities.CREATE_ORDER), // Business-level: feature enabled?
    requirePermission(PermissionKeys.BRANCH.CREATE_ORDER), // User-level: has permission?
  ])
  .inputValidator((data: { customerId?: string; items: Array<{ productId: string; quantity: number }> }) => data)
  .handler(async ({ data, context }) => {
    const { businessId, branchId, userId } = context.user

    // Create order
    const orderResult = await crudAPI.order('create', {
      data: {
        businessId,
        branchId,
        userId,
        customerId: data.customerId,
        status: 'PENDING',
        items: {
          create: data.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    })

    if (orderResult.isErr()) {
      throw new Error('Failed to create order')
    }

    return { success: true, order: orderResult.value }
  })

// ---------------------------------------------------------------------------
// Example 5: Conditional Permission - Delete Own vs Others' Orders
// ---------------------------------------------------------------------------

/**
 * Delete an order.
 * Permission requirement depends on ownership:
 * - Own orders: No special permission needed
 * - Others' orders: DELETE_ORDER permission required
 *
 * Pattern: Conditional permission check inside handler.
 */
export const deleteOrder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data, context }) => {
    const { userId } = context.user

    // Fetch the order to check ownership
    const orderResult = await crudAPI.order('findUnique', {
      where: { id: data.orderId },
      select: { id: true, userId: true, status: true },
    })

    if (orderResult.isErr() || !orderResult.value) {
      throw new Error('Order not found')
    }

    const order = orderResult.value
    const isOwnOrder = order.userId === userId

    // Can't delete completed orders
    if (order.status === 'COMPLETED') {
      throw new Error('Cannot delete completed orders')
    }

    // If not own order, check permission
    if (!isOwnOrder) {
      const hasPermission = await checkPermission(context.user.id, context.user.role, PermissionKeys.BRANCH.DELETE_ORDER)

      if (!hasPermission) {
        throw new PermissionDeniedError('PERMISSION_DENIED', 'You can only delete your own orders unless you have DELETE_ORDER permission', [
          PermissionKeys.BRANCH.DELETE_ORDER,
        ])
      }
    }

    // Proceed with deletion
    const deleteResult = await crudAPI.order('delete', {
      where: { id: data.orderId },
    })

    if (deleteResult.isErr()) {
      throw new Error('Failed to delete order')
    }

    return { success: true }
  })

// ---------------------------------------------------------------------------
// Example 6: Dynamic Permission - Role Assignment
// ---------------------------------------------------------------------------

/**
 * Assign a role to a user.
 * Permission requirement depends on the target role:
 * - OWNER role: Cannot be assigned (only one owner per business)
 * - ADMIN role: Requires ASSIGN_ROLE permission
 * - Other roles: Requires ASSIGN_ROLE permission
 *
 * Pattern: Dynamic permission check based on input data.
 */
export const assignUserRole = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(PermissionKeys.USER.ASSIGN_ROLE)])
  .inputValidator((data: { userId: string; role: string }) => data)
  .handler(async ({ data, context }) => {
    const { businessId } = context.user

    // Cannot assign OWNER role
    if (data.role === 'OWNER') {
      throw new Error('OWNER role cannot be assigned. Each business can only have one owner.')
    }

    // Verify target user exists and is in the same business
    const targetUserResult = await crudAPI.user('findUnique', {
      where: { id: data.userId },
      select: { id: true, role: true },
    })

    if (targetUserResult.isErr() || !targetUserResult.value) {
      throw new Error('User not found')
    }

    // Update role
    const updateResult = await crudAPI.user('update', {
      where: { id: data.userId },
      data: { role: data.role as any },
    })

    if (updateResult.isErr()) {
      throw new Error('Failed to assign role')
    }

    return { success: true, user: updateResult.value }
  })

// ---------------------------------------------------------------------------
// Example 7: Custom Permission Grant/Revoke (Platform Admin)
// ---------------------------------------------------------------------------

/**
 * Grant or revoke a custom permission to/from a user.
 * Requires: MANAGE_PERMISSIONS permission.
 *
 * Pattern: Platform-level permission management using coreAPI.
 */
export const manageUserPermission = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(PermissionKeys.USER.MANAGE_PERMISSIONS)])
  .inputValidator((data: { userId: string; permissionKey: string; granted: boolean; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { userId: grantedBy } = context.user

    // Fetch permission ID by key
    const permissionResult = await coreAPI.permission('findUnique', {
      where: { key: data.permissionKey },
      select: { id: true },
    })

    if (permissionResult.isErr() || !permissionResult.value) {
      throw new Error('Permission not found')
    }

    const permissionId = permissionResult.value.id

    if (data.granted) {
      // Grant permission
      const grantResult = await coreAPI.userPermission('upsert', {
        where: {
          userId_permissionId: {
            userId: data.userId,
            permissionId,
          },
        },
        create: {
          userId: data.userId,
          permissionId,
          granted: true,
          grantedBy,
          grantedAt: new Date(),
          reason: data.reason,
        },
        update: {
          granted: true,
          grantedBy,
          grantedAt: new Date(),
          reason: data.reason,
        },
      })

      if (grantResult.isErr()) {
        throw new Error('Failed to grant permission')
      }

      return { success: true, action: 'granted', permission: grantResult.value }
    } else {
      // Revoke permission
      const revokeResult = await coreAPI.userPermission('upsert', {
        where: {
          userId_permissionId: {
            userId: data.userId,
            permissionId,
          },
        },
        create: {
          userId: data.userId,
          permissionId,
          granted: false,
          grantedBy,
          grantedAt: new Date(),
          reason: data.reason,
        },
        update: {
          granted: false,
          revokedBy: grantedBy,
          revokedAt: new Date(),
          reason: data.reason,
        },
      })

      if (revokeResult.isErr()) {
        throw new Error('Failed to revoke permission')
      }

      return { success: true, action: 'revoked', permission: revokeResult.value }
    }
  })

// ---------------------------------------------------------------------------
// Example 8: Batch Operations with Permission Check
// ---------------------------------------------------------------------------

/**
 * Bulk delete products.
 * Requires: DELETE_PRODUCT permission.
 *
 * Pattern: Permission check + batch operation.
 */
export const bulkDeleteProducts = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(PermissionKeys.BRANCH.DELETE_PRODUCT)])
  .inputValidator((data: { productIds: string[] }) => data)
  .handler(async ({ data, context }) => {
    const { businessId, branchId } = context.user

    // Verify all products belong to the business/branch
    const productsResult = await crudAPI.product('findMany', {
      where: {
        id: { in: data.productIds },
        businessId,
        branchId,
      },
      select: { id: true },
    })

    if (productsResult.isErr()) {
      throw new Error('Failed to verify products')
    }

    const foundIds = productsResult.value.map(p => p.id)
    const notFoundIds = data.productIds.filter(id => !foundIds.includes(id))

    if (notFoundIds.length > 0) {
      throw new Error(`Some products not found or don't belong to your branch: ${notFoundIds.join(', ')}`)
    }

    // Perform bulk deletion
    const deleteResult = await crudAPI.product('deleteMany', {
      where: {
        id: { in: data.productIds },
        businessId,
        branchId,
      },
    })

    if (deleteResult.isErr()) {
      throw new Error('Failed to delete products')
    }

    return { success: true, deletedCount: deleteResult.value.count }
  })

// ---------------------------------------------------------------------------
// Helper function (not exported - used internally)
// ---------------------------------------------------------------------------

function generateBillingExport(invoices: any[], format: 'csv' | 'pdf'): string {
  // Implementation would generate actual export file
  // This is a placeholder
  return format === 'csv' ? 'Invoice,Date,Amount\n...' : 'PDF_DATA_HERE'
}
