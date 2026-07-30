/**
 * entitlements.ts — Entitlement Engine seed (Phase 2)
 *
 * Seeds the Feature registry, SubscriptionPlan tiers, and PlanEntitlement
 * join records per the feature matrix defined in v1-master-plan.md §2.7.
 *
 * Design decisions:
 *  - All upserts keyed on stable natural keys (Feature.key, SubscriptionPlan.name)
 *    so the seed is fully idempotent — safe to re-run at any time.
 *  - Capability keys imported directly from the domain module to prevent
 *    string drift between the code and the DB.
 *  - No CSV used: entitlement data is platform-global and code-defined.
 *    It is the same in every environment and must stay typed against CapabilityKey.
 *  - order = 0: runs before all tenant-specific seeders.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: seeder tx type */
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { Capabilities, type CapabilityKey, OPERATIONAL_CAPABILITIES } from '../../src/lib/entitlement/capability-keys'

export const order = 0

// ---------------------------------------------------------------------------
// Feature Definitions
// key           → CapabilityKey constant (source of truth: capability-keys.ts)
// label         → Human-readable name for admin UI
// description   → What this capability controls
// isOperational → Derived from OPERATIONAL_CAPABILITIES set
// ---------------------------------------------------------------------------
const FEATURES: Array<{
  key: CapabilityKey
  label: string
  description: string
}> = [
  // --- Operational (blocked when subscription lapses) ---
  {
    key: Capabilities.COMPLETE_CHECKOUT,
    label: 'Complete Checkout',
    description: 'Process a POS transaction and collect payment.',
  },
  {
    key: Capabilities.CREATE_ORDER,
    label: 'Create Order',
    description: 'Create a new kitchen or service order.',
  },
  {
    key: Capabilities.EDIT_ACTIVE_ORDER,
    label: 'Edit Active Order',
    description: 'Modify an order that is currently in progress.',
  },
  {
    key: Capabilities.RECORD_PAYMENT,
    label: 'Record Payment',
    description: 'Record a payment against an existing order or invoice.',
  },
  {
    key: Capabilities.ISSUE_REFUND,
    label: 'Issue Refund',
    description: 'Process a refund transaction against a completed sale.',
  },
  {
    key: Capabilities.PRINT_RECEIPT,
    label: 'Print Receipt',
    description: 'Generate and print or download a transaction receipt.',
  },
  {
    key: Capabilities.START_VENDOR_SESSION,
    label: 'Start Vendor Session',
    description: 'Open a vendor / cash reconciliation session.',
  },
  {
    key: Capabilities.CREATE_PURCHASE,
    label: 'Create Purchase',
    description: 'Record a new stock purchase from a supplier.',
  },
  {
    key: Capabilities.MANAGE_INVENTORY,
    label: 'Manage Inventory',
    description: 'Adjust, transfer, and reconcile inventory stock.',
  },
  {
    key: Capabilities.CREATE_TASK,
    label: 'Create Task',
    description: 'Create operational tasks (shelf refill, stock count, etc.).',
  },

  // --- Management (always accessible regardless of subscription status) ---
  {
    key: Capabilities.MANAGE_PRODUCTS,
    label: 'Manage Products',
    description: 'Create, edit, and archive products and variants.',
  },
  {
    key: Capabilities.MANAGE_EMPLOYEES,
    label: 'Manage Employees',
    description: 'Invite, edit, and deactivate employee accounts.',
  },
  {
    key: Capabilities.MANAGE_CUSTOMERS,
    label: 'Manage Customers',
    description: 'View and manage the customer directory.',
  },
  {
    key: Capabilities.MANAGE_SUPPLIERS,
    label: 'Manage Suppliers',
    description: 'Create and manage supplier records.',
  },
  {
    key: Capabilities.VIEW_SALES_REPORTS,
    label: 'View Sales Reports',
    description: 'Access revenue, transaction, and sales trend reports.',
  },
  {
    key: Capabilities.VIEW_INVENTORY_REPORTS,
    label: 'View Inventory Reports',
    description: 'Access stock movement and valuation reports.',
  },
  {
    key: Capabilities.VIEW_TRANSACTION_HISTORY,
    label: 'View Transaction History',
    description: 'Browse and search full historical transaction records.',
  },
  {
    key: Capabilities.VIEW_ORDER_HISTORY,
    label: 'View Order History',
    description: 'Browse and search full historical order records.',
  },
  {
    key: Capabilities.VIEW_ANALYTICS,
    label: 'View Analytics',
    description: 'Access advanced analytics dashboards (premium).',
  },
  {
    key: Capabilities.EXPORT_DATA,
    label: 'Export Data',
    description: 'Download transaction and inventory data as CSV.',
  },
  {
    key: Capabilities.MANAGE_SETTINGS,
    label: 'Manage Settings',
    description: 'Edit business, branch, and system configuration.',
  },
  {
    key: Capabilities.MANAGE_BRANCHES,
    label: 'Manage Branches',
    description: 'Create and configure additional branches (premium).',
  },
  {
    key: Capabilities.MANAGE_BILLING,
    label: 'Manage Billing',
    description: 'View subscription status, invoices, and payment methods.',
  },
  {
    key: Capabilities.REACTIVATE_SUBSCRIPTION,
    label: 'Reactivate Subscription',
    description: 'Reactivate an expired or cancelled subscription.',
  },
  {
    key: Capabilities.ACCESS_API,
    label: 'Access API',
    description: 'Generate API keys and access the developer API (enterprise).',
  },
]

