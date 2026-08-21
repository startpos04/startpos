/**
 * capability-registry.ts — CAPABILITY_REGISTRY and build-time validation (R4)
 *
 * IMPORTANT — what this registry governs:
 *   - Whether a capability should be CONFIGURED for a business (setup time)
 *   - Whether a capability should be RECOMMENDED (ongoing)
 *   - What config values are applied when a capability is enabled (setup time)
 *
 * What this registry does NOT govern:
 *   - Whether a user can ACCESS a capability at runtime → EntitlementEngine
 *   - Whether a subscription plan includes a capability → PlanEntitlement
 *
 * Adding a new capability = one entry here + Feature seeder + PlanEntitlement seeder.
 * The engines pick it up automatically; no other code changes are needed.
 *
 * Principal Architect Review compliance:
 *   R4  — validateRegistry() catches broken deps, cycles, and invalid refs at build time.
 *   R6  — every capability has rollbackOutputs defined.
 *   P2-3 — plan suggestion is NOT in this registry (it lives in plan-advisor.ts).
 */

import type { CapabilityDefinition, CapabilityOutput, RegistryValidationError } from './types'

// ---------------------------------------------------------------------------
// Helper to produce a rollback output (sets key back to 'false' or default)
// ---------------------------------------------------------------------------

function rollback(key: string, defaultValue = 'false'): CapabilityOutput {
  return { key, value: defaultValue }
}

// ---------------------------------------------------------------------------
// Always-on capabilities (required: () => true, no boosters, threshold 0)
// These are enabled for every business. They cannot be paused.
// trackingEvents are declared in TRACKING_EVENTS_MAP below and merged at export.
// ---------------------------------------------------------------------------

