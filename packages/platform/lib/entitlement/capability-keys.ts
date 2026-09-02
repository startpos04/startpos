/**
 * capability-keys.ts
 *
 * Canonical registry of every Business Capability this platform can grant or deny.
 *
 * Naming convention: SCREAMING_SNAKE_CASE, verb-noun form.
 * Each key maps 1:1 to a `Feature.key` record in the database.
 *
 * Operational capabilities (isOperational = true in the Feature table):
 *   Blocked when subscription is EXPIRED, SUSPENDED, or LONG_TERM_INACTIVE.
 *
 * Management capabilities (isOperational = false):
 *   Always accessible regardless of subscription status (read-only when expired).
 *
 * Usage:
 *   import { Capabilities } from '@platform/lib/entitlement/capability-keys'
 *   EntitlementEngine.check(Capabilities.COMPLETE_CHECKOUT, context)
 */

// ---------------------------------------------------------------------------
// Commerce â€” Operational (blocked on subscription lapse)
// ---------------------------------------------------------------------------
export const Capabilities = {
  // POS & checkout
  COMPLETE_CHECKOUT: 'COMPLETE_CHECKOUT',
  CREATE_ORDER: 'CREATE_ORDER',
  RECORD_PAYMENT: 'RECORD_PAYMENT',
  ISSUE_REFUND: 'ISSUE_REFUND',
  PRINT_RECEIPT: 'PRINT_RECEIPT',
  START_VENDOR_SESSION: 'START_VENDOR_SESSION',

  // Inventory & procurement â€” write operations
  CREATE_PURCHASE: 'CREATE_PURCHASE',
  MANAGE_INVENTORY: 'MANAGE_INVENTORY',

  // Task management â€” write operations
  CREATE_TASK: 'CREATE_TASK',

  // ---------------------------------------------------------------------------
  // Management â€” always accessible (read-only when expired)
  // ---------------------------------------------------------------------------

  // Product catalogue
  MANAGE_PRODUCTS: 'MANAGE_PRODUCTS',

  // People
  MANAGE_EMPLOYEES: 'MANAGE_EMPLOYEES',
  MANAGE_CUSTOMERS: 'MANAGE_CUSTOMERS',
  MANAGE_SUPPLIERS: 'MANAGE_SUPPLIERS',

  // Reporting & history â€” always accessible
  VIEW_SALES_REPORTS: 'VIEW_SALES_REPORTS',
  VIEW_INVENTORY_REPORTS: 'VIEW_INVENTORY_REPORTS',
  VIEW_TRANSACTION_HISTORY: 'VIEW_TRANSACTION_HISTORY',
  VIEW_ORDER_HISTORY: 'VIEW_ORDER_HISTORY',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',

  // Data export
  EXPORT_DATA: 'EXPORT_DATA',

  // Settings
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',

  // Multi-branch (premium)
  MANAGE_BRANCHES: 'MANAGE_BRANCHES',

  // Billing & subscription management â€” always accessible
  MANAGE_BILLING: 'MANAGE_BILLING',
  REACTIVATE_SUBSCRIPTION: 'REACTIVATE_SUBSCRIPTION',

  // API access (post-V1 capability - not exposed in V1 public surfaces)
  ACCESS_API: 'ACCESS_API',

  // ---------------------------------------------------------------------------
  // Post-V1 capabilities â€” architecture exists but not exposed in V1 public surfaces
  // ---------------------------------------------------------------------------
  LOYALTY_POINTS: 'LOYALTY_POINTS',
  KITCHEN_DISPLAY: 'KITCHEN_DISPLAY',
  DELIVERY_MANAGEMENT: 'DELIVERY_MANAGEMENT',
  BATCH_PREPARATION: 'BATCH_PREPARATION',
} as const

/**
 * Union type of every valid capability key.
 * Use this instead of `string` to get compile-time safety when calling EntitlementEngine.
 */
export type CapabilityKey = (typeof Capabilities)[keyof typeof Capabilities]

/**
 * Set of all operational capability keys â€” those that are blocked on subscription lapse.
 * Mirrors the `isOperational = true` flag on Feature records.
 * Used by the EntitlementEngine and the seed to mark features correctly.
 */
export const OPERATIONAL_CAPABILITIES = new Set<CapabilityKey>([
  Capabilities.COMPLETE_CHECKOUT,
  Capabilities.CREATE_ORDER,
  Capabilities.RECORD_PAYMENT,
  Capabilities.ISSUE_REFUND,
  Capabilities.PRINT_RECEIPT,
  Capabilities.START_VENDOR_SESSION,
  Capabilities.CREATE_PURCHASE,
  Capabilities.MANAGE_INVENTORY,
  Capabilities.CREATE_TASK,
  Capabilities.BATCH_PREPARATION,
])
