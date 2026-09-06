import { buildSummaryFromDatabase } from '@platform/lib/authorization/authorization-engine.server'
import { getSessionUser } from '@platform/lib/better-auth/auth-server'
import type { UserContext } from '@platform/lib/compliance'
import { getComplianceAdapter, getComplianceIncludes } from '@platform/lib/compliance'
import { Capabilities, type CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import { EntitlementEngine } from '@platform/lib/entitlement/entitlement-engine'
import type { EntitlementOverrideDTO } from '@platform/lib/entitlement/entitlement-types'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { ComplianceKeySchema, type ComplianceKeyTypes, ConfigKeySchema, type ConfigKeyTypes } from '@platform/lib/types'
import { createServerFn } from '@tanstack/react-start'
import _ from 'lodash'
import type { Prisma } from 'prisma/generated/prisma/client'
import { type ConfigurationKey, Role } from 'prisma/generated/prisma/enums'
import { SubscriptionEngine } from '@/lib/billing/subscription-engine'
import { BillingModel, type LifecycleThresholds } from '@/lib/billing/types'
import { getTenantPrisma } from '@/lib/prisma-client'
import { auth } from './auth'
import { authMiddleware } from './auth-middleware'

// ---------------------------------------------------------------------------
// Role → landing page mapping (web app specific)
// ---------------------------------------------------------------------------
export const RoleLandingPages: Record<Role, string> = {
  [Role.OWNER]: '/business',
  [Role.ADMIN]: '/dashboard',
  [Role.SUPERVISOR]: '/sales-reports',
  [Role.CASHIER]: '/pos',
  [Role.SERVICE_PROVIDER]: '/',
}

// Type-safe Key-Value utility transformer
function transformKvPairs<K extends string, T extends { key: K; value: string }>(pairs: T[]): Partial<Record<K, string>> {
  return _.fromPairs(pairs.map(p => [p.key, p.value])) as Partial<Record<K, string>>
}

// Use adapter to get country-specific includes dynamically
const complianceIncludes = getComplianceIncludes()

type DBUser = Prisma.UserGetPayload<{
  select: {
    id: true
    name: true
    email: true
    image: true
    role: true
    termsAcceptedAt: true
    termsVersion: true
    privacyAcceptedAt: true
    privacyVersion: true
  }
  include: { configurations: true }
}>

type DBBusiness = Prisma.BusinessGetPayload<{
  include: typeof complianceIncludes.business & { configurations: true }
}>

type DBBranch = Prisma.BranchGetPayload<{
  include: typeof complianceIncludes.branch & { configurations: true }
}>

type DBVendorSession = Prisma.VendorSessionGetPayload<object>
type DBLocalOverrides = Prisma.UserGetPayload<{
  select: { id: true; name: true; email: true; role: true }
  include: { accounts: { select: { password: true } } }
}>

// ---------------------------------------------------------------------------
// getAuthUser — Full web app auth context
//
// Calls getSessionUser (foundation) then layers on:
//   - Business / branch / user DB records
//   - Compliance data (country-specific)
//   - Subscription + entitlements
//   - BOS (onboarding) fields
//   - Parsed configuration
//   - Authorization summary
//   - POS-specific fields (canCheckoutOffline, localOverrides)
// ---------------------------------------------------------------------------
export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    // Foundation layer: validate session + extract tenant IDs
    const session = await getSessionUser()
    if (!session) {
      console.warn('[getAuthUser] No session found — user is not authenticated or session cookie is missing.')
      return undefined
    }

    // The web app always requires tenant context. If the session was created before
    // the Membership row existed (e.g. db:reset followed by db:seed without clearing
    // the session cookie), businessId/branchId will be null. Heal it now by looking
    // up the membership and patching the session in-place — no re-login required.
    if (!session.businessId || !session.branchId) {
      const membership = await rootPrisma.membership.findFirst({
        where: { userId: session.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { businessId: true, branchId: true },
      })

      if (!membership?.businessId || !membership.branchId) {
        console.warn(
          `[getAuthUser] Session has no tenant context and no Membership exists for user "${session.id}". ` +
            'Make sure db:seed has been run and the accounts seeder completed successfully.',
        )
        return undefined
      }

      // Patch all live session rows for this user so subsequent requests skip the heal.
      await rootPrisma.session.updateMany({
        where: { userId: session.id },
        data: { businessId: membership.businessId, branchId: membership.branchId },
      })

      console.info(`[getAuthUser] Healed session for user "${session.id}" → business="${membership.businessId}", branch="${membership.branchId}"`)

      // Reuse the healed values for the rest of this request.
      session.businessId = membership.businessId
      session.branchId = membership.branchId
    }

    const { id: userId, businessId, branchId } = session
    const prisma = getTenantPrisma(businessId, branchId)

    const [userData, businessData, branchData, vendorSession, localOverrides, bosData] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          configurations: true,
          termsAcceptedAt: true,
          termsVersion: true,
          privacyAcceptedAt: true,
          privacyVersion: true,
        },
      }) as Promise<DBUser | null>,

      prisma.business.findUnique({
        where: { id: businessId },
        // biome-ignore lint/suspicious/noExplicitAny: compliance includes are country-specific and not in base Prisma types
        include: { ...complianceIncludes.business, configurations: true } as any,
      }) as Promise<DBBusiness | null>,

      prisma.branch.findUnique({
        where: { id: branchId },
        // biome-ignore lint/suspicious/noExplicitAny: compliance includes are country-specific and not in base Prisma types
        include: { ...complianceIncludes.branch, configurations: true } as any,
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
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accounts: { where: { providerId: { equals: 'credential' } }, select: { password: true } },
        },
      }) as Promise<DBLocalOverrides[] | null>,

      rootPrisma.business.findUnique({
        where: { id: businessId },
        select: { deferredCapabilities: true, onboardingCompletedAt: true, currentProfile: true },
      }),
    ])

    if (!userData || !businessData || !branchData) {
      console.warn(
        `[getAuthUser] Tenant DB lookup failed for user "${userId}" (business="${businessId}", branch="${branchId}"): ` +
          `userData=${!!userData}, businessData=${!!businessData}, branchData=${!!branchData}. ` +
          'Records exist in the session but not in the database — the DB may have been reset without re-seeding.',
      )
      return undefined
    }

    const { configurations: userConfigs, ...user } = userData
    const { configurations: businessConfigs, ...business } = businessData
    const { configurations: branchConfigs, ...branch } = branchData

    const mappedUserConfigs = transformKvPairs<ConfigurationKey, (typeof userConfigs)[number]>(userConfigs)
    const mappedBusinessConfigs = transformKvPairs<ConfigurationKey, (typeof businessConfigs)[number]>(businessConfigs)
    const mappedBranchConfigs = transformKvPairs<ConfigurationKey, (typeof branchConfigs)[number]>(branchConfigs)
    const mergedConfigs = _.merge({}, mappedBusinessConfigs, mappedBranchConfigs, mappedUserConfigs)

    // Compliance — country-agnostic adapter (PH / SG / US)
    const adapter = getComplianceAdapter()
    const complianceData = adapter.extractComplianceData({
      business: business as UserContext['business'],
      branch: branch as UserContext['branch'],
      user: user as UserContext['user'],
    })
    const compliance = {
      BIR_TIN: complianceData.businessTaxId,
      BIR_PTU_NUMBER: complianceData.businessPermitNumber ?? '',
      BIR_PTU_ISSUED_AT: complianceData.businessPermitIssuedAt ?? '',
      BIR_RDO_CODE: complianceData.businessTaxOfficeCode ?? '',
      BRANCH_SERIAL_NUMBER: complianceData.branchSerialNumber ?? '',
      BRANCH_CODE: complianceData.branchCode ?? '',
      BRANCH_PTU_NUMBER: complianceData.branchPermitNumber ?? '',
      BRANCH_RDO_CODE: complianceData.branchTaxOfficeCode ?? '',
    }

    // Lifecycle thresholds from merged config
    const rawTrialDays = mergedConfigs['TRIAL_DURATION_DAYS' as ConfigurationKey] as unknown
    const rawGraceDays = mergedConfigs['GRACE_PERIOD_DAYS' as ConfigurationKey] as unknown
    const rawInactiveDays = mergedConfigs['LONG_TERM_INACTIVE_DAYS' as ConfigurationKey] as unknown
    const thresholds: LifecycleThresholds = {
      trialDurationDays: typeof rawTrialDays === 'number' ? rawTrialDays : 30,
      gracePeriodDays: typeof rawGraceDays === 'number' ? rawGraceDays : 7,
      longTermInactiveDays: typeof rawInactiveDays === 'number' ? rawInactiveDays : 90,
    }

    const [businessSubscription, entitlementOverrides, openUsageCounter, latestCreditLedger, capabilityStates, activeTxAddons] = await Promise.all([
      rootPrisma.businessSubscription.findUnique({
        where: { businessId },
        select: {
          id: true,
          planId: true,
          status: true,
          billingModel: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          gracePeriodEndsAt: true,
          expiredAt: true,
          longTermInactiveAt: true,
          cancelledAt: true,
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
        select: { id: true, txCount: true, billingPeriodStart: true, billingPeriodEnd: true },
        orderBy: { billingPeriodStart: 'desc' },
      }),
      rootPrisma.creditLedger.findFirst({
        where: { businessId },
        select: { balanceAfter: true },
        orderBy: { createdAt: 'desc' },
      }),
      rootPrisma.businessCapabilityState.findMany({
        where: { businessId },
        select: { capabilityId: true, state: true },
      }),
      rootPrisma.businessSubscriptionAddon.findMany({
        where: {
          businessId,
          addonType: 'TX_TOPUP',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        select: { quantity: true },
      }),
    ])

    const allCapabilities = Object.values(Capabilities)
    const mapOverrides = (o: { featureKey: string; granted: boolean; expiresAt: Date | null }): EntitlementOverrideDTO => ({
      featureKey: o.featureKey,
      granted: o.granted,
      expiresAt: o.expiresAt,
    })

    // biome-ignore lint/suspicious/noImplicitAnyLet: built conditionally below
    let entitlementContext

    if (businessSubscription) {
      const status = businessSubscription.status as import('@platform/lib/entitlement/entitlement-types').SubscriptionStatus
      const planFeatures = businessSubscription.plan.entitlements.map((e: { featureKey: string }) => e.featureKey as CapabilityKey)
      const usageLimits: Partial<Record<CapabilityKey, number>> = {}
      for (const e of businessSubscription.plan.entitlements) {
        if (e.usageLimit !== null) usageLimits[e.featureKey as CapabilityKey] = e.usageLimit
      }
      const includedTx = businessSubscription.plan.includedTxPerMonth
      const txUsed = openUsageCounter?.txCount ?? 0
      const txAddonTotal = activeTxAddons.reduce((sum, a) => sum + a.quantity, 0)
      const effectiveTx = includedTx === -1 ? -1 : includedTx + txAddonTotal
      const txRemaining = effectiveTx === -1 ? null : Math.max(0, effectiveTx - txUsed)
      const creditBalance = businessSubscription.billingModel === BillingModel.PREPAID_CREDITS ? (latestCreditLedger?.balanceAfter ?? 0) : null

      entitlementContext = {
        status,
        planFeatures,
        usageLimits,
        currentUsage: {},
        txRemaining,
        overrides: entitlementOverrides.map(mapOverrides),
        creditBalance,
      }
    } else {
      // Auto-provision a TRIAL subscription if none exists
      try {
        const trialPlan = await rootPrisma.subscriptionPlan.findFirst({
          where: { name: 'Trial', isActive: true },
          select: { id: true },
        })

        if (trialPlan) {
          const now = new Date()
          const initialData = SubscriptionEngine.buildInitialSubscription(businessId, trialPlan.id, BillingModel.MONTHLY_SUBSCRIPTION, thresholds, now)

          const created = await rootPrisma.$transaction(async tx => {
            const sub = await tx.businessSubscription.create({
              data: {
                businessId: initialData.businessId,
                planId: initialData.planId,
                billingModel: initialData.billingModel,
                status: initialData.status,
                trialEndsAt: initialData.trialEndsAt,
              },
              select: { id: true },
            })
            await tx.subscriptionStatusHistory.create({
              data: {
                subscriptionId: sub.id,
                fromStatus: null,
                toStatus: initialData.transitionRecord.toStatus,
                reason: initialData.transitionRecord.reason,
                triggeredBy: initialData.transitionRecord.triggeredBy,
              },
            })
            return sub
          })

          console.info(`[getAuthUser] Auto-provisioned TRIAL subscription ${created.id} for business ${businessId}`)

          const freshSubscription = await rootPrisma.businessSubscription.findUnique({
            where: { businessId },
            select: {
              id: true,
              status: true,
              billingModel: true,
              trialEndsAt: true,
              currentPeriodEnd: true,
              gracePeriodEndsAt: true,
              expiredAt: true,
              longTermInactiveAt: true,
              plan: {
                select: {
                  includedTxPerMonth: true,
                  entitlements: { select: { featureKey: true, usageLimit: true } },
                },
              },
            },
          })

          if (freshSubscription) {
            const status = freshSubscription.status as import('@platform/lib/entitlement/entitlement-types').SubscriptionStatus
            const planFeatures = freshSubscription.plan.entitlements.map((e: { featureKey: string }) => e.featureKey as CapabilityKey)
            const usageLimits: Partial<Record<CapabilityKey, number>> = {}
            for (const e of freshSubscription.plan.entitlements) {
              if (e.usageLimit !== null) usageLimits[e.featureKey as CapabilityKey] = e.usageLimit
            }
            const includedTx = freshSubscription.plan.includedTxPerMonth
            const txUsed = openUsageCounter?.txCount ?? 0
            const txAddonTotal = activeTxAddons.reduce((sum: number, a: { quantity: number }) => sum + a.quantity, 0)
            const effectiveTx = includedTx === -1 ? -1 : includedTx + txAddonTotal
            const txRemaining = effectiveTx === -1 ? null : Math.max(0, effectiveTx - txUsed)
            const creditBalance = freshSubscription.billingModel === BillingModel.PREPAID_CREDITS ? (latestCreditLedger?.balanceAfter ?? 0) : null

            entitlementContext = {
              status,
              planFeatures,
              usageLimits,
              currentUsage: {},
              txRemaining,
              overrides: entitlementOverrides.map(mapOverrides),
              creditBalance,
            }
          }
        }
      } catch (provisionErr) {
        console.warn(`[getAuthUser] Trial auto-provisioning failed for business ${businessId}:`, provisionErr)
      }

      // Open-context fallback — grants everything so existing workflows continue
      if (!entitlementContext) {
        const planEntitlements = await rootPrisma.planEntitlement.findMany({ select: { featureKey: true } })
        const planFeatures =
          planEntitlements.length > 0 ? (planEntitlements.map((e: { featureKey: string }) => e.featureKey) as CapabilityKey[]) : allCapabilities
        entitlementContext = {
          ...EntitlementEngine.buildOpenContext(planFeatures),
          overrides: entitlementOverrides.map(mapOverrides),
        }
      }
    }

    const subscriptionMeta = businessSubscription
      ? {
          trialEndsAt: businessSubscription.trialEndsAt ?? null,
          currentPeriodEnd: businessSubscription.currentPeriodEnd ?? null,
          billingModel: (businessSubscription.billingModel ?? null) as import('@platform/lib/entitlement/entitlement-types').BillingModelDomain | null,
          cancelledAt: businessSubscription.cancelledAt ?? null,
          planId: businessSubscription.planId ?? null,
        }
      : undefined

    // Capability lifecycle gate — strip HIDDEN / PAUSED / DEPRECATED capabilities
    const capabilityStateMap = new Map(capabilityStates.map((c: { capabilityId: string; state: string }) => [c.capabilityId, c.state]))
    const activeStates = new Set(['ENABLED', 'CONFIGURED'])
    entitlementContext = {
      ...entitlementContext,
      planFeatures: entitlementContext.planFeatures.filter((f: CapabilityKey) => {
        const state = capabilityStateMap.get(f)
        if (!state) return capabilityStates.length === 0
        return activeStates.has(state)
      }),
    }

    const txAddonTotal = activeTxAddons.reduce((sum, a) => sum + a.quantity, 0)
    const entitlement = EntitlementEngine.buildSummary(allCapabilities, entitlementContext, {
      ...subscriptionMeta,
      txAddonTotal,
    })

    const parsedConfigs = (ConfigKeySchema.safeParse(mergedConfigs).data ??
      ConfigKeySchema.parse({
        ...{
          LOW_STOCK_THRESHOLD: 20,
          VAT_RATE: 12,
          BUFFER_RATE: 20,
          LOCALE: 'en-PH',
          CURRENCY: 'PHP',
          IS_VAT_REGISTERED: false,
          PRICE_CONFIGURATION: 'EXCLUSIVE',
        },
        ...mergedConfigs,
      })) as ConfigKeyTypes

    const canCheckoutOffline = branchData.offlineTerminalId === userId

    const authorization = await buildSummaryFromDatabase({
      userId,
      role: userData.role,
    })

    return {
      ...user,
      business,
      branch,
      vendorSession,
      configs: parsedConfigs,
      compliance: (ComplianceKeySchema.safeParse(compliance).data ??
        ComplianceKeySchema.parse({ ...compliance, BIR_TIN: '', BIR_PTU_NUMBER: '', BIR_PTU_ISSUED_AT: '' })) as ComplianceKeyTypes,
      landingPage: RoleLandingPages[userData.role] ?? '/',
      localOverrides: localOverrides ?? [],
      entitlement,
      canCheckoutOffline,
      deferredCapabilities: (bosData?.deferredCapabilities ?? []) as string[],
      onboardingCompletedAt: bosData?.onboardingCompletedAt ?? null,
      currentProfile: bosData?.currentProfile ?? null,
      authorization,
    }
  })

