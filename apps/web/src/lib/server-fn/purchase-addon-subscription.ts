/**
 * purchase-addon-subscription.ts
 *
 * Server function: initiate a monthly recurring addon subscription via Stripe.
 *
 * Supported addons:
 *   branch       — Extra Branch (₱199/mo per branch, qty = number of branches)
 *   employee     — Extra Employee (₱49/mo per seat, qty = number of seats)
 *   tx_500       — +500 TX/mo recurring (₱99/mo)
 *   tx_1000      — +1,000 TX/mo recurring (₱179/mo)
 *   tx_5000      — +5,000 TX/mo recurring (₱799/mo)
 *
 * Flow:
 *   1. User selects an addon on /billing.
 *   2. This fn creates a Stripe Checkout Session (mode: subscription).
 *   3. Browser redirects to Stripe hosted page.
 *   4. On payment: Stripe fires customer.subscription.updated webhook.
 *   5. Webhook handler creates/updates BusinessSubscriptionAddon row.
 *   6. On cancellation: customer.subscription.deleted → row marked inactive.
 *
 * Environment variables required (one per addon type):
 *   STRIPE_ADDON_BRANCH_PRICE_ID
 *   STRIPE_ADDON_EMPLOYEE_PRICE_ID
 *   STRIPE_ADDON_TX_RECURRING_500_PRICE_ID
 *   STRIPE_ADDON_TX_RECURRING_1000_PRICE_ID
 *   STRIPE_ADDON_TX_RECURRING_5000_PRICE_ID
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'
import { getBillingAdapter } from '../billing/get-billing-adapter'

// ---------------------------------------------------------------------------
// Addon catalog
// ---------------------------------------------------------------------------

export type AddonId = 'branch' | 'employee' | 'tx_500' | 'tx_1000' | 'tx_5000'

type AddonCatalogEntry = {
  id: AddonId
  label: string
  addonType: string // matches AddonType enum value in schema
  featureKey?: string // for capability addons — written to EntitlementOverride on activation
  txAmount?: number // for TX recurring addons
  displayPrice: string
  priceNote: string
  stripePriceIdEnvKey: string
  perUnit: boolean // true = quantity chosen by user (Branch, Employee)
}

export const ADDON_CATALOG: AddonCatalogEntry[] = [
  {
    id: 'branch',
    label: 'Extra Branch',
    addonType: 'BRANCH',
    displayPrice: '₱199',
    priceNote: '/branch/mo',
    stripePriceIdEnvKey: 'STRIPE_ADDON_BRANCH_PRICE_ID',
    perUnit: true,
  },
  {
    id: 'employee',
    label: 'Extra Employee',
    addonType: 'EMPLOYEE',
    displayPrice: '₱49',
    priceNote: '/seat/mo',
    stripePriceIdEnvKey: 'STRIPE_ADDON_EMPLOYEE_PRICE_ID',
    perUnit: true,
  },
  {
    id: 'tx_500',
    label: '+500 Transactions/mo',
    addonType: 'TX_RECURRING',
    txAmount: 500,
    displayPrice: '₱99',
    priceNote: '/mo',
    stripePriceIdEnvKey: 'STRIPE_ADDON_TX_RECURRING_500_PRICE_ID',
    perUnit: false,
  },
  {
    id: 'tx_1000',
    label: '+1,000 Transactions/mo',
    addonType: 'TX_RECURRING',
    txAmount: 1000,
    displayPrice: '₱179',
    priceNote: '/mo',
    stripePriceIdEnvKey: 'STRIPE_ADDON_TX_RECURRING_1000_PRICE_ID',
    perUnit: false,
  },
  {
    id: 'tx_5000',
    label: '+5,000 Transactions/mo',
    addonType: 'TX_RECURRING',
    txAmount: 5000,
    displayPrice: '₱799',
    priceNote: '/mo',
    stripePriceIdEnvKey: 'STRIPE_ADDON_TX_RECURRING_5000_PRICE_ID',
    perUnit: false,
  },
]

function getStripePriceId(envKey: string): string {
  return process.env[envKey] ?? ''
}

// ---------------------------------------------------------------------------
// fetchAddonCatalog — safe for client (no Price IDs exposed)
// ---------------------------------------------------------------------------

export const fetchAddonCatalog = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .handler(async () =>
    ADDON_CATALOG.map(a => ({
      id: a.id,
      label: a.label,
      addonType: a.addonType,
      featureKey: a.featureKey ?? null,
      txAmount: a.txAmount ?? null,
      displayPrice: a.displayPrice,
      priceNote: a.priceNote,
      perUnit: a.perUnit,
      configured: !!getStripePriceId(a.stripePriceIdEnvKey),
    })),
  )

export type AddonCatalogItem = Awaited<ReturnType<typeof fetchAddonCatalog>>[number]

// ---------------------------------------------------------------------------
// purchaseAddonSubscription
// ---------------------------------------------------------------------------

const PurchaseAddonInputSchema = z.object({
  addonId: z.enum(['branch', 'employee', 'tx_500', 'tx_1000', 'tx_5000']),
  /** For per-unit addons (branch, employee) — how many units to subscribe to */
  quantity: z.number().int().min(1).max(50).default(1),
})

