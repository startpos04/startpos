/**
 * entitlements.ts — Entitlement Engine seed (Phase 2 + Phase 5)
 *
 * Seeds the Feature registry, SubscriptionPlan tiers, PlanEntitlement
 * join records, billing policy config defaults, and (Phase 5) the initial
 * PricingCatalog v1 with FeaturePrice records for all selectable features.
 *
 * Design decisions:
 *  - All upserts keyed on stable natural keys (Feature.key, SubscriptionPlan.name)
 *    so the seed is fully idempotent — safe to re-run at any time.
 *  - Capability keys imported directly from the domain module to prevent
 *    string drift between the code and the DB.
 *  - No CSV used: entitlement data is platform-global and code-defined.
 *    It is the same in every environment and must stay typed against CapabilityKey.
 *  - order = 0: runs before all tenant-specific seeders.
 *  - Phase 5: FeatureDependency DAG is validated post-seed to prevent cycle insertion.
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
// Phase 5b fields:
//   isSelectableByCustomer → true = appears in the pricing calculator
//   pricingCategory        → grouping category for calculator display
//   sortOrder              → display order within the category
// ---------------------------------------------------------------------------
const FEATURES: Array<{
  key: CapabilityKey
  label: string
  description: string
  isSelectableByCustomer: boolean
  pricingCategory: string | null
  sortOrder: number
}> = [
  // --- Operational (blocked when subscription lapses) ---
  {
    key: Capabilities.COMPLETE_CHECKOUT,
    label: 'Complete Checkout',
    description: 'Process a POS transaction and collect payment.',
    isSelectableByCustomer: true,
    pricingCategory: 'CORE',
    sortOrder: 10,
  },
  {
    key: Capabilities.CREATE_ORDER,
    label: 'Create Order',
    description: 'Create a new kitchen or service order.',
    isSelectableByCustomer: true,
    pricingCategory: 'OPERATIONAL',
    sortOrder: 20,
  },
  {
    key: Capabilities.EDIT_ACTIVE_ORDER,
    label: 'Edit Active Order',
    description: 'Modify an order that is currently in progress.',
    isSelectableByCustomer: true,
    pricingCategory: 'OPERATIONAL',
    sortOrder: 30,
  },
  {
    key: Capabilities.RECORD_PAYMENT,
    label: 'Record Payment',
    description: 'Record a payment against an existing order or invoice.',
    isSelectableByCustomer: true,
    pricingCategory: 'CORE',
    sortOrder: 20,
  },
  {
    key: Capabilities.ISSUE_REFUND,
    label: 'Issue Refund',
    description: 'Process a refund transaction against a completed sale.',
    isSelectableByCustomer: true,
    pricingCategory: 'OPERATIONAL',
    sortOrder: 40,
  },
  {
    key: Capabilities.PRINT_RECEIPT,
    label: 'Print Receipt',
    description: 'Generate and print or download a transaction receipt.',
    isSelectableByCustomer: true,
    pricingCategory: 'OPERATIONAL',
    sortOrder: 50,
  },
  {
    key: Capabilities.START_VENDOR_SESSION,
    label: 'Start Vendor Session',
    description: 'Open a vendor / cash reconciliation session.',
    isSelectableByCustomer: true,
    pricingCategory: 'OPERATIONAL',
    sortOrder: 60,
  },
  {
    key: Capabilities.CREATE_PURCHASE,
    label: 'Create Purchase',
    description: 'Record a new stock purchase from a supplier.',
    isSelectableByCustomer: true,
    pricingCategory: 'OPERATIONAL',
    sortOrder: 70,
  },
  {
    key: Capabilities.MANAGE_INVENTORY,
    label: 'Manage Inventory',
    description: 'Adjust, transfer, and reconcile inventory stock.',
    isSelectableByCustomer: true,
    pricingCategory: 'CORE',
    sortOrder: 30,
  },
  {
    key: Capabilities.CREATE_TASK,
    label: 'Create Task',
    description: 'Create operational tasks (shelf refill, stock count, etc.).',
    isSelectableByCustomer: true,
    pricingCategory: 'OPERATIONAL',
    sortOrder: 80,
  },

  // --- Management (always accessible regardless of subscription status) ---
  {
    key: Capabilities.MANAGE_PRODUCTS,
    label: 'Manage Products',
    description: 'Create, edit, and archive products and variants.',
    isSelectableByCustomer: true,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 10,
  },
  {
    key: Capabilities.MANAGE_EMPLOYEES,
    label: 'Manage Employees',
    description: 'Invite, edit, and deactivate employee accounts.',
    isSelectableByCustomer: true,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 20,
  },
  {
    key: Capabilities.MANAGE_CUSTOMERS,
    label: 'Manage Customers',
    description: 'View and manage the customer directory.',
    isSelectableByCustomer: true,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 30,
  },
  {
    key: Capabilities.MANAGE_SUPPLIERS,
    label: 'Manage Suppliers',
    description: 'Create and manage supplier records.',
    isSelectableByCustomer: true,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 40,
  },
  {
    key: Capabilities.VIEW_SALES_REPORTS,
    label: 'View Sales Reports',
    description: 'Access revenue, transaction, and sales trend reports.',
    isSelectableByCustomer: true,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 50,
  },
  {
    key: Capabilities.VIEW_INVENTORY_REPORTS,
    label: 'View Inventory Reports',
    description: 'Access stock movement and valuation reports.',
    isSelectableByCustomer: true,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 60,
  },
  {
    key: Capabilities.VIEW_TRANSACTION_HISTORY,
    label: 'View Transaction History',
    description: 'Browse and search full historical transaction records.',
    isSelectableByCustomer: false, // Included free — not a paid selection
    pricingCategory: 'MANAGEMENT',
    sortOrder: 70,
  },
  {
    key: Capabilities.VIEW_ORDER_HISTORY,
    label: 'View Order History',
    description: 'Browse and search full historical order records.',
    isSelectableByCustomer: false,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 80,
  },
  {
    key: Capabilities.VIEW_ANALYTICS,
    label: 'View Analytics',
    description: 'Access advanced analytics dashboards (premium).',
    isSelectableByCustomer: true,
    pricingCategory: 'ADVANCED',
    sortOrder: 10,
  },
  {
    key: Capabilities.EXPORT_DATA,
    label: 'Export Data',
    description: 'Download transaction and inventory data as CSV.',
    isSelectableByCustomer: true,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 90,
  },
  {
    key: Capabilities.MANAGE_SETTINGS,
    label: 'Manage Settings',
    description: 'Edit business, branch, and system configuration.',
    isSelectableByCustomer: false,
    pricingCategory: 'MANAGEMENT',
    sortOrder: 100,
  },
  {
    key: Capabilities.MANAGE_BRANCHES,
    label: 'Manage Branches',
    description: 'Create and configure additional branches (premium).',
    isSelectableByCustomer: true,
    pricingCategory: 'ADVANCED',
    sortOrder: 20,
  },
  {
    key: Capabilities.MANAGE_BILLING,
    label: 'Manage Billing',
    description: 'View subscription status, invoices, and payment methods.',
    isSelectableByCustomer: false,
    pricingCategory: null,
    sortOrder: 0,
  },
  {
    key: Capabilities.REACTIVATE_SUBSCRIPTION,
    label: 'Reactivate Subscription',
    description: 'Reactivate an expired or cancelled subscription.',
    isSelectableByCustomer: false,
    pricingCategory: null,
    sortOrder: 0,
  },
  {
    key: Capabilities.ACCESS_API,
    label: 'Access API',
    description: 'Generate API keys and access the developer API (enterprise).',
    isSelectableByCustomer: true,
    pricingCategory: 'INTEGRATION',
    sortOrder: 10,
  },
  // Future capabilities — not yet built; seeded so BOS registry IDs resolve
  {
    key: Capabilities.LOYALTY_POINTS,
    label: 'Loyalty Points',
    description: 'Award and redeem loyalty points at checkout.',
    isSelectableByCustomer: false,
    pricingCategory: null,
    sortOrder: 0,
  },
  {
    key: Capabilities.KITCHEN_DISPLAY,
    label: 'Kitchen Display System',
    description: 'Display orders on a kitchen screen as they come in.',
    isSelectableByCustomer: false,
    pricingCategory: null,
    sortOrder: 0,
  },
  {
    key: Capabilities.DELIVERY_MANAGEMENT,
    label: 'Delivery Management',
    description: 'Manage delivery orders and track driver assignments.',
    isSelectableByCustomer: false,
    pricingCategory: null,
    sortOrder: 0,
  },
]

// ---------------------------------------------------------------------------
// Plan Definitions
//
// Three production tiers + one Trial. All tiers support all billing models —
// the plan defines WHAT you get, the billing model defines HOW you pay.
//
// Tier capability matrix:
//   Basic      — checkout, products, customers, orders, all reports, settings,
//                billing, 1 employee (usageLimit: 1), 1 branch (usageLimit: 1)
//   Premium    — Basic + inventory, vendor session, suppliers, export data,
//                unlimited employees (usageLimit: null), up to 3 branches
//   Enterprise — Premium + purchases, tasks, up to 5 branches
//                NOTE: Analytics & API are add-ons on all tiers, not bundled.
//
// Trial uses Enterprise features with tight limits to let new registrants
// explore everything without being able to abuse it:
//   - 100 TX/month (lower than Basic's 500)
//   - 1 employee (same as Basic — minimum meaningful cap)
//   - 1 branch (same as Basic)
//   - No analytics or API (add-ons must be purchased separately)
//   - Expires after 30 days → prompts upgrade to a paid plan.
//
// monthlyPrice in PHP cents. includedTxPerMonth: -1 = unlimited.
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

// Shared Basic capabilities — reused by Basic and as the foundation for Premium/Enterprise
const BASIC_ENTITLEMENTS: Array<{ key: CapabilityKey; usageLimit: number | null }> = [
  { key: Capabilities.COMPLETE_CHECKOUT, usageLimit: null },
  { key: Capabilities.RECORD_PAYMENT, usageLimit: null },
  { key: Capabilities.PRINT_RECEIPT, usageLimit: null },
  { key: Capabilities.ISSUE_REFUND, usageLimit: null },
  { key: Capabilities.CREATE_ORDER, usageLimit: null },
  { key: Capabilities.EDIT_ACTIVE_ORDER, usageLimit: null },
  { key: Capabilities.MANAGE_PRODUCTS, usageLimit: null },
  { key: Capabilities.MANAGE_CUSTOMERS, usageLimit: null },
  { key: Capabilities.VIEW_SALES_REPORTS, usageLimit: null },
  { key: Capabilities.VIEW_INVENTORY_REPORTS, usageLimit: null },
  { key: Capabilities.VIEW_TRANSACTION_HISTORY, usageLimit: null },
  { key: Capabilities.VIEW_ORDER_HISTORY, usageLimit: null },
  { key: Capabilities.MANAGE_SETTINGS, usageLimit: null },
  { key: Capabilities.MANAGE_BILLING, usageLimit: null },
  { key: Capabilities.REACTIVATE_SUBSCRIPTION, usageLimit: null },
  // 1 employee limit on Basic — upgrade pressure to Premium
  { key: Capabilities.MANAGE_EMPLOYEES, usageLimit: 1 },
  // 1 branch limit on Basic
  { key: Capabilities.MANAGE_BRANCHES, usageLimit: 1 },
]

// Premium adds on top of Basic
const PREMIUM_ADDITIONS: Array<{ key: CapabilityKey; usageLimit: number | null }> = [
  { key: Capabilities.MANAGE_INVENTORY, usageLimit: null },
  { key: Capabilities.START_VENDOR_SESSION, usageLimit: null },
  { key: Capabilities.MANAGE_SUPPLIERS, usageLimit: null },
  { key: Capabilities.EXPORT_DATA, usageLimit: null },
]

// Premium replaces the 1-employee and 1-branch Basic caps
const PREMIUM_ENTITLEMENTS: Array<{ key: CapabilityKey; usageLimit: number | null }> = [
  ...BASIC_ENTITLEMENTS.filter(e => e.key !== Capabilities.MANAGE_EMPLOYEES && e.key !== Capabilities.MANAGE_BRANCHES),
  { key: Capabilities.MANAGE_EMPLOYEES, usageLimit: null }, // unlimited
  { key: Capabilities.MANAGE_BRANCHES, usageLimit: 3 }, // up to 3 branches
  ...PREMIUM_ADDITIONS,
]

// Enterprise adds on top of Premium.
// Analytics (VIEW_ANALYTICS) and API (ACCESS_API) are NOT included here —
// they are add-ons purchasable on any tier, not bundled with Enterprise.
const ENTERPRISE_ENTITLEMENTS: Array<{ key: CapabilityKey; usageLimit: number | null }> = [
  ...PREMIUM_ENTITLEMENTS.filter(e => e.key !== Capabilities.MANAGE_BRANCHES),
  { key: Capabilities.MANAGE_BRANCHES, usageLimit: 5 }, // up to 5 branches
  { key: Capabilities.CREATE_PURCHASE, usageLimit: null },
  { key: Capabilities.CREATE_TASK, usageLimit: null },
]

// Trial gets all Enterprise features so registrants can explore the full product,
// but with hard limits to prevent abuse:
//   - 1 employee (usageLimit: 1) — same as Basic
//   - 1 branch (usageLimit: 1) — same as Basic
//   - No analytics or API — add-ons must be purchased after upgrading
const TRIAL_ENTITLEMENTS: Array<{ key: CapabilityKey; usageLimit: number | null }> = [
  ...ENTERPRISE_ENTITLEMENTS.filter(e => e.key !== Capabilities.MANAGE_EMPLOYEES && e.key !== Capabilities.MANAGE_BRANCHES),
  { key: Capabilities.MANAGE_EMPLOYEES, usageLimit: 1 }, // capped at 1 — same as Basic
  { key: Capabilities.MANAGE_BRANCHES, usageLimit: 1 }, // capped at 1 — same as Basic
]

const PLANS: PlanDefinition[] = [
  // --------------------------------------------------------------------------
  // Trial — Enterprise features with strict limits to prevent abuse.
  // New registrants get this plan on signup, no card required.
  // Expires after 30 days → prompts upgrade to a paid plan.
  //   - 100 TX/month (below Basic's 500 — hard cap)
  //   - 1 employee, 1 branch (same as Basic)
  //   - No analytics or API add-ons
  // --------------------------------------------------------------------------
  {
    name: 'Trial',
    description: 'Try every Enterprise feature free for 30 days. Limited to 100 transactions, 1 employee, and 1 branch.',
    sortOrder: 0,
    monthlyPrice: 0,
    includedTxPerMonth: 100,
    overagePerTx: 0,
    entitlements: TRIAL_ENTITLEMENTS,
  },

  // --------------------------------------------------------------------------
  // Basic — entry-level paid tier.
  // Checkout + products + reports + 1 employee. All billing models supported.
  // --------------------------------------------------------------------------
  {
    name: 'Basic',
    description: 'Essential POS for solo operators. Checkout, products, reports, and 1 employee account.',
    sortOrder: 1,
    monthlyPrice: 29900, // ₱299/mo
    includedTxPerMonth: 500,
    overagePerTx: 0,
    entitlements: BASIC_ENTITLEMENTS,
  },

  // --------------------------------------------------------------------------
  // Premium — growth tier.
  // Adds inventory, unlimited employees, vendor sessions, suppliers, export.
  // --------------------------------------------------------------------------
  {
    name: 'Premium',
    description: 'For growing businesses. Adds inventory management, unlimited employees, and data export.',
    sortOrder: 2,
    monthlyPrice: 79900, // ₱799/mo
    includedTxPerMonth: 2000,
    overagePerTx: 0,
    entitlements: PREMIUM_ENTITLEMENTS,
  },

  // --------------------------------------------------------------------------
  // Enterprise — full-feature tier.
  // Adds purchases, tasks, and up to 5 branches on top of Premium.
  // Analytics and API access are available as add-ons on any tier.
  // --------------------------------------------------------------------------
  {
    name: 'Enterprise',
    description: 'Full-featured for large operations. Purchase orders, tasks, and up to 5 branches. Analytics & API available as add-ons.',
    sortOrder: 3,
    monthlyPrice: 199900, // ₱1,999/mo
    includedTxPerMonth: -1, // Unlimited
    overagePerTx: 0,
    entitlements: ENTERPRISE_ENTITLEMENTS,
  },
]

// ---------------------------------------------------------------------------
// Billing Policy Config Defaults — Phase 0
// These SystemConfig records are seeded at the BUSINESS scope with a sentinel
// businessId of null (platform-level defaults). getAuthUser merges them into
// the session so SubscriptionPolicy always has threshold values available.
//
// All values are stored as strings in SystemConfig (coerced at read time).
// Keys must match the ConfigKey enum values exactly.
// ---------------------------------------------------------------------------
type BillingConfigDefault = {
  key: string
  value: string
  description: string
}

const BILLING_CONFIG_DEFAULTS: BillingConfigDefault[] = [
  {
    key: 'TRIAL_DURATION_DAYS',
    value: '30',
    description: 'Days from subscription creation before TRIAL expires.',
  },
  {
    key: 'GRACE_PERIOD_DAYS',
    value: '7',
    description: 'Days after expiry before hard operational restriction (GRACE_PERIOD → EXPIRED).',
  },
  {
    key: 'LONG_TERM_INACTIVE_DAYS',
    value: '90',
    description: 'Days after EXPIRED before account is moved to LONG_TERM_INACTIVE.',
  },
  {
    key: 'CREDIT_LOW_BALANCE_THRESHOLD',
    value: '10',
    description: 'Notify when prepaid credit balance falls below this number of units.',
  },
  {
    key: 'OVERAGE_BILLING_ENABLED',
    value: 'false',
    description: 'When false, checkout is blocked when TX allowance is exhausted. When true, overage is billed.',
  },
  // --- Add-on pricing defaults (PHP cents) ---
  // All values are admin-configurable via SystemConfig — no hardcoded prices in code.
  {
    key: 'ADDON_ANALYTICS_PRICE',
    value: '29900',
    description: 'Monthly price in PHP cents for the Analytics Dashboard add-on (₱299/mo).',
  },
  {
    key: 'ADDON_API_PRICE',
    value: '49900',
    description: 'Monthly price in PHP cents for the API Access add-on (₱499/mo).',
  },
  {
    key: 'ADDON_BRANCH_PRICE',
    value: '19900',
    description: 'Monthly price in PHP cents per extra branch add-on (₱199/branch/mo).',
  },
  {
    key: 'ADDON_EMPLOYEE_PRICE',
    value: '4900',
    description: 'Monthly price in PHP cents per extra employee add-on — Basic tier only (₱49/employee/mo).',
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
        // Phase 5b — composable pricing fields
        isSelectableByCustomer: feature.isSelectableByCustomer,
        pricingCategory: feature.pricingCategory as any,
        sortOrder: feature.sortOrder,
      },
      create: {
        key: feature.key,
        label: feature.label,
        description: feature.description,
        isOperational: OPERATIONAL_CAPABILITIES.has(feature.key),
        // Phase 5b — composable pricing fields
        isSelectableByCustomer: feature.isSelectableByCustomer,
        pricingCategory: feature.pricingCategory as any,
        sortOrder: feature.sortOrder,
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

  // Step 3: Seed billing policy defaults into SystemConfig.
  // These are platform-global defaults stored with no entity IDs.
  // We use findFirst + conditional create because Prisma upsert requires a
  // non-null unique key, and all entity FKs here are null (global scope).
  // Existing values are NOT overwritten — re-runs are safe.
  console.info('⚙️  Seeding billing policy config defaults...')
  for (const cfg of BILLING_CONFIG_DEFAULTS) {
    const existing = await (prisma as any).systemConfig.findFirst({
      where: {
        key: cfg.key,
        businessId: null,
        branchId: null,
        userId: null,
        scope: 'BUSINESS',
      },
    })

    if (!existing) {
      await (prisma as any).systemConfig.create({
        data: {
          key: cfg.key,
          value: cfg.value,
          scope: 'BUSINESS',
          // businessId / branchId / userId intentionally omitted (global default)
        },
      })
      console.info(`   ✔  Config "${cfg.key}" = "${cfg.value}" seeded.`)
    } else {
      console.info(`   –  Config "${cfg.key}" already exists (value: "${existing.value}"), skipped.`)
    }
  }
  console.info(`   ✔  ${BILLING_CONFIG_DEFAULTS.length} billing config defaults processed.`)

  // ---------------------------------------------------------------------------
  // Step 4: Seed initial PricingCatalog v1 (Phase 5)
  // Creates the first versioned catalog with FeaturePrice records for all
  // selectable features. Idempotent — skipped if version 1 already exists.
  // ---------------------------------------------------------------------------
  console.info('📊 Seeding PricingCatalog v1...')

  // Monthly prices in PHP cents for each selectable feature
  const FEATURE_PRICES: Array<{
    featureKey: CapabilityKey
    monthlyPrice: number
    isIncludedInBase: boolean
  }> = [
    // CORE — included in base (no charge)
    { featureKey: Capabilities.COMPLETE_CHECKOUT, monthlyPrice: 0, isIncludedInBase: true },
    { featureKey: Capabilities.MANAGE_INVENTORY, monthlyPrice: 0, isIncludedInBase: true },
    { featureKey: Capabilities.RECORD_PAYMENT, monthlyPrice: 0, isIncludedInBase: true },
    // OPERATIONAL — à la carte
    { featureKey: Capabilities.CREATE_ORDER, monthlyPrice: 49900, isIncludedInBase: false },
    { featureKey: Capabilities.EDIT_ACTIVE_ORDER, monthlyPrice: 19900, isIncludedInBase: false },
    { featureKey: Capabilities.ISSUE_REFUND, monthlyPrice: 19900, isIncludedInBase: false },
    { featureKey: Capabilities.PRINT_RECEIPT, monthlyPrice: 9900, isIncludedInBase: false },
    { featureKey: Capabilities.START_VENDOR_SESSION, monthlyPrice: 29900, isIncludedInBase: false },
    { featureKey: Capabilities.CREATE_PURCHASE, monthlyPrice: 29900, isIncludedInBase: false },
    { featureKey: Capabilities.CREATE_TASK, monthlyPrice: 19900, isIncludedInBase: false },
    // MANAGEMENT — à la carte
    { featureKey: Capabilities.MANAGE_PRODUCTS, monthlyPrice: 29900, isIncludedInBase: false },
    { featureKey: Capabilities.MANAGE_EMPLOYEES, monthlyPrice: 19900, isIncludedInBase: false },
    { featureKey: Capabilities.MANAGE_CUSTOMERS, monthlyPrice: 14900, isIncludedInBase: false },
    { featureKey: Capabilities.MANAGE_SUPPLIERS, monthlyPrice: 14900, isIncludedInBase: false },
    { featureKey: Capabilities.VIEW_SALES_REPORTS, monthlyPrice: 29900, isIncludedInBase: false },
    { featureKey: Capabilities.VIEW_INVENTORY_REPORTS, monthlyPrice: 19900, isIncludedInBase: false },
    { featureKey: Capabilities.EXPORT_DATA, monthlyPrice: 9900, isIncludedInBase: false },
    // ADVANCED — premium
    { featureKey: Capabilities.VIEW_ANALYTICS, monthlyPrice: 49900, isIncludedInBase: false },
    { featureKey: Capabilities.MANAGE_BRANCHES, monthlyPrice: 49900, isIncludedInBase: false },
    // INTEGRATION
    { featureKey: Capabilities.ACCESS_API, monthlyPrice: 99900, isIncludedInBase: false },
  ]

  const existingCatalog = await (prisma as any).pricingCatalog.findFirst({
    where: { version: 1 },
  })

  if (!existingCatalog) {
    const catalog = await (prisma as any).pricingCatalog.create({
      data: {
        version: 1,
        label: '2026 Standard Pricing',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    })

    for (const fp of FEATURE_PRICES) {
      await (prisma as any).featurePrice.create({
        data: {
          catalogId: catalog.id,
          featureKey: fp.featureKey,
          monthlyPrice: fp.monthlyPrice,
          annualPrice: null, // Will be set when annual pricing is configured
          isIncludedInBase: fp.isIncludedInBase,
        },
      })
    }

    console.info(`   ✔  PricingCatalog v1 created (${FEATURE_PRICES.length} feature prices).`)
  } else {
    console.info('   –  PricingCatalog v1 already exists, skipped.')
  }

  console.info('✅ Entitlement seed complete.')
}

export default Entitlements
