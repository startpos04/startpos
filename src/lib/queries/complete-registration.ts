/**
 * complete-registration.ts
 *
 * Server function called once per new user immediately after:
 *   - Email/password register form submits, OR
 *   - OAuth /register/business-setup interstitial submits.
 *
 * Atomically creates the complete tenant record in a single $transaction:
 *   1. Business (with BOS onboarding fields from adaptive survey)
 *   2. Branch (Main Branch)
 *   3. Membership (userId ↔ businessId ↔ branchId, role = ADMIN)
 *   3b. User.role promoted to ADMIN
 *   4. SystemConfig defaults (from ConfigurationEngine — capability-derived)
 *   5. BusinessSubscription (TRIAL via SubscriptionEngine.buildInitialSubscription)
 *   6. SubscriptionStatusHistory (initial TRIAL record)
 *   7. CreditLedger (50 complimentary PROMOTIONAL transactions)
 *   8. BusinessCapabilityState rows (ENABLED + RECOMMENDED capabilities)
 *
 * Idempotency: Membership has @@unique([userId, businessId]). A double-submit
 * triggers a DB constraint conflict on step 3. The handler catches this and
 * returns the existing businessId/branchId.
 *
 * Architecture:
 *   - Server function — never runs in the browser bundle.
 *   - Uses rootPrisma for platform-level writes (Business, Branch, etc.).
 *   - SubscriptionEngine and CreditEngine are pure — called for their DTOs.
 *   - No infrastructure imports inside the engines.
 *
 * Shadow-running retired (ADR-004):
 *   The v1 BUSINESS_TYPE_CONFIGS path and ONBOARDING_V2_SHADOW flag have been
 *   removed. All new registrations use the v2 adaptive survey path exclusively.
 *   See docs/decisions/ADR-004-remove-v1-onboarding-path.md.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '../better-auth/auth-middleware'
import { CreditEventType } from '../billing/credit-engine'
import { SubscriptionEngine } from '../billing/subscription-engine'
import { BillingModel, type LifecycleThresholds } from '../billing/types'
import { CAPABILITY_REGISTRY } from '../onboarding/capability-registry'
import { resolveCapabilities } from '../onboarding/capability-resolver'
import { buildConfiguration } from '../onboarding/configuration-engine'
import { suggestPlan } from '../onboarding/plan-advisor'
import { classifyProfile } from '../onboarding/profile-classifier'
import { interpretSurvey } from '../onboarding/survey-interpreter'
import type { SurveyAnswers } from '../onboarding/types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Input schema — v2 only (adaptive survey path)
// Phase 6: v1 businessType-only path removed (ADR-004).
// ---------------------------------------------------------------------------

/**
 * v2 input schema — adaptive survey path.
 * Q1 (business type) is required; all other answers are optional.
 * businessType is accepted but unused — kept for graceful handling of
 * any legacy clients still sending the field during the rollout window.
 * The businessType column on Business is deprecated (do not use for logic).
 */
const CompleteRegistrationInputSchema = z.object({
  displayName: z.string().min(1, 'Name is required'),
  businessName: z.string().min(1, 'Business name is required').max(100),
  /** Deprecated — kept for backward-compat with legacy clients. Not used for config. */
  businessType: z.enum(['RESTAURANT', 'GROCERY', 'RETAIL']).optional(),
  surveyAnswers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})

export type CompleteRegistrationInput = z.infer<typeof CompleteRegistrationInputSchema>

// ---------------------------------------------------------------------------
// Global SystemConfig defaults applied to every new business
// ---------------------------------------------------------------------------

type ConfigDefault = { key: string; value: string }

// These mirror the canonical values in prisma/seeders/configs.ts.
const GLOBAL_BUSINESS_CONFIGS: ConfigDefault[] = [
  { key: 'LOCALE', value: 'en-PH' },
  { key: 'CURRENCY', value: 'PHP' },
  { key: 'VAT_RATE', value: '12' },
]

const GLOBAL_BRANCH_CONFIGS: ConfigDefault[] = [
  { key: 'BUFFER_RATE', value: '20' },
  { key: 'LOW_STOCK_THRESHOLD', value: '20' },
]

const COMPLIMENTARY_CREDITS = 50

// ---------------------------------------------------------------------------
// Slug generator — appends -2, -3, etc. on collision
// ---------------------------------------------------------------------------

async function generateUniqueSlug(baseName: string): Promise<string> {
  const base =
    baseName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'business'

  const existing = await rootPrisma.business.findFirst({
    where: { slug: { startsWith: base } },
    orderBy: { slug: 'desc' },
    select: { slug: true },
  })

  if (!existing) return base

  const slugCount = await rootPrisma.business.count({
    where: { slug: { startsWith: base } },
  })

  return `${base}-${slugCount + 1}`
}

