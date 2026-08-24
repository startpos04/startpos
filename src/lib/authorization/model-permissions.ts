/**
 * Model-Level Permission Mapping
 *
 * This file maps Prisma model operations to required permissions.
 * Used by CRUD API and Transaction API to enforce authorization.
 *
 * Architecture: Phase 0 - Authorization Foundation
 * Security: Prevents unauthorized access to data via generic APIs
 */

import type { PermissionKey } from './permission-keys'
import { Permissions } from './permission-keys'

/**
 * Maps Prisma model names to their required permissions for each operation.
 * Format: { [modelName]: { [operation]: permission } }
 */
export const MODEL_PERMISSIONS: Record<string, Partial<Record<string, PermissionKey>>> = {
  // ===================================================================
  // BUSINESS-LEVEL MODELS (rootPrisma)
  // ===================================================================

  branch: {
    findMany: Permissions.BUSINESS_VIEW_BRANCHES,
    findFirst: Permissions.BUSINESS_VIEW_BRANCHES,
    findUnique: Permissions.BUSINESS_VIEW_BRANCHES,
    count: Permissions.BUSINESS_VIEW_BRANCHES,
    create: Permissions.BUSINESS_CREATE_BRANCH,
    update: Permissions.BUSINESS_MANAGE_BRANCHES,
    updateMany: Permissions.BUSINESS_MANAGE_BRANCHES,
    upsert: Permissions.BUSINESS_MANAGE_BRANCHES,
    delete: Permissions.BUSINESS_DELETE_BRANCH,
    deleteMany: Permissions.BUSINESS_DELETE_BRANCH,
  },

  business: {
    findMany: Permissions.BUSINESS_VIEW_PROFILE,
    findFirst: Permissions.BUSINESS_VIEW_PROFILE,
    findUnique: Permissions.BUSINESS_VIEW_PROFILE,
    count: Permissions.BUSINESS_VIEW_PROFILE,
    update: Permissions.BUSINESS_MANAGE_PROFILE,
    updateMany: Permissions.BUSINESS_MANAGE_PROFILE,
    upsert: Permissions.BUSINESS_MANAGE_PROFILE,
  },

  supplier: {
    findMany: Permissions.BUSINESS_VIEW_SUPPLIERS,
    findFirst: Permissions.BUSINESS_VIEW_SUPPLIERS,
    findUnique: Permissions.BUSINESS_VIEW_SUPPLIERS,
    count: Permissions.BUSINESS_VIEW_SUPPLIERS,
    create: Permissions.BUSINESS_CREATE_SUPPLIER,
    update: Permissions.BUSINESS_MANAGE_SUPPLIERS,
    updateMany: Permissions.BUSINESS_MANAGE_SUPPLIERS,
    upsert: Permissions.BUSINESS_MANAGE_SUPPLIERS,
    delete: Permissions.BUSINESS_DELETE_SUPPLIER,
    deleteMany: Permissions.BUSINESS_DELETE_SUPPLIER,
  },

  customer: {
    findMany: Permissions.BUSINESS_VIEW_CUSTOMERS,
    findFirst: Permissions.BUSINESS_VIEW_CUSTOMERS,
    findUnique: Permissions.BUSINESS_VIEW_CUSTOMERS,
    count: Permissions.BUSINESS_VIEW_CUSTOMERS,
    create: Permissions.BUSINESS_CREATE_CUSTOMER,
    update: Permissions.BUSINESS_MANAGE_CUSTOMERS,
    updateMany: Permissions.BUSINESS_MANAGE_CUSTOMERS,
    upsert: Permissions.BUSINESS_MANAGE_CUSTOMERS,
    delete: Permissions.BUSINESS_DELETE_CUSTOMER,
    deleteMany: Permissions.BUSINESS_DELETE_CUSTOMER,
  },

  // ===================================================================
  // BRANCH-LEVEL MODELS (tenantPrisma)
  // ===================================================================

  product: {
    findMany: Permissions.BRANCH_VIEW_PRODUCTS,
    findFirst: Permissions.BRANCH_VIEW_PRODUCTS,
    findUnique: Permissions.BRANCH_VIEW_PRODUCTS,
    count: Permissions.BRANCH_VIEW_PRODUCTS,
    groupBy: Permissions.BRANCH_VIEW_PRODUCTS,
    create: Permissions.BRANCH_CREATE_PRODUCT,
    update: Permissions.BRANCH_EDIT_PRODUCT,
    updateMany: Permissions.BRANCH_EDIT_PRODUCT,
    upsert: Permissions.BRANCH_MANAGE_PRODUCTS,
    delete: Permissions.BRANCH_DELETE_PRODUCT,
    deleteMany: Permissions.BRANCH_DELETE_PRODUCT,
  },

  employee: {
    findMany: Permissions.BRANCH_VIEW_EMPLOYEES,
    findFirst: Permissions.BRANCH_VIEW_EMPLOYEES,
    findUnique: Permissions.BRANCH_VIEW_EMPLOYEES,
    count: Permissions.BRANCH_VIEW_EMPLOYEES,
    groupBy: Permissions.BRANCH_VIEW_EMPLOYEES,
    create: Permissions.BRANCH_CREATE_EMPLOYEE,
    update: Permissions.BRANCH_EDIT_EMPLOYEE,
    updateMany: Permissions.BRANCH_EDIT_EMPLOYEE,
    upsert: Permissions.BRANCH_MANAGE_EMPLOYEES,
    delete: Permissions.BRANCH_DELETE_EMPLOYEE,
    deleteMany: Permissions.BRANCH_DELETE_EMPLOYEE,
  },

  order: {
    findMany: Permissions.BRANCH_VIEW_ORDERS,
    findFirst: Permissions.BRANCH_VIEW_ORDERS,
    findUnique: Permissions.BRANCH_VIEW_ORDERS,
    count: Permissions.BRANCH_VIEW_ORDERS,
    groupBy: Permissions.BRANCH_VIEW_ORDERS,
    create: Permissions.BRANCH_CREATE_ORDER,
    update: Permissions.BRANCH_EDIT_ORDER,
    updateMany: Permissions.BRANCH_EDIT_ORDER,
    upsert: Permissions.BRANCH_EDIT_ORDER,
    delete: Permissions.BRANCH_CANCEL_ORDER,
    deleteMany: Permissions.BRANCH_CANCEL_ORDER,
  },

  transaction: {
    findMany: Permissions.BRANCH_VIEW_TRANSACTIONS,
    findFirst: Permissions.BRANCH_VIEW_TRANSACTIONS,
    findUnique: Permissions.BRANCH_VIEW_TRANSACTIONS,
    count: Permissions.BRANCH_VIEW_TRANSACTIONS,
    groupBy: Permissions.BRANCH_VIEW_TRANSACTIONS,
    create: Permissions.BRANCH_CREATE_TRANSACTION,
    // Note: Transactions typically cannot be updated/deleted once created
  },

  inventory: {
    findMany: Permissions.BRANCH_VIEW_INVENTORY,
    findFirst: Permissions.BRANCH_VIEW_INVENTORY,
    findUnique: Permissions.BRANCH_VIEW_INVENTORY,
    count: Permissions.BRANCH_VIEW_INVENTORY,
    groupBy: Permissions.BRANCH_VIEW_INVENTORY,
    update: Permissions.BRANCH_ADJUST_INVENTORY,
    updateMany: Permissions.BRANCH_ADJUST_INVENTORY,
    upsert: Permissions.BRANCH_MANAGE_INVENTORY,
  },

  purchase: {
    findMany: Permissions.BRANCH_VIEW_PURCHASES,
    findFirst: Permissions.BRANCH_VIEW_PURCHASES,
    findUnique: Permissions.BRANCH_VIEW_PURCHASES,
    count: Permissions.BRANCH_VIEW_PURCHASES,
    groupBy: Permissions.BRANCH_VIEW_PURCHASES,
    create: Permissions.BRANCH_CREATE_PURCHASE,
    update: Permissions.BRANCH_MANAGE_PURCHASES,
    updateMany: Permissions.BRANCH_MANAGE_PURCHASES,
    upsert: Permissions.BRANCH_MANAGE_PURCHASES,
    delete: Permissions.BRANCH_MANAGE_PURCHASES,
    deleteMany: Permissions.BRANCH_MANAGE_PURCHASES,
  },

  task: {
    findMany: Permissions.BRANCH_VIEW_TASKS,
    findFirst: Permissions.BRANCH_VIEW_TASKS,
    findUnique: Permissions.BRANCH_VIEW_TASKS,
    count: Permissions.BRANCH_VIEW_TASKS,
    groupBy: Permissions.BRANCH_VIEW_TASKS,
    create: Permissions.BRANCH_CREATE_TASK,
    update: Permissions.BRANCH_MANAGE_TASKS,
    updateMany: Permissions.BRANCH_MANAGE_TASKS,
    upsert: Permissions.BRANCH_MANAGE_TASKS,
    delete: Permissions.BRANCH_MANAGE_TASKS,
    deleteMany: Permissions.BRANCH_MANAGE_TASKS,
  },

  // Batch preparation (production)
  batchPreparation: {
    findMany: Permissions.BRANCH_VIEW_PRODUCTION,
    findFirst: Permissions.BRANCH_VIEW_PRODUCTION,
    findUnique: Permissions.BRANCH_VIEW_PRODUCTION,
    count: Permissions.BRANCH_VIEW_PRODUCTION,
    create: Permissions.BRANCH_CREATE_PRODUCTION,
    update: Permissions.BRANCH_MANAGE_PRODUCTION,
    updateMany: Permissions.BRANCH_MANAGE_PRODUCTION,
    upsert: Permissions.BRANCH_MANAGE_PRODUCTION,
    delete: Permissions.BRANCH_MANAGE_PRODUCTION,
    deleteMany: Permissions.BRANCH_MANAGE_PRODUCTION,
  },
}

