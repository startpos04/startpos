/**
 * feature-library.ts
 *
 * Pure function layer for the Feature Discovery Library.
 *
 * Responsibilities:
 *   - buildFeatureLibrary(capabilityStates) → FeatureEntry[]
 *     Merges BusinessCapabilityState rows (authoritative source) with the
 *     static CAPABILITY_REGISTRY to produce display-ready feature articles.
 *   - No React, no infrastructure imports, no collections, no HTTP.
 *   - Deterministic: same inputs → same output.
 *
 * Source of truth for capability state:
 *   BusinessCapabilityState (via fetchCapabilityStates) — written at registration
 *   by completeRegistration and updated by CapabilityControl.enable/pause.
 *   This is correct and consistent with the Settings → Capabilities page.
 *
 *   We do NOT use user.entitlement.capabilities — that reflects plan entitlements
 *   (what the plan allows), not whether the user actually configured the feature.
 *   A capability can be in the plan but not yet enabled by the business.
 *
 * FeatureEntry states (mapped from CapabilityLifecycleState):
 *   ENABLED      — state is ENABLED or CONFIGURED
 *   RECOMMENDED  — state is RECOMMENDED (deferred at registration, high value)
 *   AVAILABLE    — state is HIDDEN (exists but not surfaced by survey)
 *   COMING_SOON  — future capability (not yet built)
 */

import { CAPABILITY_REGISTRY } from '@/lib/onboarding/capability-registry'
import type { CapabilityCategory } from '@/lib/onboarding/types'
import type { CapabilityStateRow } from '@/lib/server-fn/fetch-capability-states'

// ---------------------------------------------------------------------------
// Feature entry state
// ---------------------------------------------------------------------------

export type FeatureState = 'ENABLED' | 'RECOMMENDED' | 'AVAILABLE' | 'COMING_SOON'

// ---------------------------------------------------------------------------
// How-to step — one item in the "how to enable/use" section of the article
// ---------------------------------------------------------------------------

export interface FeatureHowToStep {
  label: string
  description: string
}

// ---------------------------------------------------------------------------
// CTA definition — where the user goes to enable or use this feature
// ---------------------------------------------------------------------------

export interface FeatureCta {
  label: string
  route: string
}

// ---------------------------------------------------------------------------
// FeatureEntry — the display-ready shape consumed by the UI component
// ---------------------------------------------------------------------------

export interface FeatureEntry {
  id: string
  label: string
  /** One-line "what is it" */
  description: string
  /** One-paragraph "why you need it" */
  businessValue: string
  /** How-to steps for enabling/using the feature */
  howTo: FeatureHowToStep[]
  /** Where the user goes to act on this feature */
  cta: FeatureCta | null
  /** Estimated minutes to set up (0 = no setup needed) */
  estimatedSetupMinutes: number
  /** Whether setup is complex (needs IT / multiple steps) */
  isComplex: boolean
  /** UI grouping category */
  category: CapabilityCategory
  /** Required plan tier */
  minimumPlan: string
  /** Related capability IDs — shown as cross-links */
  relatedCapabilities: string[]
  /** Current state for this business */
  state: FeatureState
}

// ---------------------------------------------------------------------------
// CTA + how-to map — UI knowledge that lives here, not in the registry
//
// Keys match CAPABILITY_REGISTRY ids.
// Any capability not listed here gets a null cta and generic how-to steps.
// ---------------------------------------------------------------------------

interface CtaConfig {
  cta: FeatureCta | null
  howTo: FeatureHowToStep[]
}

