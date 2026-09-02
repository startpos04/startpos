/**
 * fetch-entitlement-details.ts â€” Fetches detailed entitlement information
 * for the current business including plan entitlements, usage limits, and
 * current usage counts.
 *
 * This provides the data needed for the Settings â†’ Entitlements tab to show
 * each capability with its corresponding entitlement configuration.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { CAPABILITY_REGISTRY } from '../onboarding/capability-registry'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../tutorial/feature-library'

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type EntitlementDetail = {
  capabilityKey: CapabilityKey
  featureLabel: string
  featureDescription: string | null
  isOperational: boolean
  category: string // e.g., "SALES", "INVENTORY"
  isBranchLevel: boolean // false = business-level only (like MANAGE_BILLING)

  // Plan entitlement data
  usageLimit: number | null // null = unlimited
  currentUsage: number | null // null = not applicable

  // Capability state
  isEnabled: boolean // Whether the capability is active for this business
  isEnabledAtBranch: boolean // Whether the capability is enabled at THIS branch

  // Override info
  hasOverride: boolean
  overrideGranted: boolean | null
  overrideExpiresAt: Date | null
  overrideReason: string | null
}

export type CapabilityCategoryGroup = {
  category: string
  categoryLabel: string
  isOperational: boolean
  entitlements: EntitlementDetail[]
}

export type EntitlementSummaryData = {
  planName: string | null
  status: string
  billingModel: string
  includedTxPerMonth: number | null
  txUsedThisPeriod: number
  txRemaining: number | null
  categoryGroups: CapabilityCategoryGroup[]
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

// Business-level only capabilities (should not appear in branch settings)
const BUSINESS_LEVEL_CAPABILITIES = new Set([
  'MANAGE_BILLING',
  'REACTIVATE_SUBSCRIPTION',
  'MANAGE_BRANCHES',
  'BUSINESS_VIEW_ANALYTICS', // Business-wide analytics
  'EXPORT_DATA', // Business-wide data export
])

/**
 * Helper: Convert capability key to config key
 * Example: "CREATE_ORDER" â†’ "ENABLE_CREATE_ORDER"
 */
function getConfigKey(capabilityKey: CapabilityKey): string {
  return `ENABLE_${capabilityKey}`
}