/**
 * Get the required permission for a model operation
 *
 * @param model - Prisma model name (lowercase)
 * @param action - Prisma operation (findMany, create, update, etc.)
 * @returns Required permission key, or undefined if no permission required
 *
 * @example
 * getRequiredPermission('product', 'create') // 'branch:create:product'
 * getRequiredPermission('branch', 'delete') // 'business:delete:branch'
 */
export function getRequiredPermission(model: string, action: string): PermissionKey | undefined {
  return MODEL_PERMISSIONS[model]?.[action]
}

/**
 * Check if a user has permission to perform an operation on a model
 *
 * @param model - Prisma model name
 * @param action - Prisma operation
 * @param userPermissions - Array of user's permissions
 * @returns true if user has permission or no permission required, false otherwise
 *
 * @example
 * hasModelPermission('product', 'create', userPermissions) // true/false
 */
export function hasModelPermission(model: string, action: string, userPermissions: string[]): boolean {
  const requiredPermission = getRequiredPermission(model, action)

  // If no permission is mapped for this model/action, allow it
  // (Some models might not require permissions, or use different authorization)
  if (!requiredPermission) {
    return true
  }

  return userPermissions.includes(requiredPermission)
}

/**
 * Check if operation is a write operation (creates/modifies data)
 * Used for entitlement checks
 */
export function isWriteOperation(action: string): boolean {
  return ['create', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(action)
}

/**
 * Check if operation is a create operation
 * Used for limit checks (e.g., branch limits, employee limits)
 */
export function isCreateOperation(action: string): boolean {
  return action === 'create'
}

/**
 * Get models that require entitlement checks on create
 * These models are subject to subscription limits
 */
export const ENTITLEMENT_CHECKED_MODELS = new Set([
  'branch', // Branch limit
  'employee', // Employee limit per branch
  'product', // Product limit per branch
  // Add other models with subscription limits
])

/**
 * Check if a model requires entitlement checks
 */
export function requiresEntitlementCheck(model: string, action: string): boolean {
  return isCreateOperation(action) && ENTITLEMENT_CHECKED_MODELS.has(model)
}
