/**
 * complete-registration.ts
 *
 * Server function called once per new user immediately after:
 *   - Email/password register form submits, OR
 *   - OAuth /register/business-setup interstitial submits.
 *
 * Atomically creates the complete tenant record in a single $transaction:
 *   1. Business
 *   2. Branch (Main Branch)
 *   3. Membership (userId ↔ businessId ↔ branchId, role = ADMIN)
 *   4. SystemConfig defaults (business-type specific)
 *   5. BusinessSubscription (TRIAL via SubscriptionEngine.buildInitialSubscription)
 *   6. SubscriptionStatusHistory (initial TRIAL record)
 *   7. CreditLedger (50 complimentary PROMOTIONAL transactions)
 *
 * Idempotency: Membership has @@unique([userId, businessId]). A double-submit
 * triggers a DB constraint conflict on step 3. The handler catches this and
 * returns the existing businessId/branchId.
 *
 * Session refresh: better-auth's databaseHooks.session.create.before already
 * reads Membership and injects businessId/branchId into new sessions.
 * After this function returns, the caller must trigger a session refresh so
 * the next getAuthUser() call returns a complete ServerUser.
 *
 * Architecture:
 *   - Server function — never runs in the browser bundle.
 *   - Uses rootPrisma for platform-level writes (Business, Branch, etc.).
 *   - SubscriptionEngine and CreditEngine are pure — called for their DTOs.
 *   - No infrastructure imports inside the engines.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '../better-auth/auth-middleware'
import { CreditEventType } from '../billing/credit-engine'
import { SubscriptionEngine } from '../billing/subscription-engine'
import { BillingModel, type LifecycleThresholds } from '../billing/types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CompleteRegistrationInputSchema = z.object({
  displayName: z.string().min(1, 'Name is required'),
  businessName: z.string().min(1, 'Business name is required').max(100),
  businessType: z.enum(['RESTAURANT', 'GROCERY', 'RETAIL']),
})

export type CompleteRegistrationInput = z.infer<typeof CompleteRegistrationInputSchema>

// ---------------------------------------------------------------------------
// SystemConfig defaults by BusinessType (plan §8.3)
// ---------------------------------------------------------------------------

type ConfigDefault = { key: string; value: string }

const BUSINESS_TYPE_CONFIGS: Record<string, ConfigDefault[]> = {
  RESTAURANT: [
    { key: 'PRICE_CONFIGURATION', value: 'INCLUSIVE' },
    { key: 'IS_VAT_REGISTERED', value: 'true' },
    { key: 'ENABLE_ORDER_TAB', value: 'true' },
    { key: 'ENABLE_ORDER', value: 'true' },
    { key: 'ENABLE_CASH_RECONCILIATION', value: 'true' },
    { key: 'ENABLE_TASK', value: 'true' },
    { key: 'ENABLE_PRINT_RECEIPT', value: 'true' },
  ],
  GROCERY: [
    { key: 'PRICE_CONFIGURATION', value: 'EXCLUSIVE' },
    { key: 'IS_VAT_REGISTERED', value: 'true' },
    { key: 'ENABLE_ORDER_TAB', value: 'false' },
    { key: 'ENABLE_ORDER', value: 'false' },
    { key: 'ENABLE_CASH_RECONCILIATION', value: 'true' },
    { key: 'ENABLE_TASK', value: 'true' },
    { key: 'ENABLE_PRINT_RECEIPT', value: 'true' },
  ],
  RETAIL: [
    { key: 'PRICE_CONFIGURATION', value: 'EXCLUSIVE' },
    { key: 'IS_VAT_REGISTERED', value: 'false' },
    { key: 'ENABLE_ORDER_TAB', value: 'false' },
    { key: 'ENABLE_ORDER', value: 'true' },
    { key: 'ENABLE_CASH_RECONCILIATION', value: 'true' },
    { key: 'ENABLE_TASK', value: 'true' },
    { key: 'ENABLE_PRINT_RECEIPT', value: 'true' },
  ],
}

// Global defaults applied to every new business regardless of type.
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

  // Count existing slugs that match base or base-N pattern
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

    // Fetch the Premium plan — new registrants get Premium entitlements
    // on their 50 complimentary credits (Trial mirrors Premium capabilities).
    const trialPlan = await rootPrisma.subscriptionPlan.findFirst({
      where: { name: 'Trial', isActive: true },
      select: { id: true },
    })

    if (!trialPlan) {
      return { success: false as const, error: 'Subscription plans not seeded. Run the database seeder first.' }
    }

    // Default lifecycle thresholds (plan uses 30-day trial)
    const thresholds: LifecycleThresholds = {
      trialDurationDays: 30,
      gracePeriodDays: 7,
      longTermInactiveDays: 90,
    }

    const now = new Date()

    try {
      const slug = await generateUniqueSlug(data.businessName)

      const result = await rootPrisma.$transaction(async tx => {
        // ------------------------------------------------------------------
        // Step 1: Create Business
        // ------------------------------------------------------------------
        const business = await tx.business.create({
          data: {
            name: data.businessName,
            slug,
            businessType: data.businessType as import('prisma/generated/prisma/enums').BusinessType,
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
        // getAuthUser reads userData.role from the User table, not Membership,
        // so we must update it here to get the correct landing page and
        // capability set.
        // ------------------------------------------------------------------
        await tx.user.update({
          where: { id: userId },
          data: { role: 'ADMIN' as import('prisma/generated/prisma/enums').Role },
        })

        // ------------------------------------------------------------------
        // Step 4: Create SystemConfig defaults (business-type specific + global)
        // ------------------------------------------------------------------
        const configs: ConfigDefault[] = BUSINESS_TYPE_CONFIGS[data.businessType] ?? BUSINESS_TYPE_CONFIGS['RETAIL'] ?? []

        // Business-scoped: type-specific keys + global business keys (LOCALE, CURRENCY, VAT_RATE)
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

        // Branch-scoped: global branch keys (BUFFER_RATE, LOW_STOCK_THRESHOLD)
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
        const initialData = SubscriptionEngine.buildInitialSubscription(
          business.id,
          trialPlan.id,
          BillingModel.PREPAID_CREDITS, // New registrations start on PREPAID_CREDITS
          thresholds,
          now,
        )

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
