/**
 * entitlement-resolver.ts — App-layer entitlement context builder
 *
 * This is the implementation that the platform's requireCapability middleware
 * calls via the registered resolver. All subscription/billing DB queries live
 * here — not in the platform package.
 *
 * Registered at startup in auth-setup.ts:
 *   registerEntitlementResolver(buildEntitlementContext)
 */

import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import { EntitlementEngine } from '@platform/lib/entitlement/entitlement-engine'
import type { EntitlementContext, EntitlementOverrideDTO } from '@platform/lib/entitlement/entitlement-types'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { AddonType } from 'prisma/generated/prisma/enums'
import { BillingModel } from '@/lib/billing/types'

/**
 * Build a fresh EntitlementContext from the database for a given business.
 *
 * Reads subscription, overrides, usage counters, credit balance, and addons
 * from the authoritative DB — never from the client session snapshot.
 */
export async function buildEntitlementContext(businessId: string): Promise<EntitlementContext> {
  const [subscription, overrides, openCounter, latestCredit, activeTxAddons] = await Promise.all([
    rootPrisma.businessSubscription.findUnique({
      where: { businessId },
      select: {
        status: true,
        billingModel: true,
        plan: {
          select: {
            includedTxPerMonth: true,
            entitlements: { select: { featureKey: true, usageLimit: true } },
          },
        },
      },
    }),
    rootPrisma.entitlementOverride.findMany({
      where: { businessId },
      select: { featureKey: true, granted: true, expiresAt: true },
    }),
    rootPrisma.usageCounter.findFirst({
      where: { businessId, isClosed: false },
      select: { txCount: true },
      orderBy: { billingPeriodStart: 'desc' },
    }),
    rootPrisma.creditLedger.findFirst({
      where: { businessId },
      select: { balanceAfter: true },
      orderBy: { createdAt: 'desc' },
    }),
    rootPrisma.businessSubscriptionAddon.findMany({
      where: {
        businessId,
        addonType: AddonType.TX_TOPUP,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      select: { quantity: true },
    }),
  ])

  const mappedOverrides = overrides.map(
    (o): EntitlementOverrideDTO => ({
      featureKey: o.featureKey,
      granted: o.granted,
      expiresAt: o.expiresAt,
    }),
  )

  if (!subscription) {
    // No subscription — grant everything (open context)
    const allFeatures = await rootPrisma.planEntitlement.findMany({
      select: { featureKey: true },
    })
    return {
      ...EntitlementEngine.buildOpenContext(allFeatures.map(f => f.featureKey as CapabilityKey)),
      overrides: mappedOverrides,
    }
  }

  const status = subscription.status as EntitlementContext['status']
  const planFeatures = subscription.plan.entitlements.map(e => e.featureKey as CapabilityKey)
  const usageLimits: Partial<Record<CapabilityKey, number>> = {}
  for (const e of subscription.plan.entitlements) {
    if (e.usageLimit !== null) usageLimits[e.featureKey as CapabilityKey] = e.usageLimit
  }

  const includedTx = subscription.plan.includedTxPerMonth
  const txUsed = openCounter?.txCount ?? 0
  const txAddonTotal = activeTxAddons.reduce((sum, a) => sum + a.quantity, 0)
  const effectiveTx = includedTx === -1 ? -1 : includedTx + txAddonTotal
  const txRemaining = effectiveTx === -1 ? null : Math.max(0, effectiveTx - txUsed)
  const creditBalance = subscription.billingModel === BillingModel.PREPAID_CREDITS ? (latestCredit?.balanceAfter ?? 0) : null

  return {
    status,
    billingModel: (subscription.billingModel ?? BillingModel.PREPAID_CREDITS) as EntitlementContext['billingModel'],
    planFeatures,
    usageLimits,
    currentUsage: {},
    txRemaining,
    overrides: mappedOverrides,
    creditBalance,
  }
}