const FEATURE_CTA_MAP: Partial<Record<string, CtaConfig>> = {
  START_VENDOR_SESSION: {
    cta: { label: 'Enable Cash Reconciliation', route: '/settings?tab=Capabilities' },
    howTo: [
      { label: 'Enable in Settings', description: 'Go to Settings → Capabilities and turn on Cash Reconciliation.' },
      { label: 'Open a shift', description: 'At the start of the day, go to POS and tap "Open Shift". Enter your opening cash count.' },
      { label: 'Close a shift', description: 'At end of day, tap "Close Shift" and enter your physical cash count. The system shows any variance.' },
    ],
  },
  MANAGE_INVENTORY: {
    cta: { label: 'Enable Inventory Tracking', route: '/settings?tab=Capabilities' },
    howTo: [
      { label: 'Enable in Settings', description: 'Go to Settings → Capabilities and turn on Inventory Tracking.' },
      { label: 'Add opening stock', description: 'Go to Inventory → Add Stock for each product. Enter how much you have on hand.' },
      { label: 'Review stock levels', description: 'The POS will now show how many units are left and warn when stock runs low.' },
    ],
  },
  CREATE_ORDER: {
    cta: { label: 'Enable Order Queue', route: '/settings?tab=Capabilities' },
    howTo: [
      { label: 'Enable in Settings', description: 'Go to Settings → Capabilities and turn on Order Queue.' },
      {
        label: 'Create an order at the POS',
        description: 'Add items to the cart and tap "Pay Later" to send the order to the queue without collecting payment yet.',
      },
      { label: 'Collect payment', description: 'Open the order from the Orders list and tap Checkout when the customer is ready to pay.' },
    ],
  },
  PRINT_RECEIPT: {
    cta: { label: 'Configure Receipts', route: '/settings?tab=Capabilities' },
    howTo: [
      { label: 'Enable in Settings', description: 'Go to Settings → Capabilities and turn on Print Receipt.' },
      { label: 'Connect a printer', description: 'Make sure your receipt printer is connected and recognised by the browser.' },
      { label: 'Test at checkout', description: 'A print dialog will appear after every completed sale.' },
    ],
  },
  MANAGE_SUPPLIERS: {
    cta: { label: 'Add your first supplier', route: '/suppliers/create' },
    howTo: [
      { label: 'Add a supplier', description: 'Go to Suppliers → New Supplier. Enter the name and contact details.' },
      { label: 'Link to products', description: 'When creating a purchase order, select the supplier from your list.' },
    ],
  },
  CREATE_PURCHASE: {
    cta: { label: 'Enable Purchase Orders', route: '/settings?tab=Capabilities' },
    howTo: [
      { label: 'Enable in Settings', description: 'Go to Settings → Capabilities and turn on Purchase Orders.' },
      {
        label: 'Create a purchase order',
        description: 'Go to Purchases → New Purchase. Select a supplier, add items, and submit for approval or direct receive.',
      },
      { label: 'Receive goods', description: 'When stock arrives, mark the purchase as Received. Inventory is automatically updated.' },
    ],
  },
  CREATE_TASK: {
    cta: { label: 'Enable Task Management', route: '/settings?tab=Capabilities' },
    howTo: [
      { label: 'Enable in Settings', description: 'Go to Settings → Capabilities and turn on Task Management.' },
      { label: 'Create a task', description: 'Go to Tasks → New Task. Assign it to a staff member with a due date and instructions.' },
      { label: 'Track completion', description: 'Staff mark tasks done from their own view. You see completion status in the Tasks dashboard.' },
    ],
  },
  MANAGE_CUSTOMERS: {
    cta: { label: 'View Customers', route: '/customers' },
    howTo: [
      { label: 'Add a customer', description: 'Go to Customers → New Customer. Enter name and contact info.' },
      { label: 'Apply at checkout', description: 'At the POS, tap the Customer field and search for the customer to link the sale to their profile.' },
      { label: 'Apply SC/PWD discounts', description: 'When a customer profile is attached, you can apply Senior Citizen or PWD discounts at checkout.' },
    ],
  },
  MANAGE_BRANCHES: {
    cta: { label: 'View Branches', route: '/branches' },
    howTo: [
      { label: 'Add a branch', description: 'Go to Settings → Branches → New Branch. Enter the branch name and location.' },
      { label: 'Assign staff', description: 'Each employee can be assigned to one or more branches from their profile.' },
      { label: 'Switch branches', description: 'Staff log in and select their branch — reports and inventory are isolated per branch.' },
    ],
  },
  VIEW_ANALYTICS: {
    cta: { label: 'View Analytics', route: '/analytics' },
    howTo: [
      { label: 'Open Analytics', description: 'Go to Analytics from the sidebar. No setup needed — reports populate from your transaction history.' },
      { label: 'Filter by date range', description: 'Use the date picker to zoom in on any period — day, week, month, or custom range.' },
    ],
  },
  LOYALTY_POINTS: {
    cta: null,
    howTo: [
      {
        label: 'Coming soon',
        description: 'Loyalty Points is under development. It will let you reward returning customers with points they can redeem for discounts.',
      },
    ],
  },
  KITCHEN_DISPLAY: {
    cta: null,
    howTo: [{ label: 'Coming soon', description: 'Kitchen Display System is under development. It will show incoming orders on a dedicated kitchen screen.' }],
  },
  DELIVERY_MANAGEMENT: {
    cta: null,
    howTo: [
      { label: 'Coming soon', description: 'Delivery Management is under development. It will let you coordinate delivery orders and driver assignments.' },
    ],
  },
}

// Capabilities we always exclude — always-on and not meaningful to surface
// as discoverable features (the user can't do anything with them).
const ALWAYS_ON_IDS = new Set([
  'COMPLETE_CHECKOUT',
  'RECORD_PAYMENT',
  'ISSUE_REFUND',
  'MANAGE_PRODUCTS',
  'VIEW_SALES_REPORTS',
  'VIEW_TRANSACTION_HISTORY',
  'VIEW_INVENTORY_REPORTS',
  'VIEW_ORDER_HISTORY',
  'EXPORT_DATA',
  'MANAGE_SETTINGS',
  'MANAGE_EMPLOYEES',
  'MANAGE_BILLING',
  'REACTIVATE_SUBSCRIPTION',
  'EDIT_ACTIVE_ORDER', // child of CREATE_ORDER — not independently discoverable
])

