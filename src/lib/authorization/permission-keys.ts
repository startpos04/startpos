/**
 * Permission Registry - Phase 0: Authorization System Foundation
 *
 * This file defines all permissions in the system using the naming convention:
 * SCOPE:ACTION:RESOURCE
 *
 * Scopes:
 * - business: Business-level resources (billing, branches, capabilities)
 * - branch: Branch-level resources (employees, products, reports)
 * - user: User's own account
 *
 * Actions:
 * - view: Read-only access
 * - manage: Full CRUD access
 * - create: Create new records
 * - edit: Update existing records
 * - delete: Delete records
 * - export: Export data
 */

export const Permissions = {
  // ===================================================================
  // BUSINESS SCOPE - Business-wide resources (multi-branch level)
  // ===================================================================

  // Billing & Subscription
  BUSINESS_VIEW_BILLING: 'business:view:billing',
  BUSINESS_MANAGE_BILLING: 'business:manage:billing',
  BUSINESS_MANAGE_SUBSCRIPTION: 'business:manage:subscription',

  // Branch Management
  BUSINESS_VIEW_BRANCHES: 'business:view:branches',
  BUSINESS_MANAGE_BRANCHES: 'business:manage:branches',
  BUSINESS_CREATE_BRANCH: 'business:create:branch',
  BUSINESS_DELETE_BRANCH: 'business:delete:branch',

  // Business Capabilities
  BUSINESS_VIEW_CAPABILITIES: 'business:view:capabilities',
  BUSINESS_MANAGE_CAPABILITIES: 'business:manage:capabilities',

  // Business Profile
  BUSINESS_VIEW_PROFILE: 'business:view:profile',
  BUSINESS_MANAGE_PROFILE: 'business:manage:profile',

  // Suppliers (Shared across branches)
  BUSINESS_VIEW_SUPPLIERS: 'business:view:suppliers',
  BUSINESS_MANAGE_SUPPLIERS: 'business:manage:suppliers',
  BUSINESS_CREATE_SUPPLIER: 'business:create:supplier',
  BUSINESS_DELETE_SUPPLIER: 'business:delete:supplier',

  // Customers (Shared across branches)
  BUSINESS_VIEW_CUSTOMERS: 'business:view:customers',
  BUSINESS_MANAGE_CUSTOMERS: 'business:manage:customers',
  BUSINESS_CREATE_CUSTOMER: 'business:create:customer',
  BUSINESS_DELETE_CUSTOMER: 'business:delete:customer',

  // User Management (Business-wide)
  BUSINESS_VIEW_USERS: 'business:view:users',
  BUSINESS_MANAGE_USERS: 'business:manage:users',
  BUSINESS_INVITE_USER: 'business:invite:user',
  BUSINESS_DELETE_USER: 'business:delete:user',

  // Business Analytics
  BUSINESS_VIEW_ANALYTICS: 'business:view:analytics',
  BUSINESS_EXPORT_DATA: 'business:export:data',

  // ===================================================================
  // BRANCH SCOPE - Branch-specific resources
  // ===================================================================

  // Employees
  BRANCH_VIEW_EMPLOYEES: 'branch:view:employees',
  BRANCH_MANAGE_EMPLOYEES: 'branch:manage:employees',
  BRANCH_CREATE_EMPLOYEE: 'branch:create:employee',
  BRANCH_EDIT_EMPLOYEE: 'branch:edit:employee',
  BRANCH_DELETE_EMPLOYEE: 'branch:delete:employee',

  // Products
  BRANCH_VIEW_PRODUCTS: 'branch:view:products',
  BRANCH_MANAGE_PRODUCTS: 'branch:manage:products',
  BRANCH_CREATE_PRODUCT: 'branch:create:product',
  BRANCH_EDIT_PRODUCT: 'branch:edit:product',
  BRANCH_DELETE_PRODUCT: 'branch:delete:product',

  // Inventory
  BRANCH_VIEW_INVENTORY: 'branch:view:inventory',
  BRANCH_MANAGE_INVENTORY: 'branch:manage:inventory',
  BRANCH_ADJUST_INVENTORY: 'branch:adjust:inventory',

  // Orders & POS
  BRANCH_VIEW_ORDERS: 'branch:view:orders',
  BRANCH_CREATE_ORDER: 'branch:create:order',
  BRANCH_EDIT_ORDER: 'branch:edit:order',
  BRANCH_CANCEL_ORDER: 'branch:cancel:order',
  BRANCH_REFUND_ORDER: 'branch:refund:order',

  // Transactions
  BRANCH_VIEW_TRANSACTIONS: 'branch:view:transactions',
  BRANCH_CREATE_TRANSACTION: 'branch:create:transaction',

  // Reports
  BRANCH_VIEW_SALES_REPORTS: 'branch:view:sales-reports',
  BRANCH_VIEW_INVENTORY_REPORTS: 'branch:view:inventory-reports',
  BRANCH_VIEW_EMPLOYEE_REPORTS: 'branch:view:employee-reports',
  BRANCH_EXPORT_REPORTS: 'branch:export:reports',

  // Settings
  BRANCH_VIEW_SETTINGS: 'branch:view:settings',
  BRANCH_MANAGE_SETTINGS: 'branch:manage:settings',
  BRANCH_MANAGE_ENTITLEMENTS: 'branch:manage:entitlements',

  // Billing & Credits
  BRANCH_VIEW_BILLING: 'branch:view:billing',
  BRANCH_MANAGE_BILLING: 'branch:manage:billing',

  // Tasks
  BRANCH_VIEW_TASKS: 'branch:view:tasks',
  BRANCH_CREATE_TASK: 'branch:create:task',
  BRANCH_MANAGE_TASKS: 'branch:manage:tasks',

  // Purchases
  BRANCH_VIEW_PURCHASES: 'branch:view:purchases',
  BRANCH_CREATE_PURCHASE: 'branch:create:purchase',
  BRANCH_MANAGE_PURCHASES: 'branch:manage:purchases',

  // Production (Batch Preparation)
  BRANCH_VIEW_PRODUCTION: 'branch:view:production',
  BRANCH_CREATE_PRODUCTION: 'branch:create:production',
  BRANCH_MANAGE_PRODUCTION: 'branch:manage:production',

  // ===================================================================
  // USER SCOPE - Personal account management
  // ===================================================================

  USER_VIEW_ACCOUNT: 'user:view:account',
  USER_MANAGE_ACCOUNT: 'user:manage:account',
  USER_CHANGE_PASSWORD: 'user:change:password',
  USER_MANAGE_PREFERENCES: 'user:manage:preferences',
  USER_MANAGE_PERMISSIONS: 'user:manage:permissions',
} as const

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions]

/**
 * Helper to extract scope from permission and return as enum value
 * @example getPermissionScope('business:view:billing') // 'BUSINESS'
 */
export function getPermissionScope(permission: PermissionKey): 'BUSINESS' | 'BRANCH' | 'USER' {
  const scope = permission.split(':')[0].toUpperCase()
  return scope as 'BUSINESS' | 'BRANCH' | 'USER'
}

/**
 * Helper to extract action from permission and return as enum value
 * @example getPermissionAction('business:view:billing') // 'VIEW'
 */
export function getPermissionAction(permission: PermissionKey): string {
  return permission.split(':')[1].toUpperCase()
}

/**
 * Helper to extract resource from permission
 * @example getPermissionResource('business:view:billing') // 'billing'
 */
export function getPermissionResource(permission: PermissionKey): string {
  return permission.split(':')[2]
}
