/**
 * first-run-resolver.ts
 *
 * Resolves a profile-aware "how to start selling" guide for new businesses.
 *
 * Design:
 *   - Pure function — no IO, no side effects, deterministic output.
 *   - Input: OperationalProfile + deferredCapabilityIds from authStore.
 *   - Output: FirstRunConfig — drives the FirstRunGuide component.
 *
 * Profiles are grouped into three selling paths:
 *
 *   QUICK_SELL  — LITE_POS, SERVICE_BUSINESS, SIMPLE_RETAILER, QUICK_SERVICE
 *     → "Start at the POS. Type a name, set a price, sell. Catalog builds itself."
 *
 *   ORDER_FIRST — FOOD_AND_BEVERAGE
 *     → "Customers order first, pay later. Open a new order at the POS."
 *
 *   SETUP_FIRST — INVENTORY_INTENSIVE, WHOLESALE_DISTRIBUTION, MULTI_BRANCH_ENTERPRISE
 *     → "Add products and stock before selling so levels track from day one."
 *
 *   CHOOSE      — GENERAL (mixed signals from survey)
 *     → Present both QUICK_SELL and SETUP_FIRST options side by side.
 */

import type { OperationalProfile } from '@/lib/onboarding/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FirstRunPath = 'QUICK_SELL' | 'ORDER_FIRST' | 'SETUP_FIRST' | 'CHOOSE'

export interface FirstRunStep {
  label: string
  description: string
}

export interface FirstRunCta {
  label: string
  route: string
}

export interface FirstRunConfig {
  path: FirstRunPath
  headline: string
  subheadline: string
  steps: FirstRunStep[]
  primaryCta: FirstRunCta
  /** Only set for CHOOSE path — a secondary option shown side-by-side */
  secondaryCta?: FirstRunCta
  /** Shown as a pill/badge above the headline */
  profileLabel: string
}

// ---------------------------------------------------------------------------
// Profile label map — human-readable name shown in the guide header
// ---------------------------------------------------------------------------

const PROFILE_LABELS: Record<OperationalProfile, string> = {
  LITE_POS: 'Quick Seller',
  SERVICE_BUSINESS: 'Service Business',
  SIMPLE_RETAILER: 'Retail',
  QUICK_SERVICE: 'Quick Service',
  FOOD_AND_BEVERAGE: 'Food & Beverage',
  INVENTORY_INTENSIVE: 'Inventory-Driven Retail',
  WHOLESALE_DISTRIBUTION: 'Wholesale / Distribution',
  MULTI_BRANCH_ENTERPRISE: 'Multi-Branch',
  GENERAL: 'General',
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Returns the first-run guide configuration for the given profile.
 *
 * @param profile   The OperationalProfile assigned at registration. Pass null
 *                  when the value hasn't loaded yet — returns null so the caller
 *                  can defer rendering.
 * @param enabledCapabilityIds  The set of capabilities currently enabled for
 *                  this business. Used to check whether the order queue is on.
 */
export function resolveFirstRun(profile: OperationalProfile | null | undefined, enabledCapabilityIds: string[]): FirstRunConfig | null {
  if (!profile) return null

  const hasOrderQueue = enabledCapabilityIds.includes('CREATE_ORDER')

  switch (profile) {
    // ── Quick-sell path ──────────────────────────────────────────────────────
    case 'LITE_POS':
    case 'SERVICE_BUSINESS':
      return {
        path: 'QUICK_SELL',
        profileLabel: PROFILE_LABELS[profile],
        headline: "You're ready to sell",
        subheadline: 'No catalog setup needed. Add products as your customers buy them — right from the POS.',
        steps: [
          { label: 'Open the POS', description: 'Go to Point of Sale from the sidebar.' },
          { label: 'Type a product name', description: "Search for an item. If it doesn't exist yet, tap Quick Add." },
          { label: 'Set the price and sell', description: 'Enter the price, add it to the cart, and check out.' },
        ],
        primaryCta: { label: 'Go to POS', route: '/pos' },
      }

    case 'SIMPLE_RETAILER':
    case 'QUICK_SERVICE':
      return {
        path: 'QUICK_SELL',
        profileLabel: PROFILE_LABELS[profile],
        headline: 'Start selling in minutes',
        subheadline: hasOrderQueue
          ? 'You can sell at the counter or take orders first. Both flows start at the POS.'
          : 'Your checkout flow is ready. Add products as you sell them or set up your catalog first.',
        steps: [
          { label: 'Open the POS', description: 'Go to Point of Sale from the sidebar.' },
          { label: 'Find or quick-add a product', description: 'Search your catalog or type a new item name to create it on the fly.' },
          { label: 'Check out', description: "Review the cart, take payment, and you're done." },
        ],
        primaryCta: { label: 'Go to POS', route: '/pos' },
      }

    // ── Order-first path ─────────────────────────────────────────────────────
    case 'FOOD_AND_BEVERAGE':
      return {
        path: 'ORDER_FIRST',
        profileLabel: PROFILE_LABELS[profile],
        headline: 'Your flow: order → prepare → pay',
        subheadline: 'Customers place an order, your team prepares it, then they pay at the end.',
        steps: [
          { label: 'Open the POS', description: 'Go to Point of Sale from the sidebar.' },
          { label: 'Add items and place an order', description: 'Build the cart and tap "Pay Later" to send it to the kitchen queue.' },
          { label: 'Mark as served, then pay', description: "When it's ready, mark the order served. The customer pays from the order screen." },
        ],
        primaryCta: { label: 'Open POS', route: '/pos' },
      }

    // ── Setup-first path ─────────────────────────────────────────────────────
    case 'INVENTORY_INTENSIVE':
    case 'WHOLESALE_DISTRIBUTION':
      return {
        path: 'SETUP_FIRST',
        profileLabel: PROFILE_LABELS[profile],
        headline: 'Set up your catalog, then sell',
        subheadline: 'For your type of business, adding products and stock levels first means every sale is tracked from day one.',
        steps: [
          { label: 'Add a unit of measure', description: 'e.g. "piece", "kg", or "box" — required to create products.' },
          { label: 'Add a category', description: "Group your products so they're easy to find at checkout." },
          { label: 'Create your first product', description: 'Set the name, price, and cost.' },
          { label: 'Add opening stock', description: 'Go to Inventory and enter how much you have on hand.' },
        ],
        primaryCta: { label: 'Add first product', route: '/products/create' },
      }

    case 'MULTI_BRANCH_ENTERPRISE':
      return {
        path: 'SETUP_FIRST',
        profileLabel: PROFILE_LABELS[profile],
        headline: 'Configure your store, then start selling',
        subheadline: 'With multiple locations, setting up your catalog and team access first will save time across every branch.',
        steps: [
          { label: 'Add your products', description: 'Build your catalog with names, prices, and units.' },
          { label: 'Add stock per branch', description: 'Record opening inventory so each location tracks independently.' },
          { label: 'Invite your team', description: 'Add staff and assign roles (Admin, Supervisor, Cashier).' },
          { label: 'Start selling', description: 'Go to the POS on any branch device to begin.' },
        ],
        primaryCta: { label: 'Add first product', route: '/products/create' },
      }

    // ── Choose path ───────────────────────────────────────────────────────────
    default:
      return {
        path: 'CHOOSE',
        profileLabel: PROFILE_LABELS['GENERAL'],
        headline: 'How would you like to start?',
        subheadline: 'Pick the path that fits how your business works. You can always switch later.',
        steps: [],
        primaryCta: { label: 'Start selling now', route: '/pos' },
        secondaryCta: { label: 'Set up catalog first', route: '/products/create' },
      }
  }
}