const ALWAYS_ON: Omit<CapabilityDefinition, 'trackingEvents'>[] = [
  {
    id: 'COMPLETE_CHECKOUT',
    label: 'Complete Checkout',
    description: 'Process a sale at the point of sale.',
    category: 'SALES',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Process sales immediately.',
    hardDependencies: [],
    relatedCapabilities: ['RECORD_PAYMENT'],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'RECORD_PAYMENT',
    label: 'Record Payment',
    description: 'Record payment splits — cash, card, e-wallet.',
    category: 'SALES',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Accept multiple payment methods.',
    hardDependencies: ['COMPLETE_CHECKOUT'],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'ISSUE_REFUND',
    label: 'Issue Refund',
    description: 'Process a refund against a prior transaction.',
    category: 'SALES',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Handle returns and refunds easily.',
    hardDependencies: ['COMPLETE_CHECKOUT'],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'MANAGE_PRODUCTS',
    label: 'Manage Products',
    description: 'Create and manage the product catalogue.',
    category: 'SALES',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Build your product catalogue.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'VIEW_SALES_REPORTS',
    label: 'View Sales Reports',
    description: 'Revenue, margin, and product performance reports.',
    category: 'REPORTING',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Understand your sales performance.',
    hardDependencies: [],
    relatedCapabilities: ['VIEW_TRANSACTION_HISTORY'],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'VIEW_TRANSACTION_HISTORY',
    label: 'View Transaction History',
    description: 'Full paginated transaction audit trail.',
    category: 'REPORTING',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Review every transaction with full detail.',
    hardDependencies: [],
    relatedCapabilities: ['VIEW_SALES_REPORTS'],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'MANAGE_SETTINGS',
    label: 'Manage Settings',
    description: 'Units, categories, locations, and business settings.',
    category: 'PLATFORM',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Configure your business settings.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'MANAGE_EMPLOYEES',
    label: 'Manage Employees',
    description: 'Add staff, assign roles, and manage branch access.',
    category: 'PLATFORM',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Control who can access your business.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'MANAGE_BILLING',
    label: 'Manage Billing',
    description: 'View and manage subscription and billing.',
    category: 'PLATFORM',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Manage your subscription plan.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'REACTIVATE_SUBSCRIPTION',
    label: 'Reactivate Subscription',
    description: 'Reactivate after expiry.',
    category: 'PLATFORM',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Resume operations after a subscription lapse.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
  {
    id: 'EXPORT_DATA',
    label: 'Export Data',
    description: 'CSV exports for inventory, transactions.',
    category: 'REPORTING',
    required: () => true,
    boosters: [],
    threshold: 0,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Download your data as spreadsheets.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: () => 0,
  },
]

// ---------------------------------------------------------------------------
// Conditional capabilities
// ---------------------------------------------------------------------------

const CONDITIONAL: Omit<CapabilityDefinition, 'trackingEvents'>[] = [
  // ── Order Queue ────────────────────────────────────────────────────────────
  {
    id: 'CREATE_ORDER',
    label: 'Order Queue',
    description: 'Create kitchen or service orders before collecting payment.',
    category: 'SALES',
    required: c => c.paymentTiming !== 'immediate',
    boosters: [
      { label: 'deferred payment', signal: c => (c.paymentTiming === 'deferred' ? 1.0 : 0.5) },
      { label: 'table management', signal: c => (c.requiresTableManagement ? 0.8 : 0) },
      { label: 'sells food', signal: c => (c.sellsPreparedFood ? 0.7 : 0) },
      { label: 'order customization', signal: c => (c.hasOrderCustomization ? 0.5 : 0) },
    ],
    threshold: 0.5,
    outputs: c => [
      { key: 'ENABLE_ORDER', value: 'true' },
      ...(c.hasOrderCustomization || c.requiresTableManagement ? [{ key: 'ENABLE_ORDER_TAB', value: 'true' }] : []),
    ],
    rollbackOutputs: () => [rollback('ENABLE_ORDER'), rollback('ENABLE_ORDER_TAB')],
    deferrable: true,
    configuredSignal: s => (s.transactionsLast30Days ?? 0) > 10,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: 'Take orders and collect payment when ready — perfect for restaurants and service businesses.',
    hardDependencies: ['COMPLETE_CHECKOUT'],
    relatedCapabilities: ['EDIT_ACTIVE_ORDER'],
    conflicts: [],
    minimumPlan: 'Basic',
    recommendationScore: c => (c.sellsPreparedFood ? 0.9 : c.paymentTiming === 'deferred' ? 0.8 : 0.6),
  },
  {
    id: 'EDIT_ACTIVE_ORDER',
    label: 'Edit Active Order',
    description: 'Modify an in-progress order — add items, change quantities, apply add-ons.',
    category: 'SALES',
    required: c => c.paymentTiming !== 'immediate' && (c.hasOrderCustomization || c.requiresTableManagement),
    boosters: [
      { label: 'table management', signal: c => (c.requiresTableManagement ? 1.0 : 0) },
      { label: 'order customization', signal: c => (c.hasOrderCustomization ? 0.8 : 0) },
    ],
    threshold: 0.5,
    outputs: () => [{ key: 'ENABLE_ORDER_TAB', value: 'true' }],
    rollbackOutputs: () => [rollback('ENABLE_ORDER_TAB')],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 2,
    isComplex: false,
    businessValue: 'Let staff add items and modify orders at the table before payment.',
    hardDependencies: ['CREATE_ORDER'],
    relatedCapabilities: ['CREATE_ORDER'],
    conflicts: [],
    minimumPlan: 'Basic',
    recommendationScore: c => (c.requiresTableManagement ? 0.9 : 0.6),
  },
  // ── Receipt Printing ───────────────────────────────────────────────────────
  {
    id: 'PRINT_RECEIPT',
    label: 'Print Receipt',
    description: 'Print or generate a receipt at checkout.',
    category: 'COMPLIANCE',
    required: c => c.handlesCash || c.isVatRegistered,
    boosters: [
      { label: 'vat registered', signal: c => (c.isVatRegistered ? 1.0 : 0) },
      { label: 'official receipts required', signal: c => (c.requiresOfficialReceipts ? 1.0 : 0) },
      { label: 'corporate buyers', signal: c => (c.hasCorporateBuyers ? 0.8 : 0) },
      { label: 'handles cash', signal: c => (c.handlesCash ? 0.4 : 0) },
    ],
    threshold: 0.3,
    outputs: () => [{ key: 'ENABLE_PRINT_RECEIPT', value: 'true' }],
    rollbackOutputs: () => [rollback('ENABLE_PRINT_RECEIPT')],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: 'Give customers a receipt at every transaction.',
    hardDependencies: ['COMPLETE_CHECKOUT'],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'any',
    recommendationScore: c => (c.requiresOfficialReceipts ? 1.0 : c.isVatRegistered ? 0.8 : 0.5),
  },
  // ── Cash Reconciliation ────────────────────────────────────────────────────
  {
    id: 'START_VENDOR_SESSION',
    label: 'Cash Reconciliation',
    description: 'Open and close shift sessions to reconcile cash at end of day.',
    category: 'FINANCE',
    required: c => c.handlesCash,
    boosters: [
      { label: 'explicitly reconciles cash', signal: c => (c.reconcilesCash ? 1.0 : 0) },
      { label: 'role separation', signal: c => (c.hasRoleSeparation ? 0.6 : 0) },
      { label: 'medium or large team', signal: c => (c.teamSize === 'medium' || c.teamSize === 'large' ? 0.5 : 0) },
      { label: 'high volume', signal: c => (c.dailyTransactionVolume === 'high' || c.dailyTransactionVolume === 'medium' ? 0.4 : 0) },
    ],
    threshold: 0.5,
    outputs: () => [{ key: 'ENABLE_CASH_RECONCILIATION', value: 'true' }],
    rollbackOutputs: () => [rollback('ENABLE_CASH_RECONCILIATION')],
    deferrable: true,
    configuredSignal: s => (s.reconciliationCount ?? 0) >= 5,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: 'Know exactly how much cash your team collected each shift.',
    hardDependencies: ['COMPLETE_CHECKOUT'],
    relatedCapabilities: ['CREATE_TASK'],
    conflicts: [],
    minimumPlan: 'Premium',
    recommendationScore: c => (c.reconcilesCash ? 1.0 : c.handlesCash && c.teamSize !== 'solo' ? 0.7 : 0.4),
  },
  // ── Inventory Management ────────────────────────────────────────────────────
  {
    id: 'MANAGE_INVENTORY',
    label: 'Inventory Tracking',
    description: 'Track stock levels, movements, and adjustments.',
    category: 'INVENTORY',
    required: c => c.tracksInventory,
    boosters: [
      { label: 'physical goods', signal: c => (c.sellsPhysicalGoods ? 0.8 : 0) },
      { label: 'raw materials', signal: c => (c.sellsRawMaterials ? 1.0 : 0) },
      { label: 'strict inventory criticality', signal: c => (c.inventoryCriticality === 'strict' ? 1.0 : 0) },
      { label: 'uses suppliers', signal: c => (c.usesSuppliers ? 0.5 : 0) },
    ],
    threshold: 0.4,
    outputs: c => [{ key: 'LOW_STOCK_THRESHOLD', value: c.inventoryCriticality === 'strict' ? '10' : '20' }],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: s => (s.inventoryAdjustmentCount ?? 0) >= 10,
    estimatedSetupMinutes: 15,
    isComplex: false,
    businessValue: 'Always know your stock levels and get alerts before you run out.',
    hardDependencies: ['MANAGE_PRODUCTS'],
    relatedCapabilities: ['CREATE_PURCHASE', 'VIEW_INVENTORY_REPORTS'],
    conflicts: [],
    minimumPlan: 'Premium',
    recommendationScore: c => (c.inventoryCriticality === 'strict' ? 1.0 : c.sellsPhysicalGoods && c.usesSuppliers ? 0.85 : c.tracksInventory ? 0.8 : 0.5),
  },
  {
    id: 'VIEW_INVENTORY_REPORTS',
    label: 'Inventory Reports',
    description: 'Stock level, movement, and valuation reports.',
    category: 'REPORTING',
    required: c => c.tracksInventory,
    boosters: [{ label: 'tracks inventory', signal: c => (c.tracksInventory ? 1.0 : 0) }],
    threshold: 0.4,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'See stock movement and value at a glance.',
    hardDependencies: ['MANAGE_INVENTORY'],
    relatedCapabilities: ['MANAGE_INVENTORY'],
    conflicts: [],
    minimumPlan: 'Premium',
    recommendationScore: c => (c.tracksInventory ? 0.9 : 0),
  },
  // ── Purchase Orders ────────────────────────────────────────────────────────
  {
    id: 'CREATE_PURCHASE',
    label: 'Purchase Orders',
    description: 'Create and track orders from suppliers.',
    category: 'PROCUREMENT',
    required: c => c.usesSuppliers,
    boosters: [
      { label: 'requires goods receipt', signal: c => (c.requiresGoodsReceipt ? 0.9 : 0) },
      { label: 'requires approvals', signal: c => (c.requiresApprovals ? 0.7 : 0) },
      { label: 'strict inventory', signal: c => (c.inventoryCriticality === 'strict' ? 0.6 : 0) },
      { label: 'raw materials', signal: c => (c.sellsRawMaterials ? 0.8 : 0) },
    ],
    threshold: 0.4,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: s => (s.purchaseOrderCount ?? 0) >= 3,
    estimatedSetupMinutes: 10,
    isComplex: false,
    businessValue: 'Manage what you order from suppliers and reconcile deliveries against orders.',
    hardDependencies: ['MANAGE_SUPPLIERS'],
    relatedCapabilities: ['MANAGE_INVENTORY'],
    conflicts: [],
    minimumPlan: 'Enterprise',
    recommendationScore: c => (c.usesSuppliers && c.requiresGoodsReceipt ? 0.95 : c.usesSuppliers ? 0.8 : 0),
  },
  {
    id: 'MANAGE_SUPPLIERS',
    label: 'Manage Suppliers',
    description: 'Create and manage supplier records.',
    category: 'PROCUREMENT',
    required: c => c.usesSuppliers,
    boosters: [{ label: 'uses suppliers', signal: c => (c.usesSuppliers ? 1.0 : 0) }],
    threshold: 0.4,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: s => (s.supplierCount ?? 0) >= 1,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: 'Keep all your supplier contacts in one place.',
    hardDependencies: [],
    relatedCapabilities: ['CREATE_PURCHASE'],
    conflicts: [],
    minimumPlan: 'Premium',
    recommendationScore: c => (c.usesSuppliers ? 0.95 : 0),
  },
  // ── Task Management ────────────────────────────────────────────────────────
  {
    id: 'CREATE_TASK',
    label: 'Task Management',
    description: 'Create and assign operational workflow tasks to staff.',
    category: 'OPERATIONS',
    required: c => c.teamSize !== 'solo' && c.usesOperationalTasks,
    boosters: [
      { label: 'small team', signal: c => (c.teamSize === 'small' ? 0.5 : 0) },
      { label: 'medium or large team', signal: c => (c.teamSize === 'medium' || c.teamSize === 'large' ? 0.9 : 0) },
      { label: 'uses suppliers', signal: c => (c.usesSuppliers ? 0.5 : 0) },
      { label: 'tracks inventory', signal: c => (c.tracksInventory ? 0.5 : 0) },
    ],
    threshold: 0.4,
    outputs: () => [{ key: 'ENABLE_TASK', value: 'true' }],
    rollbackOutputs: () => [rollback('ENABLE_TASK')],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: 'Assign shelf refills, stock counts, and other tasks to your team.',
    hardDependencies: ['MANAGE_EMPLOYEES'],
    relatedCapabilities: ['MANAGE_INVENTORY', 'START_VENDOR_SESSION'],
    conflicts: [],
    minimumPlan: 'Enterprise',
    recommendationScore: c => (c.teamSize === 'large' ? 0.9 : c.teamSize === 'medium' ? 0.75 : c.teamSize === 'small' ? 0.5 : 0),
  },
  // ── CRM ────────────────────────────────────────────────────────────────────
  {
    id: 'MANAGE_CUSTOMERS',
    label: 'Customer Profiles',
    description: 'Create and manage customer profiles, track visits, and apply discounts.',
    category: 'CRM',
    required: c => c.tracksCustomers || c.hasCorporateBuyers || c.isVatRegistered,
    boosters: [
      { label: 'tracks customers', signal: c => (c.tracksCustomers ? 1.0 : 0) },
      { label: 'corporate buyers', signal: c => (c.hasCorporateBuyers ? 0.9 : 0) },
      { label: 'loyalty intent', signal: c => (c.hasLoyaltyIntent ? 0.7 : 0) },
      { label: 'vat registered', signal: c => (c.isVatRegistered ? 0.4 : 0) },
    ],
    threshold: 0.3,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: s => (s.customerCount ?? 0) >= 10,
    estimatedSetupMinutes: 5,
    isComplex: false,
    businessValue: 'Track your regulars, apply senior/PWD discounts, and issue VAT receipts to corporate buyers.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'Basic',
    recommendationScore: c => (c.hasCorporateBuyers ? 0.95 : c.tracksCustomers ? 0.85 : c.hasLoyaltyIntent ? 0.7 : 0.3),
  },
  // ── Multi-Branch ───────────────────────────────────────────────────────────
  {
    id: 'MANAGE_BRANCHES',
    label: 'Multi-Branch',
    description: 'Add and manage additional branches or outlets.',
    category: 'MULTI_BRANCH',
    required: c => c.locationCount === 'multiple' || c.plansExpansion,
    boosters: [
      { label: 'already multi-location', signal: c => (c.locationCount === 'multiple' ? 1.0 : 0) },
      { label: 'expansion planned', signal: c => (c.plansExpansion ? 0.7 : 0) },
      { label: 'large team', signal: c => (c.teamSize === 'large' || c.teamSize === 'medium' ? 0.4 : 0) },
    ],
    threshold: 0.4,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: s => (s.branchCount ?? 0) >= 2,
    estimatedSetupMinutes: 10,
    isComplex: false,
    businessValue: 'Manage inventory, staff, and sales across all your locations from one account.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'Enterprise',
    recommendationScore: c => (c.locationCount === 'multiple' ? 1.0 : c.plansExpansion ? 0.75 : 0),
  },
  {
    id: 'VIEW_ORDER_HISTORY',
    label: 'Order History',
    description: 'Browse and search historical order records.',
    category: 'REPORTING',
    required: c => c.paymentTiming !== 'immediate',
    boosters: [{ label: 'uses orders', signal: c => (c.paymentTiming !== 'immediate' ? 1.0 : 0) }],
    threshold: 0.4,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: false,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'See the full history of every order placed.',
    hardDependencies: ['CREATE_ORDER'],
    relatedCapabilities: ['CREATE_ORDER'],
    conflicts: [],
    minimumPlan: 'Basic',
    recommendationScore: () => 0,
  },
  // ── Analytics ──────────────────────────────────────────────────────────────
  {
    id: 'VIEW_ANALYTICS',
    label: 'Analytics Dashboard',
    description: 'Advanced analytics: revenue trends, product performance, peak hours.',
    category: 'REPORTING',
    required: c => c.dailyTransactionVolume === 'high' || c.dailyTransactionVolume === 'medium' || c.teamSize === 'large' || c.teamSize === 'medium',
    boosters: [
      { label: 'high volume', signal: c => (c.dailyTransactionVolume === 'high' ? 1.0 : 0) },
      { label: 'medium volume', signal: c => (c.dailyTransactionVolume === 'medium' ? 0.7 : 0) },
      { label: 'large team', signal: c => (c.teamSize === 'large' ? 0.6 : 0) },
      { label: 'medium team', signal: c => (c.teamSize === 'medium' ? 0.4 : 0) },
    ],
    threshold: 0.4,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 0,
    isComplex: false,
    businessValue: 'Spot trends, identify your best-selling products, and find your peak hours.',
    hardDependencies: [],
    relatedCapabilities: ['VIEW_SALES_REPORTS'],
    conflicts: [],
    minimumPlan: 'Enterprise',
    recommendationScore: c => (c.dailyTransactionVolume === 'high' ? 0.9 : 0.6),
  },
  // ── API Access ─────────────────────────────────────────────────────────────
  {
    id: 'ACCESS_API',
    label: 'API Access',
    description: 'Programmatic API access for integrations.',
    category: 'PLATFORM',
    required: c => c.needsExternalIntegrations || c.teamSize === 'large',
    boosters: [
      { label: 'needs integrations', signal: c => (c.needsExternalIntegrations ? 1.0 : 0) },
      { label: 'large team', signal: c => (c.teamSize === 'large' ? 0.5 : 0) },
    ],
    threshold: 0.5,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 30,
    isComplex: true,
    businessValue: 'Connect your external systems — accounting, e-commerce, or custom dashboards.',
    hardDependencies: [],
    relatedCapabilities: [],
    conflicts: [],
    minimumPlan: 'Enterprise',
    recommendationScore: c => (c.needsExternalIntegrations ? 0.9 : 0.4),
  },
  // ── Batch Preparation ──────────────────────────────────────────────────────
  {
    id: 'BATCH_PREPARATION',
    label: 'Batch Preparation',
    description: 'Prepare products in batches ahead of sale, track shelf life, and manage finished goods inventory.',
    category: 'OPERATIONS',
    required: c => c.preparesBatches, // Auto-enable if they said yes in the survey
    boosters: [
      { label: 'prepares batches with recipes', signal: c => (c.preparesBatchesWithRecipes ? 1.0 : 0) },
      { label: 'sells prepared food', signal: c => (c.sellsPreparedFood ? 0.9 : 0) },
      { label: 'tracks inventory', signal: c => (c.tracksInventory ? 0.7 : 0) },
      { label: 'strict inventory', signal: c => (c.inventoryCriticality === 'strict' ? 0.6 : 0) },
    ],
    threshold: 0.5,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: s => (s.productionOrderCount ?? 0) >= 3,
    estimatedSetupMinutes: 15,
    isComplex: false,
    businessValue: 'Prepare items like sandwiches, pastries, or meal prep in batches. Track shelf life and reduce waste.',
    hardDependencies: ['MANAGE_INVENTORY', 'MANAGE_PRODUCTS'],
    relatedCapabilities: ['MANAGE_INVENTORY', 'VIEW_INVENTORY_REPORTS'],
    conflicts: [],
    minimumPlan: 'Premium',
    recommendationScore: c => (c.preparesBatchesWithRecipes && c.tracksInventory ? 1.0 : c.preparesBatches ? 0.8 : 0.3),
  },
]

// ---------------------------------------------------------------------------
// Future capabilities — registered with required: () => false.
// When the feature ships, only the required predicate changes.
// The survey does not change.
// ---------------------------------------------------------------------------

const FUTURE: Omit<CapabilityDefinition, 'trackingEvents'>[] = [
  {
    id: 'LOYALTY_POINTS',
    label: 'Loyalty Points',
    description: 'Reward returning customers with a points programme.',
    category: 'CRM',
    required: () => false, // Not yet built — ships in a future phase
    boosters: [
      { label: 'tracks customers', signal: c => (c.tracksCustomers ? 1.0 : 0) },
      { label: 'loyalty intent', signal: c => (c.hasLoyaltyIntent ? 1.0 : 0) },
    ],
    threshold: 0.5,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 20,
    isComplex: false,
    businessValue: 'Keep regulars coming back with points they can redeem for discounts.',
    hardDependencies: ['MANAGE_CUSTOMERS'],
    relatedCapabilities: ['MANAGE_CUSTOMERS'],
    conflicts: [],
    minimumPlan: 'Premium',
    recommendationScore: c => (c.hasLoyaltyIntent ? 0.9 : c.tracksCustomers ? 0.7 : 0.3),
  },
  {
    id: 'KITCHEN_DISPLAY',
    label: 'Kitchen Display System',
    description: 'Display orders on a kitchen screen as they come in.',
    category: 'OPERATIONS',
    required: () => false, // Not yet built
    boosters: [
      { label: 'sells food', signal: c => (c.sellsPreparedFood ? 1.0 : 0) },
      { label: 'order customization', signal: c => (c.hasOrderCustomization ? 0.8 : 0) },
    ],
    threshold: 0.5,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 30,
    isComplex: true,
    businessValue: 'Keep kitchen staff in sync with front-of-house without paper tickets.',
    hardDependencies: ['CREATE_ORDER'],
    relatedCapabilities: ['CREATE_ORDER'],
    conflicts: [],
    minimumPlan: 'Enterprise',
    recommendationScore: c => (c.sellsPreparedFood && c.hasOrderCustomization ? 0.85 : 0.4),
  },
  {
    id: 'DELIVERY_MANAGEMENT',
    label: 'Delivery Management',
    description: 'Manage delivery orders and track driver assignments.',
    category: 'OPERATIONS',
    required: () => false, // Not yet built
    boosters: [{ label: 'offers delivery', signal: c => (c.offersDelivery ? 1.0 : 0) }],
    threshold: 0.5,
    outputs: () => [],
    rollbackOutputs: () => [],
    deferrable: true,
    configuredSignal: () => false,
    estimatedSetupMinutes: 20,
    isComplex: false,
    businessValue: 'Coordinate delivery orders and driver assignments from your dashboard.',
    hardDependencies: ['CREATE_ORDER'],
    relatedCapabilities: ['CREATE_ORDER'],
    conflicts: [],
    minimumPlan: 'Enterprise',
    recommendationScore: c => (c.offersDelivery ? 0.9 : 0),
  },
]

// ---------------------------------------------------------------------------
// The single registry
// ---------------------------------------------------------------------------

/**
 * TRACKING_EVENTS_MAP — Phase 6 observability declarations.
 *
 * Documents which BusinessEventType values each capability should emit,
 * and at which point in the application. Keyed by capability ID.
 *
 * These are declarations only. Emission happens in the relevant server function
 * or job. Phase 6 uses this map to audit coverage:
 *   - Every capability that writes SystemConfig keys emits CONFIG_CHANGED
 *   - Every capability state transition emits CAPABILITY_STATE_CHANGED (via CapabilityControl)
 *   - Capabilities tied to specific user actions have their own event types
 *
 * Always-on capabilities (no deferrable setup) have minimal tracking needs.
 * Future capabilities carry the events they will need when they ship.
 */
const TRACKING_EVENTS_MAP: Record<string, CapabilityDefinition['trackingEvents']> = {
  // ── Always-on ─────────────────────────────────────────────────────────────
  COMPLETE_CHECKOUT: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],
  RECORD_PAYMENT: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],
  ISSUE_REFUND: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],
  MANAGE_PRODUCTS: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' },
    { event: 'PRODUCT_CREATED', when: 'User creates first product in the catalogue' },
  ],
  VIEW_SALES_REPORTS: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],
  VIEW_TRANSACTION_HISTORY: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],
  MANAGE_SETTINGS: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' },
    { event: 'CONFIG_CHANGED', when: 'User saves any setting in the settings page' },
  ],
  MANAGE_EMPLOYEES: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' },
    { event: 'EMPLOYEE_INVITED', when: 'Admin invites a new employee' },
  ],
  MANAGE_BILLING: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],
  REACTIVATE_SUBSCRIPTION: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],
  EXPORT_DATA: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Capability enabled at registration (always-on)' }],

  // ── Conditional ───────────────────────────────────────────────────────────
  CREATE_ORDER: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'CONFIG_CHANGED', when: 'ENABLE_ORDER config key written on enable/rollback' },
  ],
  EDIT_ACTIVE_ORDER: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'CONFIG_CHANGED', when: 'ENABLE_ORDER_TAB config key written on enable/rollback' },
  ],
  PRINT_RECEIPT: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'CONFIG_CHANGED', when: 'ENABLE_PRINT_RECEIPT config key written on enable/rollback' },
  ],
  START_VENDOR_SESSION: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'CONFIG_CHANGED', when: 'ENABLE_CASH_RECONCILIATION config key written on enable/rollback' },
    { event: 'CASH_RECONCILIATION_COMPLETED', when: 'Cashier closes a vendor session successfully' },
  ],
  MANAGE_INVENTORY: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'INVENTORY_ADJUSTED', when: 'Staff member records a stock adjustment' },
  ],
  VIEW_INVENTORY_REPORTS: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Enabled automatically when MANAGE_INVENTORY is enabled' }],
  CREATE_PURCHASE: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'PURCHASE_ORDER_CREATED', when: 'User submits a new purchase order' },
  ],
  MANAGE_SUPPLIERS: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'SUPPLIER_ADDED', when: 'User creates a new supplier record' },
  ],
  CREATE_TASK: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'CONFIG_CHANGED', when: 'ENABLE_TASK config key written on enable/rollback' },
  ],
  MANAGE_CUSTOMERS: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'CUSTOMER_REGISTERED', when: 'Staff creates a new customer profile' },
  ],
  MANAGE_BRANCHES: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'BRANCH_CREATED', when: 'Admin creates a second branch' },
  ],
  VIEW_ORDER_HISTORY: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'Enabled automatically when CREATE_ORDER is enabled' }],
  VIEW_ANALYTICS: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' }],
  ACCESS_API: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' }],

  // ── Future ────────────────────────────────────────────────────────────────
  LOYALTY_POINTS: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'CUSTOMER_REGISTERED', when: 'Customer earns first loyalty points at checkout' },
  ],
  KITCHEN_DISPLAY: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' }],
  DELIVERY_MANAGEMENT: [{ event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' }],
  BATCH_PREPARATION: [
    { event: 'CAPABILITY_STATE_CHANGED', when: 'User accepts recommendation or admin enables' },
    { event: 'PRODUCTION_ORDER_CREATED', when: 'User completes first batch preparation' },
  ],
}

/**
 * CAPABILITY_REGISTRY — the single source of truth for activation logic
 * and recommendation behavior.
 *
 * This is NOT the source of truth for runtime access gating (EntitlementEngine)
 * or subscription plan inclusion (PlanEntitlement).
 *
 * Phase 6: each entry is augmented with trackingEvents from TRACKING_EVENTS_MAP.
 * Capabilities not in the map receive an empty trackingEvents array.
 */
export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [...ALWAYS_ON, ...CONDITIONAL, ...FUTURE].map(cap => ({
  ...cap,
  trackingEvents: TRACKING_EVENTS_MAP[cap.id] ?? [],
}))

// ---------------------------------------------------------------------------
// Build-time validation (R4)
// ---------------------------------------------------------------------------

/**
 * Validates the CAPABILITY_REGISTRY for structural correctness.
 * Call this in a Pattern A test (registry-validation.test.ts) to catch
 * broken dependencies, cycles, and missing references at build time.
 *
 * Returns an array of error messages. An empty array means the registry is valid.
 */
export function validateRegistry(registry: CapabilityDefinition[] = CAPABILITY_REGISTRY): RegistryValidationError[] {
  const ids = new Set(registry.map(c => c.id))
  const errors: RegistryValidationError[] = []

  for (const cap of registry) {
    // Hard dependencies must reference real capability IDs
    for (const dep of cap.hardDependencies) {
      if (!ids.has(dep)) {
        errors.push({ capabilityId: cap.id, message: `hardDependency '${dep}' not found in registry` })
      }
    }

    // Conflicts must reference real capability IDs
    for (const conflict of cap.conflicts) {
      if (!ids.has(conflict)) {
        errors.push({ capabilityId: cap.id, message: `conflict '${conflict}' not found in registry` })
      }
    }

    // Related capabilities must reference real IDs
    for (const related of cap.relatedCapabilities) {
      if (!ids.has(related)) {
        errors.push({ capabilityId: cap.id, message: `relatedCapability '${related}' not found in registry` })
      }
    }

    // A capability must not depend on itself
    if (cap.hardDependencies.includes(cap.id)) {
      errors.push({ capabilityId: cap.id, message: 'capability depends on itself' })
    }

    // Threshold must be between 0 and 1
    if (cap.threshold < 0 || cap.threshold > 1) {
      errors.push({ capabilityId: cap.id, message: `threshold ${cap.threshold} is out of range [0, 1]` })
    }

    // estimatedSetupMinutes must be non-negative
    if (cap.estimatedSetupMinutes < 0) {
      errors.push({ capabilityId: cap.id, message: 'estimatedSetupMinutes must be non-negative' })
    }
  }

  // Detect circular hard dependency chains (DFS)
  function hasCycle(startId: string, visited: Set<string>, path: Set<string>): boolean {
    if (path.has(startId)) return true
    if (visited.has(startId)) return false

    visited.add(startId)
    path.add(startId)

    const cap = registry.find(c => c.id === startId)
    if (cap) {
      for (const dep of cap.hardDependencies) {
        if (hasCycle(dep, visited, path)) return true
      }
    }

    path.delete(startId)
    return false
  }

  const visited = new Set<string>()
  for (const cap of registry) {
    const path = new Set<string>()
    if (hasCycle(cap.id, visited, path)) {
      // Only report cycle if not already reported from a member of the cycle
      const alreadyReported = errors.some(e => e.capabilityId === cap.id && e.message.includes('circular'))
      if (!alreadyReported) {
        errors.push({ capabilityId: cap.id, message: 'circular hard dependency chain detected' })
      }
    }
  }

  // Duplicate IDs
  const seen = new Set<string>()
  for (const cap of registry) {
    if (seen.has(cap.id)) {
      errors.push({ capabilityId: cap.id, message: 'duplicate capability ID in registry' })
    }
    seen.add(cap.id)
  }

  return errors
}