// ---------------------------------------------------------------------------
// Plan Definitions
// Per master plan §2.7 feature matrix and §2.6 trial entitlement matrix.
// monthlyPrice in PHP cents. includedTxPerMonth = -1 means unlimited.
// ---------------------------------------------------------------------------
type PlanDefinition = {
  name: string
  description: string
  sortOrder: number
  monthlyPrice: number
  includedTxPerMonth: number
  overagePerTx: number
  entitlements: Array<{ key: CapabilityKey; usageLimit: number | null }>
}

const PLANS: PlanDefinition[] = [
  // --------------------------------------------------------------------------
  // Trial — 30-day free trial
  // Full core access with a monthly transaction cap as conversion pressure.
  // --------------------------------------------------------------------------
  {
    name: 'Trial',
    description: '30-day free trial. Full access to core features with a monthly transaction limit.',
    sortOrder: 0,
    monthlyPrice: 0,
    includedTxPerMonth: 300,
    overagePerTx: 0, // Block on overage; no charges
    entitlements: [
      { key: Capabilities.COMPLETE_CHECKOUT, usageLimit: null },
      { key: Capabilities.CREATE_ORDER, usageLimit: null },
      { key: Capabilities.EDIT_ACTIVE_ORDER, usageLimit: null },
      { key: Capabilities.RECORD_PAYMENT, usageLimit: null },
      { key: Capabilities.ISSUE_REFUND, usageLimit: null },
      { key: Capabilities.PRINT_RECEIPT, usageLimit: null },
      { key: Capabilities.START_VENDOR_SESSION, usageLimit: null },
      { key: Capabilities.CREATE_PURCHASE, usageLimit: null },
      { key: Capabilities.MANAGE_INVENTORY, usageLimit: null },
      { key: Capabilities.CREATE_TASK, usageLimit: null },
      { key: Capabilities.MANAGE_PRODUCTS, usageLimit: null },
      { key: Capabilities.MANAGE_EMPLOYEES, usageLimit: null },
      { key: Capabilities.MANAGE_CUSTOMERS, usageLimit: null },
      { key: Capabilities.MANAGE_SUPPLIERS, usageLimit: null },
      { key: Capabilities.VIEW_SALES_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_INVENTORY_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_TRANSACTION_HISTORY, usageLimit: null },
      { key: Capabilities.VIEW_ORDER_HISTORY, usageLimit: null },
      { key: Capabilities.EXPORT_DATA, usageLimit: null },
      { key: Capabilities.MANAGE_SETTINGS, usageLimit: null },
      { key: Capabilities.MANAGE_BILLING, usageLimit: null },
      { key: Capabilities.REACTIVATE_SUBSCRIPTION, usageLimit: null },
      // VIEW_ANALYTICS, MANAGE_BRANCHES, ACCESS_API → not included in Trial
    ],
  },

  // --------------------------------------------------------------------------
  // Starter — single branch, up to 5 employees
  // --------------------------------------------------------------------------
  {
    name: 'Starter',
    description: 'For small single-location businesses. Core POS, inventory, and reporting.',
    sortOrder: 1,
    monthlyPrice: 49900, // ₱499.00 / month
    includedTxPerMonth: 500,
    overagePerTx: 0,
    entitlements: [
      { key: Capabilities.COMPLETE_CHECKOUT, usageLimit: null },
      { key: Capabilities.CREATE_ORDER, usageLimit: null },
      { key: Capabilities.EDIT_ACTIVE_ORDER, usageLimit: null },
      { key: Capabilities.RECORD_PAYMENT, usageLimit: null },
      { key: Capabilities.ISSUE_REFUND, usageLimit: null },
      { key: Capabilities.PRINT_RECEIPT, usageLimit: null },
      { key: Capabilities.START_VENDOR_SESSION, usageLimit: null },
      { key: Capabilities.CREATE_PURCHASE, usageLimit: null },
      { key: Capabilities.MANAGE_INVENTORY, usageLimit: null },
      { key: Capabilities.CREATE_TASK, usageLimit: null },
      { key: Capabilities.MANAGE_PRODUCTS, usageLimit: null },
      { key: Capabilities.MANAGE_EMPLOYEES, usageLimit: 5 }, // ← capped
      { key: Capabilities.MANAGE_CUSTOMERS, usageLimit: null },
      { key: Capabilities.MANAGE_SUPPLIERS, usageLimit: null },
      { key: Capabilities.VIEW_SALES_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_INVENTORY_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_TRANSACTION_HISTORY, usageLimit: null },
      { key: Capabilities.VIEW_ORDER_HISTORY, usageLimit: null },
      { key: Capabilities.EXPORT_DATA, usageLimit: null },
      { key: Capabilities.MANAGE_SETTINGS, usageLimit: null },
      { key: Capabilities.MANAGE_BILLING, usageLimit: null },
      { key: Capabilities.REACTIVATE_SUBSCRIPTION, usageLimit: null },
      // VIEW_ANALYTICS, MANAGE_BRANCHES, ACCESS_API → not included in Starter
    ],
  },

  // --------------------------------------------------------------------------
  // Professional — multi-branch, up to 20 employees, analytics + full export
  // --------------------------------------------------------------------------
  {
    name: 'Professional',
    description: 'For growing businesses. Multi-branch, advanced reporting, and full data export.',
    sortOrder: 2,
    monthlyPrice: 149900, // ₱1,499.00 / month
    includedTxPerMonth: 2000,
    overagePerTx: 0,
    entitlements: [
      { key: Capabilities.COMPLETE_CHECKOUT, usageLimit: null },
      { key: Capabilities.CREATE_ORDER, usageLimit: null },
      { key: Capabilities.EDIT_ACTIVE_ORDER, usageLimit: null },
      { key: Capabilities.RECORD_PAYMENT, usageLimit: null },
      { key: Capabilities.ISSUE_REFUND, usageLimit: null },
      { key: Capabilities.PRINT_RECEIPT, usageLimit: null },
      { key: Capabilities.START_VENDOR_SESSION, usageLimit: null },
      { key: Capabilities.CREATE_PURCHASE, usageLimit: null },
      { key: Capabilities.MANAGE_INVENTORY, usageLimit: null },
      { key: Capabilities.CREATE_TASK, usageLimit: null },
      { key: Capabilities.MANAGE_PRODUCTS, usageLimit: null },
      { key: Capabilities.MANAGE_EMPLOYEES, usageLimit: 20 }, // ← capped
      { key: Capabilities.MANAGE_CUSTOMERS, usageLimit: null },
      { key: Capabilities.MANAGE_SUPPLIERS, usageLimit: null },
      { key: Capabilities.VIEW_SALES_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_INVENTORY_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_TRANSACTION_HISTORY, usageLimit: null },
      { key: Capabilities.VIEW_ORDER_HISTORY, usageLimit: null },
      { key: Capabilities.VIEW_ANALYTICS, usageLimit: null }, // ← unlocked
      { key: Capabilities.EXPORT_DATA, usageLimit: null },
      { key: Capabilities.MANAGE_SETTINGS, usageLimit: null },
      { key: Capabilities.MANAGE_BRANCHES, usageLimit: null }, // ← unlocked
      { key: Capabilities.MANAGE_BILLING, usageLimit: null },
      { key: Capabilities.REACTIVATE_SUBSCRIPTION, usageLimit: null },
      // ACCESS_API → not included in Professional
    ],
  },

  // --------------------------------------------------------------------------
  // Enterprise — unlimited everything + API access
  // --------------------------------------------------------------------------
  {
    name: 'Enterprise',
    description: 'For large operations. Unlimited employees, branches, transactions, and API access.',
    sortOrder: 3,
    monthlyPrice: 499900, // ₱4,999.00 / month
    includedTxPerMonth: -1, // Unlimited
    overagePerTx: 0,
    entitlements: [
      { key: Capabilities.COMPLETE_CHECKOUT, usageLimit: null },
      { key: Capabilities.CREATE_ORDER, usageLimit: null },
      { key: Capabilities.EDIT_ACTIVE_ORDER, usageLimit: null },
      { key: Capabilities.RECORD_PAYMENT, usageLimit: null },
      { key: Capabilities.ISSUE_REFUND, usageLimit: null },
      { key: Capabilities.PRINT_RECEIPT, usageLimit: null },
      { key: Capabilities.START_VENDOR_SESSION, usageLimit: null },
      { key: Capabilities.CREATE_PURCHASE, usageLimit: null },
      { key: Capabilities.MANAGE_INVENTORY, usageLimit: null },
      { key: Capabilities.CREATE_TASK, usageLimit: null },
      { key: Capabilities.MANAGE_PRODUCTS, usageLimit: null },
      { key: Capabilities.MANAGE_EMPLOYEES, usageLimit: null }, // ← unlimited
      { key: Capabilities.MANAGE_CUSTOMERS, usageLimit: null },
      { key: Capabilities.MANAGE_SUPPLIERS, usageLimit: null },
      { key: Capabilities.VIEW_SALES_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_INVENTORY_REPORTS, usageLimit: null },
      { key: Capabilities.VIEW_TRANSACTION_HISTORY, usageLimit: null },
      { key: Capabilities.VIEW_ORDER_HISTORY, usageLimit: null },
      { key: Capabilities.VIEW_ANALYTICS, usageLimit: null },
      { key: Capabilities.EXPORT_DATA, usageLimit: null },
      { key: Capabilities.MANAGE_SETTINGS, usageLimit: null },
      { key: Capabilities.MANAGE_BRANCHES, usageLimit: null },
      { key: Capabilities.MANAGE_BILLING, usageLimit: null },
      { key: Capabilities.REACTIVATE_SUBSCRIPTION, usageLimit: null },
      { key: Capabilities.ACCESS_API, usageLimit: null }, // ← unlocked
    ],
  },
]