export type PurchaseAddonInput = z.infer<typeof PurchaseAddonInputSchema>

export const purchaseAddonSubscription = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_MANAGE_BILLING), requireTenantContext()])
  .inputValidator((data: PurchaseAddonInput) => PurchaseAddonInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId, id: userId } = getTenantContext(context).user

    const entry = ADDON_CATALOG.find(a => a.id === data.addonId)
    if (!entry) {
      return { success: false as const, error: `Unknown addon: ${data.addonId}` }
    }

    const stripePriceId = getStripePriceId(entry.stripePriceIdEnvKey)
    if (!stripePriceId) {
      return {
        success: false as const,
        error: `Stripe Price ID not configured for addon "${entry.label}". Set ${entry.stripePriceIdEnvKey} in your environment.`,
      }
    }

    const { prisma: rootPrisma } = await import('@platform/lib/prisma-client')

    const subscription = await rootPrisma.businessSubscription.findUnique({
      where: { businessId },
      select: { externalId: true },
    })

    if (!subscription?.externalId) {
      return {
        success: false as const,
        error: 'No active billing subscription found. Create a subscription before adding addons.',
      }
    }

    // Get the appropriate provider adapter for this business
    const adapter = await getBillingAdapter(businessId)
    if (!adapter) {
      return { success: false as const, error: 'No billing provider available for this business.' }
    }

    // Check if the provider supports recurring subscriptions (required for addons)
    const capabilities = adapter.getCapabilities()
    if (!capabilities.supportsRecurring) {
      return {
        success: false as const,
        error: 'Addon subscriptions are not supported with your current payment method.',
      }
    }
    const appUrl = process.env['APP_URL'] ?? process.env['VITE_APP_URL'] ?? 'http://localhost:3000'

    const result = await adapter.createAddonSubscription({
      externalCustomerId: subscription.externalId,
      externalPriceId: stripePriceId,
      quantity: entry.perUnit ? data.quantity : 1,
      successUrl: `${appUrl}/billing?addon=success&type=${entry.addonType}`,
      cancelUrl: `${appUrl}/billing`,
      metadata: {
        businessId,
        userId,
        addonId: entry.id,
        addonType: entry.addonType,
        featureKey: entry.featureKey ?? '',
        txAmount: String(entry.txAmount ?? 0),
        quantity: String(entry.perUnit ? data.quantity : 1),
        source: 'addon_subscription',
      },
    })

    return {
      success: true as const,
      checkoutUrl: result.url,
      sessionId: result.externalSessionId,
    }
  })