// ---------------------------------------------------------------------------
// buildFeatureLibrary
// ---------------------------------------------------------------------------

/**
 * Assembles a display-ready FeatureEntry list from BusinessCapabilityState rows.
 *
 * @param capabilityStates  Rows from fetchCapabilityStates() — the authoritative
 *                          source of which features are enabled vs recommended
 *                          vs hidden for this business.
 *
 * Sort order: RECOMMENDED first, then ENABLED, then AVAILABLE, then COMING_SOON.
 * Within each group, alphabetical by label.
 */
export function buildFeatureLibrary(capabilityStates: CapabilityStateRow[]): FeatureEntry[] {
  // Build a lookup map from capabilityId → state row
  const stateMap = new Map(capabilityStates.map(r => [r.capabilityId, r]))

  const entries: FeatureEntry[] = []

  for (const cap of CAPABILITY_REGISTRY) {
    // Skip always-on IDs — not actionable for the user
    if (ALWAYS_ON_IDS.has(cap.id)) continue

    // Determine feature state
    let state: FeatureState

    if (FUTURE_CAPABILITY_IDS.has(cap.id)) {
      state = 'COMING_SOON'
    } else {
      const row = stateMap.get(cap.id)
      if (!row) continue // Not in BusinessCapabilityState at all — skip

      switch (row.state) {
        case 'ENABLED':
        case 'CONFIGURED':
          state = 'ENABLED'
          break
        case 'RECOMMENDED':
          state = 'RECOMMENDED'
          break
        case 'HIDDEN':
        case 'PAUSED':
        case 'DEPRECATED':
          state = 'AVAILABLE'
          break
        default:
          state = 'AVAILABLE'
      }
    }

    const ctaConfig = FEATURE_CTA_MAP[cap.id]
    const cta = state === 'COMING_SOON' ? null : (ctaConfig?.cta ?? null)
    const howTo: FeatureHowToStep[] = ctaConfig?.howTo ?? [{ label: `Go to ${cap.label}`, description: cap.description }]

    entries.push({
      id: cap.id,
      label: cap.label,
      description: cap.description,
      businessValue: cap.businessValue,
      howTo,
      cta,
      estimatedSetupMinutes: cap.estimatedSetupMinutes,
      isComplex: cap.isComplex,
      category: cap.category,
      minimumPlan: cap.minimumPlan,
      relatedCapabilities: cap.relatedCapabilities,
      state,
    })
  }

  // Also add COMING_SOON entries (futures have no DB rows)
  for (const id of FUTURE_CAPABILITY_IDS) {
    const cap = CAPABILITY_REGISTRY.find(c => c.id === id)
    if (!cap) continue
    const ctaConfig = FEATURE_CTA_MAP[cap.id]
    entries.push({
      id: cap.id,
      label: cap.label,
      description: cap.description,
      businessValue: cap.businessValue,
      howTo: ctaConfig?.howTo ?? [{ label: cap.label, description: cap.description }],
      cta: null,
      estimatedSetupMinutes: cap.estimatedSetupMinutes,
      isComplex: cap.isComplex,
      category: cap.category,
      minimumPlan: cap.minimumPlan,
      relatedCapabilities: cap.relatedCapabilities,
      state: 'COMING_SOON',
    })
  }

  const ORDER: Record<FeatureState, number> = {
    RECOMMENDED: 0,
    ENABLED: 1,
    AVAILABLE: 2,
    COMING_SOON: 3,
  }

  entries.sort((a, b) => {
    const orderDiff = ORDER[a.state] - ORDER[b.state]
    if (orderDiff !== 0) return orderDiff
    return a.label.localeCompare(b.label)
  })

  return entries
}

// Future capability IDs — these map to CAPABILITY_REGISTRY entries where
// required: () => false. Maintained here so buildFeatureLibrary stays pure
// without calling registry functions.
const FUTURE_CAPABILITY_IDS = new Set(['LOYALTY_POINTS', 'KITCHEN_DISPLAY', 'DELIVERY_MANAGEMENT', 'VIEW_ANALYTICS', 'ACCESS_API'])

// ---------------------------------------------------------------------------
// Category display labels
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Partial<Record<CapabilityCategory, string>> = {
  SALES: 'Sales & Checkout',
  INVENTORY: 'Inventory',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  PROCUREMENT: 'Purchasing',
  REPORTING: 'Reports & Analytics',
  CRM: 'Customers',
  MULTI_BRANCH: 'Multi-Branch',
  COMPLIANCE: 'Compliance',
  PLATFORM: 'Platform',
}

// Category display order
export const CATEGORY_ORDER: CapabilityCategory[] = [
  'SALES',
  'INVENTORY',
  'FINANCE',
  'OPERATIONS',
  'PROCUREMENT',
  'CRM',
  'REPORTING',
  'MULTI_BRANCH',
  'COMPLIANCE',
  'PLATFORM',
]