export type ServerUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>

// ---------------------------------------------------------------------------
// verifyAuth — Supervisor password re-verification (web app specific)
//
// Used for supervisor re-auth flows (POS feature gating, sensitive actions).
// Does NOT update the active session — asResponse: true is intentional.
// Lives here (not in platform) because it calls auth.api.signInEmail which
// is specific to the web tenant auth instance.
// ---------------------------------------------------------------------------
export const verifyAuth = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId || !context?.user?.branchId) {
      return { success: false as const, error: 'Context missing' }
    }

    const { businessId, branchId } = context.user
    const prisma = getTenantPrisma(businessId, branchId)

    try {
      const response = await auth.api.signInEmail({
        body: {
          email: data.email,
          password: data.password,
        },
        asResponse: true, // Crucial: prevents updating active session headers/cookies
      })

      if (!response.ok) {
        return { success: false as const, error: 'Invalid password.' }
      }

      const user = await prisma.user.findFirst({
        where: { email: data.email },
        select: { id: true, name: true, role: true },
      })

      if (!user) {
        return { success: false as const, error: 'User is not authorized.' }
      }

      return {
        success: true as const,
        data: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      }
    } catch (error) {
      console.error('verification error:', error)
      return { success: false as const, error: 'Internal verification failure.' }
    }
  })
