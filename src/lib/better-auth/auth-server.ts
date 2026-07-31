import { createServerFn } from '@tanstack/react-start'
import _ from 'lodash'
import type { Prisma } from 'prisma/generated/prisma/client'
import { type ComplianceKey, type ConfigKey, Role } from 'prisma/generated/prisma/enums'
import { Capabilities, type CapabilityKey } from '../entitlement/capability-keys'
import { EntitlementEngine } from '../entitlement/entitlement-engine'
import type { EntitlementOverrideDTO } from '../entitlement/entitlement-types'
import { getTenantPrisma, prisma as rootPrisma } from '../prisma-client'
import { ComplianceKeySchema, type ComplianceKeyTypes, ConfigKeySchema, type ConfigKeyTypes } from '../types'
import { auth } from './auth'
import { authMiddleware } from './auth-middleware'

export const RoleLandingPages: Record<Role, string> = {
  [Role.ADMIN]: '/employees',
  [Role.SUPERVISOR]: '/sales-reports',
  [Role.CASHIER]: '/pos',
  [Role.SERVICE_PROVIDER]: '/',
}

// Type-safe Key-Value utility transformer
function transformKvPairs<K extends string, T extends { key: K; value: string }>(pairs: T[]): Partial<Record<K, string>> {
  return _.fromPairs(pairs.map(p => [p.key, p.value])) as Partial<Record<K, string>>
}

// Derive core entity payloads directly from Prisma Client models
type DBUser = Prisma.UserGetPayload<{ select: { id: true; name: true; email: true; image: true; role: true }; include: { systemConfigs: true } }>
type DBBusiness = Prisma.BusinessGetPayload<{ include: { complianceRegistry: true; systemConfigs: true } }>
type DBBranch = Prisma.BranchGetPayload<{ include: { complianceRegistry: true; systemConfigs: true } }>
type DBVendorSession = Prisma.VendorSessionGetPayload<object>
type DBLocalOverrides = Prisma.UserGetPayload<{
  select: { id: true; name: true; email: true; role: true }
  include: { accounts: { select: { password: true } } }
}>

