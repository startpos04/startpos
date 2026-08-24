import { createServerFn } from '@tanstack/react-start'
import _ from 'lodash'
import type { Prisma } from 'prisma/generated/prisma/client'
import { type ComplianceKey, type ConfigurationKey, Role } from 'prisma/generated/prisma/enums'
import { AuthorizationEngine } from '../authorization/authorization-engine'
import { SubscriptionEngine } from '../billing/subscription-engine'
import { BillingModel, type LifecycleThresholds } from '../billing/types'
import { Capabilities, type CapabilityKey } from '../entitlement/capability-keys'
import { EntitlementEngine } from '../entitlement/entitlement-engine'
import type { EntitlementOverrideDTO } from '../entitlement/entitlement-types'
import { getTenantPrisma, prisma as rootPrisma } from '../prisma-client'
import { ComplianceKeySchema, type ComplianceKeyTypes, ConfigKeySchema, type ConfigKeyTypes } from '../types'
import { auth } from './auth'
import { authMiddleware } from './auth-middleware'

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

// Derive core entity payloads directly from Prisma Client models
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
type DBBusiness = Prisma.BusinessGetPayload<{ include: { complianceRegistry: true; configurations: true } }>
type DBBranch = Prisma.BranchGetPayload<{
  select: {
    id: true
    name: true
    address: true
    businessId: true
    createdAt: true
    updatedAt: true
    deletedAt: true
    offlineTerminalId: true
    complianceRegistry: true
    configurations: true
  }
}>
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
          // Phase 0 legal consent fields — surfaced in Settings → Account tab
          termsAcceptedAt: true,
          termsVersion: true,
          privacyAcceptedAt: true,
          privacyVersion: true,
        },
      }) as Promise<DBUser | null>,

      prisma.business.findUnique({
        where: { id: businessId },
        include: { complianceRegistry: true, configurations: true },
      }) as Promise<DBBusiness | null>,

      prisma.branch.findUnique({
        where: { id: branchId },
        select: {
          id: true,
          name: true,
          address: true,
          businessId: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          offlineTerminalId: true, // Phase 2: offline checkout restriction
          complianceRegistry: true,
          configurations: true,
        },
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

      // BOS fields — deferredCapabilities drives survey-aware tutorial definitions;
      // onboardingCompletedAt drives the first-login welcome modal.
      rootPrisma.business.findUnique({
        where: { id: businessId },
        select: { deferredCapabilities: true, onboardingCompletedAt: true, currentProfile: true },
      }),
    ])

    if (!userData || !businessData || !branchData) {
      return undefined
    }

    const { configurations: userConfigs, ...user } = userData
    const { configurations: businessConfigs, complianceRegistry: businessCompliance, ...business } = businessData
    const { configurations: branchConfigs, complianceRegistry: branchCompliance, ...branch } = branchData

    // These objects are now cleanly typed maps instead of plain key-value targets
    const mappedUserConfigs = transformKvPairs<ConfigurationKey, (typeof userConfigs)[number]>(userConfigs)
    const mappedBusinessConfigs = transformKvPairs<ConfigurationKey, (typeof businessConfigs)[number]>(businessConfigs)
    const mappedBranchConfigs = transformKvPairs<ConfigurationKey, (typeof branchConfigs)[number]>(branchConfigs)

    const mappedBusinessCompliance = transformKvPairs<ComplianceKey, (typeof businessCompliance)[number]>(businessCompliance)
    const mappedBranchCompliance = transformKvPairs<ComplianceKey, (typeof branchCompliance)[number]>(branchCompliance)

    const mergedConfigs = _.merge({}, mappedBusinessConfigs, mappedBranchConfigs, mappedUserConfigs)
    const mergedComplianceRegistry = _.merge({}, mappedBusinessCompliance, mappedBranchCompliance)

    // -------------------------------------------------------------------------
    // Entitlement Summary — Phase 0 (expanded from Phase F)
    //
    // 1. Fetch the business's active subscription (and its plan entitlements).
    // 2. If no subscription exists → auto-provision a TRIAL subscription
    //    (idempotent: the DB unique constraint on businessId prevents duplicates).
    // 3. Build EntitlementContext from the subscription record.
    // 4. Fall back to open-context if provisioning fails (dev / seed mode safety).
    //
    // rootPrisma is used intentionally — subscription data is platform-level,
    // not tenant-scoped, and BusinessSubscription lives outside branch isolation.
    // -------------------------------------------------------------------------

    // Read lifecycle policy thresholds from merged configuration.
    // These keys are stored as strings in BusinessConfiguration — coerce to numbers here.
    const rawTrialDays = mergedConfigs['TRIAL_DURATION_DAYS' as ConfigurationKey] as unknown
    const rawGraceDays = mergedConfigs['GRACE_PERIOD_DAYS' as ConfigurationKey] as unknown
    const rawInactiveDays = mergedConfigs['LONG_TERM_INACTIVE_DAYS' as ConfigurationKey] as unknown

    const thresholds: LifecycleThresholds = {
      trialDurationDays: typeof rawTrialDays === 'number' ? rawTrialDays : 30,
      gracePeriodDays: typeof rawGraceDays === 'number' ? rawGraceDays : 7,
      longTermInactiveDays: typeof rawInactiveDays === 'number' ? rawInactiveDays : 90,
    }

    const [businessSubscription, entitlementOverrides, openUsageCounter, latestCreditLedger, capabilityStates, activeTxAddons] = await Promise.all([
      // Fetch the business's active subscription and its plan's entitlements.
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
              entitlements: {
                select: { featureKey: true, usageLimit: true },
              },
            },
          },
        },
      }),

      // Per-business overrides (grants or revocations)
      rootPrisma.entitlementOverride.findMany({
        where: { businessId },
        select: { featureKey: true, granted: true, expiresAt: true },
      }),

      // Phase 2 — fetch the open UsageCounter for the current billing period.
      // Used to compute txRemaining accurately instead of reading the deprecated
      // txUsedThisPeriod column on BusinessSubscription.
      rootPrisma.usageCounter.findFirst({
        where: { businessId, isClosed: false },
        select: { id: true, txCount: true, billingPeriodStart: true, billingPeriodEnd: true },
        orderBy: { billingPeriodStart: 'desc' },
      }),

      // Phase 3 — fetch the latest CreditLedger entry for this business.
      // The balanceAfter snapshot on the most recent row is the current credit
      // balance — O(1) read, no SUM required. Null if no ledger entries exist.
      // Only relevant for PREPAID_CREDITS billing model; ignored otherwise.
      rootPrisma.creditLedger.findFirst({
        where: { businessId },
        select: { balanceAfter: true },
        orderBy: { createdAt: 'desc' },
      }),

      // Capability lifecycle gate — BusinessCapabilityState rows for this business.
      // Used to strip PAUSED, HIDDEN, and DEPRECATED capabilities from planFeatures
      // so useCapability() correctly returns false when a capability is turned off.
      rootPrisma.businessCapabilityState.findMany({
        where: { businessId },
        select: { capabilityId: true, state: true },
      }),

      // TX addon — sum active TX_TOPUP addons for this billing period.
      // expiresAt null = perpetual; expiresAt >= now = still valid.
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

    // biome-ignore lint/suspicious/noImplicitAnyLet: fix later
    let entitlementContext

    if (businessSubscription) {
      // -----------------------------------------------------------------------
      // Real subscription path — Phase 0 active
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
      // Phase 2: reads from UsageCounter (openUsageCounter) instead of the
      // deprecated BusinessSubscription.txUsedThisPeriod field.
      // TX addon: active TX_TOPUP addons are summed and added to the base quota.
      // -1 means unlimited; null means no allowance tracking.
      const includedTx = businessSubscription.plan.includedTxPerMonth
      const txUsed = openUsageCounter?.txCount ?? 0
      const txAddonTotal = activeTxAddons.reduce((sum, a) => sum + a.quantity, 0)
      const effectiveTx = includedTx === -1 ? -1 : includedTx + txAddonTotal
      const txRemaining = effectiveTx === -1 ? null : Math.max(0, effectiveTx - txUsed)

      // Phase 3: credit balance reads from the latest CreditLedger entry.
      // null = no ledger entries yet (balance is effectively 0 for PREPAID_CREDITS,
      // but we use null to distinguish "no prepaid plan" from "zero balance").
      // The entitlement engine receives null for non-prepaid billing models.
      const creditBalance = businessSubscription.billingModel === BillingModel.PREPAID_CREDITS ? (latestCreditLedger?.balanceAfter ?? 0) : null

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
        creditBalance,
      }
    } else {
      // -----------------------------------------------------------------------
      // No subscription found — attempt trial auto-provisioning (Phase 0).
      //
      // Auto-provisioning is idempotent: the @unique constraint on businessId
      // prevents duplicate records. If provisioning fails (e.g. Trial plan not
      // seeded), we fall through to the open-context fallback so existing
      // workflows are never broken.
      // -----------------------------------------------------------------------
      try {
        const trialPlan = await rootPrisma.subscriptionPlan.findFirst({
          where: { name: 'Trial', isActive: true },
          select: { id: true },
        })

        if (trialPlan) {
          const now = new Date()
          const initialData = SubscriptionEngine.buildInitialSubscription(businessId, trialPlan.id, BillingModel.MONTHLY_SUBSCRIPTION, thresholds, now)

          // Create the subscription and write the initial history record atomically.
          // The DB unique constraint on businessId means a concurrent request will
          // simply fail the create and fall through to findUnique on next load.
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

            // Write the initial history record with the real subscription id
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

          // Re-fetch the newly created subscription with full plan entitlements
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
            const status = freshSubscription.status as import('../entitlement/entitlement-types').SubscriptionStatus
            const planFeatures = freshSubscription.plan.entitlements.map((e: { featureKey: string }) => e.featureKey as CapabilityKey)
            const usageLimits: Partial<Record<CapabilityKey, number>> = {}
            for (const e of freshSubscription.plan.entitlements) {
              if (e.usageLimit !== null) usageLimits[e.featureKey as CapabilityKey] = e.usageLimit
            }
            // Phase 2: txRemaining reads from openUsageCounter (fetched above).
            // A newly provisioned TRIAL subscription has no UsageCounter yet → txUsed = 0.
            const includedTx = freshSubscription.plan.includedTxPerMonth
            const txUsed = openUsageCounter?.txCount ?? 0
            const txAddonTotal = activeTxAddons.reduce((sum: number, a: { quantity: number }) => sum + a.quantity, 0)
            const effectiveTx = includedTx === -1 ? -1 : includedTx + txAddonTotal
            const txRemaining = effectiveTx === -1 ? null : Math.max(0, effectiveTx - txUsed)

            // Phase 3: a freshly provisioned TRIAL subscription has no CreditLedger
            // entries yet. Credit balance is null for non-prepaid billing models.
            const creditBalance = freshSubscription.billingModel === BillingModel.PREPAID_CREDITS ? (latestCreditLedger?.balanceAfter ?? 0) : null

            entitlementContext = {
              status,
              planFeatures,
              usageLimits,
              currentUsage: {},
              txRemaining,
              overrides: entitlementOverrides.map(
                (o: { featureKey: string; granted: boolean; expiresAt: Date | null }): EntitlementOverrideDTO => ({
                  featureKey: o.featureKey,
                  granted: o.granted,
                  expiresAt: o.expiresAt,
                }),
              ),
              creditBalance,
            }
          }
        }
      } catch (provisionErr) {
        // Provisioning failed (e.g. race condition unique constraint, or Trial plan
        // not yet seeded). Log and fall through to open-context below.
        console.warn(`[getAuthUser] Trial auto-provisioning failed for business ${businessId}:`, provisionErr)
      }

      // If provisioning succeeded, entitlementContext is already set above.
      // If it failed or Trial plan is not seeded, fall through to open-context.
      if (!entitlementContext) {
        // -----------------------------------------------------------------------
        // Open-context fallback — grants everything so existing workflows continue.
        // This is the dev/seed-mode safety net; it should not fire in production
        // once the Trial plan is seeded.
        // -----------------------------------------------------------------------
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
    }

    // Pass lifecycle dates into buildSummary so EntitlementSummary carries
    // trialEndsAt for the SubscriptionBanner countdown and currentPeriodEnd
    // for the /billing usage display. Both values are sourced from the
    // subscription record already fetched above.
    const subscriptionMeta = businessSubscription
      ? {
          trialEndsAt: businessSubscription.trialEndsAt ?? null,
          currentPeriodEnd: businessSubscription.currentPeriodEnd ?? null,
          billingModel: (businessSubscription.billingModel ?? null) as import('../entitlement/entitlement-types').BillingModelDomain | null,
          cancelledAt: businessSubscription.cancelledAt ?? null,
          planId: businessSubscription.planId ?? null,
        }
      : undefined

    // Parse configuration for operational settings (VAT, locale, pricing, etc.)
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

    // -------------------------------------------------------------------------
    // Capability lifecycle gate — strip capabilities whose lifecycle state
    // indicates they are not active for this business.
    //
    // Only ENABLED and CONFIGURED are active. All other states mean the
    // capability is not turned on for this business:
    //
    //   HIDDEN      → in plan but not activated (survey didn't surface it,
    //                 and the admin hasn't manually enabled it yet)
    //   RECOMMENDED → system suggested it but user hasn't acted yet
    //   PAUSED      → user explicitly turned it off via Settings → Capabilities
    //   DEPRECATED  → platform-retired
    //
    // Always-on capabilities (checkout, products, settings, etc.) are written
    // as ENABLED at registration by completeRegistration — they are never
    // HIDDEN or PAUSED, so this gate never strips them.
    //
    // Capabilities with no BusinessCapabilityState row at all (very old accounts
    // or capabilities added to the plan after registration) are treated as HIDDEN
    // — not accessible until the admin explicitly enables them.
    // -------------------------------------------------------------------------
    const capabilityStateMap = new Map(capabilityStates.map((c: { capabilityId: string; state: string }) => [c.capabilityId, c.state]))

    // Build the set of IDs that are explicitly in a non-active state.
    // Also collect IDs in planFeatures that have no row at all — treat as HIDDEN.
    const activeStates = new Set(['ENABLED', 'CONFIGURED'])

    entitlementContext = {
      ...entitlementContext,
      planFeatures: entitlementContext.planFeatures.filter(f => {
        const state = capabilityStateMap.get(f)
        if (!state) {
          // No row → never activated → block (treat as HIDDEN)
          // Exception: if capabilityStates is empty (old account with no rows),
          // allow everything to avoid locking out existing businesses.
          return capabilityStates.length === 0
        }
        return activeStates.has(state)
      }),
    }

    const entitlement = EntitlementEngine.buildSummary(allCapabilities, entitlementContext, {
      ...subscriptionMeta,
      txAddonTotal: activeTxAddons.reduce((sum, a) => sum + a.quantity, 0),
    })

    // -------------------------------------------------------------------------
    // Phase 2: Offline checkout restriction
    // canCheckoutOffline is true when the current user is designated as the
    // branch's offline terminal (user.id === branch.offlineTerminalId).
    // When offlineTerminalId is null, NO user can checkout offline for this branch.
    // -------------------------------------------------------------------------
    const canCheckoutOffline = branchData.offlineTerminalId === userId

    // -------------------------------------------------------------------------
    // Authorization Summary — Phase 1
    // Build permission summary for the current user based on their role and
    // any custom grants/revokes. This mirrors the EntitlementEngine pattern.
    // -------------------------------------------------------------------------
    const authorization = await AuthorizationEngine.buildSummary({
      userId,
      role: userData.role,
    })

    return {
      ...user,
      business,
      branch,
      vendorSession,
      configs: parsedConfigs,
      complianceRegistry: (ComplianceKeySchema.safeParse(mergedComplianceRegistry).data ??
        ComplianceKeySchema.parse({
          BIR_TIN: '',
          BIR_PTU_NUMBER: '',
          BIR_PTU_ISSUED_AT: '',
          ...mergedComplianceRegistry,
        })) as ComplianceKeyTypes,
      landingPage: RoleLandingPages[userData.role] ?? '/',
      localOverrides: localOverrides || [],
      entitlement,
      canCheckoutOffline,
      // BOS fields — used by welcome modal, survey-aware tutorials, and setup guide
      deferredCapabilities: (bosData?.deferredCapabilities ?? []) as string[],
      onboardingCompletedAt: bosData?.onboardingCompletedAt ?? null,
      currentProfile: bosData?.currentProfile ?? null,
      authorization,
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