// ---------------------------------------------------------------------------
// Seed function — called by the seeder pipeline in index.ts
// ---------------------------------------------------------------------------
export async function Entitlements(prisma: PrismaClient) {
  console.info('🔐 Seeding Feature registry...')

  // Step 1: Upsert all Feature records
  for (const feature of FEATURES) {
    await prisma.feature.upsert({
      where: { key: feature.key },
      update: {
        label: feature.label,
        description: feature.description,
        isOperational: OPERATIONAL_CAPABILITIES.has(feature.key),
      },
      create: {
        key: feature.key,
        label: feature.label,
        description: feature.description,
        isOperational: OPERATIONAL_CAPABILITIES.has(feature.key),
      },
    })
  }

  console.info(`   ✔  ${FEATURES.length} features upserted.`)
  console.info('📦 Seeding SubscriptionPlan tiers...')

  // Step 2: Upsert SubscriptionPlan records + their PlanEntitlement rows
  for (const plan of PLANS) {
    const { entitlements, ...planData } = plan

    const upsertedPlan = await prisma.subscriptionPlan.upsert({
      where: { name: planData.name },
      update: {
        description: planData.description,
        sortOrder: planData.sortOrder,
        monthlyPrice: planData.monthlyPrice,
        includedTxPerMonth: planData.includedTxPerMonth,
        overagePerTx: planData.overagePerTx,
        isActive: true,
      },
      create: { ...planData, isActive: true },
    })

    for (const entitlement of entitlements) {
      await prisma.planEntitlement.upsert({
        where: {
          planId_featureKey: {
            planId: upsertedPlan.id,
            featureKey: entitlement.key,
          },
        },
        update: { usageLimit: entitlement.usageLimit },
        create: {
          planId: upsertedPlan.id,
          featureKey: entitlement.key,
          usageLimit: entitlement.usageLimit,
        },
      })
    }

    console.info(`   ✔  Plan "${planData.name}" — ${entitlements.length} entitlements upserted.`)
  }

  console.info('✅ Entitlement seed complete.')
}

export default Entitlements