export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return undefined
    }

    const { businessId, branchId, id: userId } = context.user
    const prisma = getTenantPrisma(businessId, branchId)

    const [userData, businessData, branchData, vendorSession, localOverrides] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true, role: true, systemConfigs: true },
      }) as Promise<DBUser | null>,

      prisma.business.findUnique({
        where: { id: businessId },
        include: { complianceRegistry: true, systemConfigs: true },
      }) as Promise<DBBusiness | null>,

      prisma.branch.findUnique({
        where: { id: branchId },
        include: { complianceRegistry: true, systemConfigs: true },
      }) as Promise<DBBranch | null>,

      prisma.vendorSession.findFirst({
        where: { userId, branchId },
        orderBy: { startTime: 'desc' },
      }) as Promise<DBVendorSession | null>,

      prisma.user.findMany({
        where: {
          role: { in: [Role.ADMIN, Role.SUPERVISOR] },
          memberships: { some: { businessId, branchId } },
        },
        select: { id: true, name: true, email: true, role: true, accounts: { where: { providerId: { equals: 'credential' } }, select: { password: true } } },
      }) as Promise<DBLocalOverrides[] | null>,
    ])

    if (!userData || !businessData || !branchData) {
      return undefined
    }

    const { systemConfigs: userConfigs, ...user } = userData
    const { systemConfigs: businessConfigs, complianceRegistry: businessCompliance, ...business } = businessData
    const { systemConfigs: branchConfigs, complianceRegistry: branchCompliance, ...branch } = branchData

    // These objects are now cleanly typed maps instead of plain key-value targets
    const mappedUserConfigs = transformKvPairs<ConfigKey, (typeof userConfigs)[number]>(userConfigs)
    const mappedBusinessConfigs = transformKvPairs<ConfigKey, (typeof businessConfigs)[number]>(businessConfigs)
    const mappedBranchConfigs = transformKvPairs<ConfigKey, (typeof branchConfigs)[number]>(branchConfigs)

    const mappedBusinessCompliance = transformKvPairs<ComplianceKey, (typeof businessCompliance)[number]>(businessCompliance)
    const mappedBranchCompliance = transformKvPairs<ComplianceKey, (typeof branchCompliance)[number]>(branchCompliance)

    const mergedSystemConfigs = _.merge({}, mappedBusinessConfigs, mappedBranchConfigs, mappedUserConfigs)
    const mergedComplianceRegistry = _.merge({}, mappedBusinessCompliance, mappedBranchCompliance)

    // -------------------------------------------------------------------------
    // Entitlement Summary — Phase F
    // Builds a lightweight capability snapshot embedded in every session.
    // When a BusinessSubscription record exists, the real plan + status drive
    // the engine. When no subscription exists (dev / first-time onboarding),
    // the open-context fallback grants everything so existing workflows continue.
    // -------------------------------------------------------------------------

    const [businessSubscription, entitlementOverrides] = await Promise.all([
      // F2: Fetch the business's active subscription and its plan's entitlements.
      // Root Prisma is used here intentionally — subscription data is platform-level
      // (not tenant-scoped) and BusinessSubscription lives outside branch isolation.
      rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: {
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          txUsedThisPeriod: true,
          creditBalance: true,
          plan: {
            select: {
              includedTxPerMonth: true,
              entitlements: {
                select: { featureKey: true, usageLimit: true },
              },
            },
          },
        },
      }),

      // Per-business overrides (grants or revocations) — unchanged from Phase 2
      rootPrisma.entitlementOverride.findMany({
        where: { businessId },
        select: { featureKey: true, granted: true, expiresAt: true },
      }),
    ])

    const allCapabilities = Object.values(Capabilities)

    // biome-ignore lint/suspicious/noImplicitAnyLet: fix later
    let entitlementContext

    if (businessSubscription) {
      // -----------------------------------------------------------------------
      // Real subscription path — Phase F active
      // -----------------------------------------------------------------------

      // Map Prisma SubscriptionStatus enum string to the TS const value.
      // Both are the same string values so a cast is safe; the domain layer
      // stays infrastructure-free by using its own const object.
      const status = businessSubscription.status as import('../entitlement/entitlement-types').SubscriptionStatus

      const planFeatures = businessSubscription.plan.entitlements.map((e: { featureKey: string }) => e.featureKey as CapabilityKey)

      // Build usageLimits from plan entitlements that have a non-null usageLimit
      const usageLimits: Partial<Record<CapabilityKey, number>> = {}
      for (const e of businessSubscription.plan.entitlements) {
        if (e.usageLimit !== null) {
          usageLimits[e.featureKey as CapabilityKey] = e.usageLimit
        }
      }

      // Compute txRemaining from plan allowance minus current period usage.
      // -1 means unlimited; null means no allowance tracking.
      const includedTx = businessSubscription.plan.includedTxPerMonth
      const txRemaining = includedTx === -1 ? null : Math.max(0, includedTx - businessSubscription.txUsedThisPeriod)

      entitlementContext = {
        status,
        planFeatures,
        usageLimits,
        currentUsage: {}, // Usage counts (employee count etc.) fetched on-demand if needed
        txRemaining,
        overrides: entitlementOverrides.map(
          (o: { featureKey: string; granted: boolean; expiresAt: Date | null }): EntitlementOverrideDTO => ({
            featureKey: o.featureKey,
            granted: o.granted,
            expiresAt: o.expiresAt,
          }),
        ),
        creditBalance: businessSubscription.creditBalance ?? null,
      }
    } else {
      // -----------------------------------------------------------------------
      // Open-context fallback — no subscription record (dev / onboarding)
      // All features granted, ACTIVE status, no limits.
      // -----------------------------------------------------------------------

      // Fetch all plan entitlements across plans so any seeded features are
      // reflected. If nothing is seeded yet, grant the full capability list.
      const planEntitlements = await rootPrisma.planEntitlement.findMany({
        select: { featureKey: true },
      })

      const planFeatures =
        planEntitlements.length > 0 ? (planEntitlements.map((e: { featureKey: string }) => e.featureKey) as CapabilityKey[]) : allCapabilities

      const openContext = EntitlementEngine.buildOpenContext(planFeatures)

      entitlementContext = {
        ...openContext,
        overrides: entitlementOverrides.map(
          (o: { featureKey: string; granted: boolean; expiresAt: Date | null }): EntitlementOverrideDTO => ({
            featureKey: o.featureKey,
            granted: o.granted,
            expiresAt: o.expiresAt,
          }),
        ),
      }
    }

    const entitlement = EntitlementEngine.buildSummary(allCapabilities, entitlementContext)

    return {
      ...user,
      business,
      branch,
      vendorSession,
      systemConfigs: ConfigKeySchema.parse(mergedSystemConfigs) as ConfigKeyTypes,
      complianceRegistry: ComplianceKeySchema.parse(mergedComplianceRegistry) as ComplianceKeyTypes,
      landingPage: RoleLandingPages[userData.role] ?? '/',
      localOverrides: localOverrides || [],
      entitlement,
    }
  })

export type ServerUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>

export const verifyAuth = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { success: false, error: 'Context missing' }
    }

    const { businessId, branchId } = context.user
    const prisma = getTenantPrisma(businessId, branchId)

    try {
      const response = await auth.api.signInEmail({
        body: {
          email: data.email,
          password: data.password,
        },
        asResponse: true, // Crucial: Prevents updating active session headers/cookies
      })

      if (!response.ok) {
        return { success: false, error: 'Invalid password.' }
      }

      const user = await prisma.user.findFirst({
        where: {
          email: data.email,
        },
        select: {
          id: true,
          name: true,
          role: true,
        },
      })

      if (!user) {
        return { success: false, error: 'User is not authorized.' }
      }

      // Return the information directly so you can use them dynamically in your UI
      return {
        success: true,
        data: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      }
    } catch (error) {
      console.error('verification error:', error)
      return { success: false, error: 'Internal verification failure.' }
    }
  })