// ---------------------------------------------------------------------------
// completeRegistration server function
// ---------------------------------------------------------------------------

export const completeRegistration = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: CompleteRegistrationInput) => CompleteRegistrationInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.id) {
      return { success: false as const, error: 'Not authenticated' }
    }

    const userId = context.user.id

    // Fetch the Trial plan — new registrants start on Trial with PREPAID_CREDITS billing
    const trialPlan = await rootPrisma.subscriptionPlan.findFirst({
      where: { name: 'Trial', isActive: true },
      select: { id: true },
    })

    if (!trialPlan) {
      return { success: false as const, error: 'Subscription plans not seeded. Run the database seeder first.' }
    }

    const thresholds: LifecycleThresholds = {
      trialDurationDays: 30,
      gracePeriodDays: 7,
      longTermInactiveDays: 90,
    }

    const now = new Date()

    // -----------------------------------------------------------------------
    // Resolve v2 configuration from survey answers (pure functions — no IO)
    // -----------------------------------------------------------------------
    const rawAnswers = data.surveyAnswers as SurveyAnswers
    const characteristics = interpretSurvey(rawAnswers)
    const resolved = resolveCapabilities(characteristics, CAPABILITY_REGISTRY)
    const profile = classifyProfile(characteristics, resolved)
    const v2Config = buildConfiguration(characteristics, resolved, profile)

    // Log the suggested plan (informational — not enforced at registration)
    const _suggestedPlan = suggestPlan(characteristics, profile)

    try {
      const slug = await generateUniqueSlug(data.businessName)

      const result = await rootPrisma.$transaction(async tx => {
        // ------------------------------------------------------------------
        // Step 1: Create Business
        // Store survey answers and BOS profile in the onboarding columns.
        // businessType is written for backward-compat with existing queries
        // that still read it — defaulting to 'RETAIL' if not supplied.
        // The column is deprecated; do not use it for any new logic.
        // ------------------------------------------------------------------
        const legacyBusinessType = data.businessType ?? 'RETAIL'
        const business = await tx.business.create({
          data: {
            name: data.businessName,
            slug,
            // Deprecated column — kept for query compat. Phase 7 may drop it.
            businessType: legacyBusinessType as import('prisma/generated/prisma/enums').BusinessType,
            onboardingSurveyAnswers: data.surveyAnswers as Record<string, unknown>,
            onboardingProfile: v2Config.operationalProfile,
            currentProfile: v2Config.operationalProfile,
            onboardingCompletedAt: now,
            deferredCapabilities: v2Config.deferredCapabilities,
          },
          select: { id: true },
        })

        // ------------------------------------------------------------------
        // Step 2: Create Branch (Main Branch)
        // ------------------------------------------------------------------
        const branch = await tx.branch.create({
          data: {
            name: 'Main Branch',
            businessId: business.id,
            country: 'PH',
            serialNumber: `SN-${Date.now()}`,
            minInvoiceNo: 1,
            maxInvoiceNo: 99999,
            branchCode: '00001',
          },
          select: { id: true },
        })

        // ------------------------------------------------------------------
        // Step 3: Create Membership (role = ADMIN)
        // ------------------------------------------------------------------
        await tx.membership.create({
          data: {
            userId,
            businessId: business.id,
            branchId: branch.id,
            role: 'ADMIN' as import('prisma/generated/prisma/enums').Role,
          },
        })

        // ------------------------------------------------------------------
        // Step 3b: Promote the User record to ADMIN.
        // User.role defaults to CASHIER at sign-up (auth.ts additionalFields).
        // getAuthUser reads userData.role from the User table, not Membership.
        // ------------------------------------------------------------------
        await tx.user.update({
          where: { id: userId },
          data: { role: 'ADMIN' as import('prisma/generated/prisma/enums').Role },
        })

        // ------------------------------------------------------------------
        // Step 4: Create SystemConfig defaults from ConfigurationEngine outputs
        // ------------------------------------------------------------------
        const configs: ConfigDefault[] = v2Config.systemConfigs.map(c => ({
          key: c.key,
          value: c.value,
        }))

        for (const cfg of [...configs, ...GLOBAL_BUSINESS_CONFIGS]) {
          await tx.systemConfig.create({
            data: {
              key: cfg.key as import('prisma/generated/prisma/enums').ConfigKey,
              value: cfg.value,
              scope: 'BUSINESS',
              businessId: business.id,
            },
          })
        }

        for (const cfg of GLOBAL_BRANCH_CONFIGS) {
          await tx.systemConfig.create({
            data: {
              key: cfg.key as import('prisma/generated/prisma/enums').ConfigKey,
              value: cfg.value,
              scope: 'BRANCH',
              businessId: business.id,
              branchId: branch.id,
            },
          })
        }

        // ------------------------------------------------------------------
        // Step 5 + 6: Provision BusinessSubscription (TRIAL) + status history
        // ------------------------------------------------------------------
        const initialData = SubscriptionEngine.buildInitialSubscription(business.id, trialPlan.id, BillingModel.PREPAID_CREDITS, thresholds, now)

        const subscription = await tx.businessSubscription.create({
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
            subscriptionId: subscription.id,
            fromStatus: null,
            toStatus: initialData.transitionRecord.toStatus,
            reason: initialData.transitionRecord.reason,
            triggeredBy: initialData.transitionRecord.triggeredBy,
          },
        })

        // ------------------------------------------------------------------
        // Step 7: Grant 50 complimentary transactions (CreditLedger)
        // ------------------------------------------------------------------
        await tx.creditLedger.create({
          data: {
            businessId: business.id,
            eventType: CreditEventType.PROMOTIONAL as import('prisma/generated/prisma/enums').CreditEventType,
            amount: COMPLIMENTARY_CREDITS,
            balanceAfter: COMPLIMENTARY_CREDITS,
            transactionId: null,
            note: 'Complimentary transactions on registration',
            actorId: userId,
          },
        })

        // ------------------------------------------------------------------
        // Step 8: Write BusinessCapabilityState rows
        // ENABLED capabilities → state='ENABLED'  (analytics: stamp enabledAt)
        // RECOMMENDED capabilities → state='RECOMMENDED' (analytics: stamp recommendedAt)
        // ------------------------------------------------------------------
        for (const capId of v2Config.enabledCapabilities) {
          await tx.businessCapabilityState.create({
            data: {
              businessId: business.id,
              capabilityId: capId,
              state: 'ENABLED',
              confidence: 1,
              enteredBy: 'system',
              enabledAt: now,
            },
          })
        }
        for (const capId of v2Config.deferredCapabilities) {
          await tx.businessCapabilityState.create({
            data: {
              businessId: business.id,
              capabilityId: capId,
              state: 'RECOMMENDED',
              confidence: 0.5,
              enteredBy: 'system',
              recommendedAt: now,
            },
          })
        }

        // ------------------------------------------------------------------
        // Step 9: Seed default catalog scaffolding
        //
        // Every business gets:
        //   - One "General" category     — used by Quick Add as the fallback
        //   - Four common units          — pcs, kg, L, hr
        //     (Quick Add uses pcs; the rest cover the most common physical and
        //      service-based businesses without forcing manual setup upfront)
        //
        // These are the minimum required so a cashier can Quick Add a product
        // on day one without hitting a FK constraint error. They can be renamed
        // or supplemented later from Settings → Categories / Units.
        // ------------------------------------------------------------------
        await tx.category.create({
          data: {
            name: 'General',
            businessId: business.id,
          },
        })

        const DEFAULT_UNITS = [
          { name: 'pcs', abbreviation: 'pcs', type: 'COUNT', isBaseUnit: true },
          { name: 'kg', abbreviation: 'kg', type: 'WEIGHT', isBaseUnit: true },
          { name: 'L', abbreviation: 'L', type: 'VOLUME', isBaseUnit: true },
          { name: 'hr', abbreviation: 'hr', type: 'TIME', isBaseUnit: false },
        ] as const

        for (const unit of DEFAULT_UNITS) {
          await tx.unit.create({
            data: {
              name: unit.name,
              abbreviation: unit.abbreviation,
              type: unit.type as import('prisma/generated/prisma/enums').UnitType,
              conversionFactor: 1,
              isBaseUnit: unit.isBaseUnit,
              businessId: business.id,
            },
          })
        }

        return { businessId: business.id, branchId: branch.id }
      })

      return { success: true as const, ...result }
    } catch (err: unknown) {
      // Idempotency: unique constraint on Membership([userId, businessId])
      // means a double-submit returns the existing tenant record.
      const isUniqueViolation = typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002'

      if (isUniqueViolation) {
        const membership = await rootPrisma.membership.findFirst({
          where: { userId },
          select: { businessId: true, branchId: true },
        })

        if (membership) {
          return {
            success: true as const,
            businessId: membership.businessId,
            branchId: membership.branchId ?? '',
          }
        }
      }

      console.error('[completeRegistration] Failed:', err)
      return { success: false as const, error: 'Registration failed. Please try again.' }
    }
  })