export const fetchEntitlementDetails = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_SETTINGS)])
  .handler(async ({ context }): Promise<EntitlementSummaryData | null> => {
    const businessId = context?.user?.businessId
    const branchId = context?.user?.branchId

    console.log('[fetchEntitlementDetails] Starting fetch for business:', businessId, 'branch:', branchId)

    if (!businessId || !branchId) {
      console.warn('[fetchEntitlementDetails] Missing businessId or branchId')
      return null
    }

    try {
      console.log('[fetchEntitlementDetails] Step 1: Fetching subscription...')
      // Fetch business subscription with plan and entitlements
      const subscription = await rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: {
          status: true,
          billingModel: true,
          plan: {
            select: {
              name: true,
              includedTxPerMonth: true,
              entitlements: {
                select: {
                  featureKey: true,
                  usageLimit: true,
                  feature: {
                    select: {
                      label: true,
                      description: true,
                      isOperational: true,
                    },
                  },
                },
              },
            },
          },
        },
      })

      console.log('[fetchEntitlementDetails] Step 2: Subscription fetched:', !!subscription)

      if (!subscription) {
        return {
          planName: null,
          status: 'NO_SUBSCRIPTION',
          billingModel: 'UNKNOWN',
          includedTxPerMonth: null,
          txUsedThisPeriod: 0,
          txRemaining: null,
          categoryGroups: [],
        }
      }

      // Fetch usage counter for current period FOR THIS BRANCH
      const usageCounter = await rootPrisma.usageCounter.findFirst({
        where: {
          businessId,
          branchId,
          isClosed: false,
        },
        select: { txCount: true },
        orderBy: { billingPeriodStart: 'desc' },
      })

      const txUsed = usageCounter?.txCount ?? 0
      const includedTx = subscription.plan.includedTxPerMonth
      const txRemaining = includedTx === -1 ? null : Math.max(0, includedTx - txUsed)

      console.log('[fetchEntitlementDetails] Step 3: Fetching capability states...')
      // Fetch capability states
      const capabilityStates = await rootPrisma.businessCapabilityState.findMany({
        where: { businessId },
        select: { capabilityId: true, state: true },
      })

      const activeStates = new Set(['ENABLED', 'CONFIGURED'])
      const enabledCapabilities = new Set(capabilityStates.filter(cs => activeStates.has(cs.state)).map(cs => cs.capabilityId))

      console.log('[fetchEntitlementDetails] Step 4: Fetching branch capability configs...')
      // Fetch branch-level capability configurations
      const branchConfigs = await rootPrisma.branchCapabilityConfig.findMany({
        where: { branchId },
        select: { capabilityId: true, enabled: true },
      })

      // Build map of branch-level enabled state (default to true if not found)
      const branchEnabledMap = new Map<string, boolean>()
      for (const config of branchConfigs) {
        branchEnabledMap.set(config.capabilityId, config.enabled)
      }

      console.log('[fetchEntitlementDetails] Step 5: Fetching overrides...')
      // Fetch entitlement overrides
      const overrides = await rootPrisma.entitlementOverride.findMany({
        where: { businessId },
        select: {
          featureKey: true,
          granted: true,
          expiresAt: true,
          reason: true,
        },
      })

      const overrideMap = new Map(
        overrides.map(o => [
          o.featureKey,
          {
            granted: o.granted,
            expiresAt: o.expiresAt,
            reason: o.reason,
          },
        ]),
      )

      console.log('[fetchEntitlementDetails] Step 6: Fetching usage counts...')
      // Fetch current usage counts for capabilities with usage limits
      let memberCount = 0
      let productCount = 0

      try {
        // Count memberships (employees) ACROSS ALL BRANCHES (business-wide)
        // Employees can rotate between branches, so limit is business-level
        memberCount = await rootPrisma.membership.count({
          where: {
            businessId,
            deletedAt: null,
          },
        })

        // Count products for this business (products are business-level, not branch-level)
        productCount = await rootPrisma.product.count({
          where: {
            businessId,
            deletedAt: null,
          },
        })
      } catch (err) {
        console.warn('[fetchEntitlementDetails] Failed to fetch usage counts:', err)
      }

      console.log('[fetchEntitlementDetails] Step 7: Building entitlements...')
      // Note: Branch count is omitted because MANAGE_BRANCHES is a business-level
      // capability and is filtered out from branch settings anyway

      // Map usage counts to capability keys
      const usageCounts: Record<string, number> = {
        MANAGE_EMPLOYEES: memberCount,
        MANAGE_PRODUCTS: productCount,
      }

      // Build entitlement details with category information from registry
      const entitlements: EntitlementDetail[] = subscription.plan.entitlements
        .map(ent => {
          const capabilityKey = ent.featureKey as CapabilityKey
          const override = overrideMap.get(ent.featureKey)
          const isEnabled = enabledCapabilities.has(ent.featureKey)

          // Check if enabled at branch level (defaults to true if no config exists)
          const isEnabledAtBranch = branchEnabledMap.get(capabilityKey) ?? true

          // Find category from CAPABILITY_REGISTRY
          const registryEntry = CAPABILITY_REGISTRY.find(c => c.id === capabilityKey)
          const category = registryEntry?.category ?? 'PLATFORM'

          // Check if this is a business-level capability
          const isBranchLevel = !BUSINESS_LEVEL_CAPABILITIES.has(capabilityKey)

          return {
            capabilityKey,
            featureLabel: ent.feature.label,
            featureDescription: ent.feature.description,
            isOperational: ent.feature.isOperational,
            category,
            isBranchLevel,
            usageLimit: ent.usageLimit,
            currentUsage: usageCounts[ent.featureKey] ?? null,
            isEnabled,
            isEnabledAtBranch,
            hasOverride: !!override,
            overrideGranted: override?.granted ?? null,
            overrideExpiresAt: override?.expiresAt ?? null,
            overrideReason: override?.reason ?? null,
          }
        })
        // Filter: only show enabled capabilities that are branch-level
        .filter(ent => ent.isEnabled && ent.isBranchLevel)

      // Group entitlements by category
      const categoryMap = new Map<string, EntitlementDetail[]>()

      for (const ent of entitlements) {
        const existing = categoryMap.get(ent.category) ?? []
        existing.push(ent)
        categoryMap.set(ent.category, existing)
      }

      // Build category groups with labels and ordering
      const categoryGroups: CapabilityCategoryGroup[] = CATEGORY_ORDER.map(category => {
        const categoryEntitlements = categoryMap.get(category)
        if (!categoryEntitlements || categoryEntitlements.length === 0) return null

        return {
          category,
          categoryLabel: CATEGORY_LABELS[category] ?? category,
          isOperational: categoryEntitlements.some(e => e.isOperational),
          entitlements: categoryEntitlements,
        }
      }).filter((group): group is CapabilityCategoryGroup => group !== null)

      console.log('[fetchEntitlementDetails] Success! Returning', categoryGroups.length, 'category groups')
      return {
        planName: subscription.plan.name,
        status: subscription.status,
        billingModel: subscription.billingModel,
        includedTxPerMonth: subscription.plan.includedTxPerMonth,
        txUsedThisPeriod: txUsed,
        txRemaining,
        categoryGroups,
      }
    } catch (error) {
      console.error('[fetchEntitlementDetails] Error:', error)
      // Log the full error with stack trace
      if (error instanceof Error) {
        console.error('[fetchEntitlementDetails] Error message:', error.message)
        console.error('[fetchEntitlementDetails] Error stack:', error.stack)
      }
      // Return null instead of throwing to prevent page crash
      return null
    }
  })
