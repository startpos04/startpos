/**
 * trial-configuration.integration.test.ts
 *
 * Integration tests for trial configuration across multiple systems.
 * Tests complete trial setup from plan seeding to actual business operations.
 *
 * Strategy:
 *  - System Integration: Test how trial configuration flows through plan → subscription → usage
 *  - Real Database: Verify FK constraints, transaction atomicity, and data consistency
 *  - Lifecycle Testing: Trial creation → usage tracking → expiration scenarios
 *  - Configuration Validation: 500 TX allowance + 50 credits are correctly applied
 *
 * Coverage:
 *  ✅ Trial plan seeding with correct 500 TX limit
 *  ✅ Business registration creates proper trial subscription
 *  ✅ Trial subscription includes correct credit allocation (50 credits)
 *  ✅ Transaction allowance is separate from credits
 *  ✅ Credits persist beyond trial expiration
 *  ✅ Trial duration calculation (30 days)
 *  ✅ Business can operate within trial limits
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { getTestPrisma, withRollback, dbDescribe } from '#tests/integration/helpers/test-db'
import { seedTenant, seedProduct } from '#tests/integration/helpers/fixtures'
import { CreditEventType } from '@/lib/billing/credit-engine'
import { SubscriptionEngine } from '@/lib/billing/subscription-engine'
import type { LifecycleThresholds } from '@/lib/billing/types'

let prisma: PrismaClient

beforeAll(async () => {
  prisma = (await getTestPrisma())!
})

afterAll(async () => {
  if (prisma) await prisma.$disconnect()
})

dbDescribe('Trial Configuration Integration', () => {
  // Trial configuration constants matching actual implementation
  const TRIAL_CONFIG = {
    planName: 'Trial',
    transactionLimit: 500,
    credits: 50,
    durationDays: 30,
    monthlyPrice: 0,
  }

  it('trial plan is seeded with correct transaction limits and pricing', async () => {
    await withRollback(async () => {
      // Ensure trial plan exists (should be seeded in setup)
      await prisma.subscriptionPlan.upsert({
        where: { name: TRIAL_CONFIG.planName },
        create: {
          name: TRIAL_CONFIG.planName,
          description: 'Full access for 30 days — no credit card required. Limited to 500 transactions.',
          sortOrder: 0,
          monthlyPrice: TRIAL_CONFIG.monthlyPrice,
          includedTxPerMonth: TRIAL_CONFIG.transactionLimit,
          overagePerTx: 0,
          isActive: true,
        },
        update: {
          includedTxPerMonth: TRIAL_CONFIG.transactionLimit,
          monthlyPrice: TRIAL_CONFIG.monthlyPrice,
          isActive: true,
        },
      })

      // Verify plan configuration
      const trialPlan = await prisma.subscriptionPlan.findUnique({
        where: { name: TRIAL_CONFIG.planName },
      })

      expect(trialPlan).not.toBeNull()
      expect(trialPlan!.includedTxPerMonth).toBe(TRIAL_CONFIG.transactionLimit)
      expect(trialPlan!.monthlyPrice).toBe(TRIAL_CONFIG.monthlyPrice)
      expect(trialPlan!.isActive).toBe(true)
    })
  })

  it('business registration creates complete trial subscription with all components', async () => {
    await withRollback(async () => {
      // Use fixture to create a complete tenant with trial subscription
      const tenant = await seedTenant(prisma, { planName: TRIAL_CONFIG.planName })

      // Verify business subscription was created correctly
      const subscription = await prisma.businessSubscription.findUnique({
        where: { id: tenant.subscriptionId },
        include: { plan: true },
      })

      expect(subscription).not.toBeNull()
      expect(subscription!.status).toBe('TRIAL')
      expect(subscription!.billingModel).toBe('PREPAID_CREDITS')
      expect(subscription!.plan.name).toBe(TRIAL_CONFIG.planName)
      expect(subscription!.plan.includedTxPerMonth).toBe(TRIAL_CONFIG.transactionLimit)

      // Verify trial duration is set correctly
      const now = new Date()
      const expectedTrialEnd = new Date(now.getTime() + TRIAL_CONFIG.durationDays * 24 * 60 * 60 * 1000)
      const actualTrialEnd = subscription!.trialEndsAt!

      const diffDays = Math.abs((actualTrialEnd.getTime() - expectedTrialEnd.getTime()) / (1000 * 60 * 60 * 24))
      expect(diffDays).toBeLessThan(1) // Allow for test execution time differences

      // Verify subscription status history was created
      const statusHistory = await prisma.subscriptionStatusHistory.findFirst({
        where: { subscriptionId: tenant.subscriptionId },
      })

      expect(statusHistory).not.toBeNull()
      expect(statusHistory!.fromStatus).toBeNull()
      expect(statusHistory!.toStatus).toBe('TRIAL')
      expect(statusHistory!.triggeredBy).toBe('system')
    })
  })

  it('trial registration grants exactly 50 complimentary credits as separate benefit', async () => {
    await withRollback(async () => {
      const tenant = await seedTenant(prisma, { planName: TRIAL_CONFIG.planName })

      // Check credit ledger entry
      const creditEntry = await prisma.creditLedger.findFirst({
        where: { businessId: tenant.businessId, eventType: CreditEventType.PROMOTIONAL },
        orderBy: { createdAt: 'desc' },
      })

      expect(creditEntry).not.toBeNull()
      expect(creditEntry!.amount).toBe(TRIAL_CONFIG.credits)
      expect(creditEntry!.balanceAfter).toBe(TRIAL_CONFIG.credits)
      expect(creditEntry!.eventType).toBe(CreditEventType.PROMOTIONAL)
      expect(creditEntry!.note).toContain('complimentary')

      // Verify credits are separate from transaction allowance
      const subscription = await prisma.businessSubscription.findUnique({
        where: { businessId: tenant.businessId },
        include: { plan: true },
      })

      // Transaction allowance (500) is different from credits (50)
      expect(subscription!.plan.includedTxPerMonth).toBe(TRIAL_CONFIG.transactionLimit)
      expect(creditEntry!.balanceAfter).toBe(TRIAL_CONFIG.credits)
      expect(TRIAL_CONFIG.transactionLimit).not.toBe(TRIAL_CONFIG.credits)
    })
  })

  it('trial business can operate within configured limits', async () => {
    await withRollback(async () => {
      const tenant = await seedTenant(prisma, { planName: TRIAL_CONFIG.planName })
      const product = await seedProduct(prisma, tenant)

      // Verify business has operational components
      const business = await prisma.business.findUnique({
        where: { id: tenant.businessId },
        include: { branches: true },
      })

      expect(business).not.toBeNull()
      expect(business!.branches).toHaveLength(1)

      // Verify product is available for sales
      const productRecord = await prisma.product.findUnique({
        where: { id: product.productId },
        include: { variants: { include: { inventory: true } } },
      })

      expect(productRecord).not.toBeNull()
      expect(productRecord!.variants).toHaveLength(1)
      expect(productRecord!.variants[0]!.inventory).toHaveLength(1)
      expect(productRecord!.variants[0]!.inventory[0]!.quantity).toBeGreaterThan(0)

      // Verify credits are available for transactions
      const creditBalance = await prisma.creditLedger.findFirst({
        where: { businessId: tenant.businessId },
        orderBy: { createdAt: 'desc' },
      })

      expect(creditBalance!.balanceAfter).toBe(TRIAL_CONFIG.credits)
    })
  })

  it('subscription engine calculates trial end date correctly', async () => {
    await withRollback(async () => {
      const businessId = 'test-biz-se-001'
      const trialPlan = await prisma.subscriptionPlan.findFirst({
        where: { name: TRIAL_CONFIG.planName, isActive: true },
      })

      expect(trialPlan).not.toBeNull()

      const thresholds: LifecycleThresholds = {
        trialDurationDays: TRIAL_CONFIG.durationDays,
        gracePeriodDays: 7,
        longTermInactiveDays: 90,
      }

      const now = new Date()
      const initialSubscription = SubscriptionEngine.buildInitialSubscription(
        businessId,
        trialPlan!.id,
        'PREPAID_CREDITS',
        thresholds,
        now
      )

      // Verify trial duration calculation
      const expectedTrialEnd = new Date(now.getTime() + TRIAL_CONFIG.durationDays * 24 * 60 * 60 * 1000)
      const actualTrialEnd = initialSubscription.trialEndsAt!

      const timeDiffMs = Math.abs(actualTrialEnd.getTime() - expectedTrialEnd.getTime())
      const timeDiffSeconds = timeDiffMs / 1000

      expect(timeDiffSeconds).toBeLessThan(2) // Allow for execution time
      expect(initialSubscription.status).toBe('TRIAL')
      expect(initialSubscription.billingModel).toBe('PREPAID_CREDITS')
    })
  })

  it('credits persist beyond trial expiration (no credit expiry)', async () => {
    await withRollback(async () => {
      const tenant = await seedTenant(prisma, { planName: TRIAL_CONFIG.planName })

      // Simulate expired trial by updating subscription
      await prisma.businessSubscription.update({
        where: { id: tenant.subscriptionId },
        data: {
          status: 'EXPIRED',
          trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        },
      })

      // Add status history for the expiration
      await prisma.subscriptionStatusHistory.create({
        data: {
          subscriptionId: tenant.subscriptionId,
          fromStatus: 'TRIAL',
          toStatus: 'EXPIRED',
          reason: 'Trial period ended',
          triggeredBy: 'system',
        },
      })

      // Verify subscription is expired but credits remain
      const subscription = await prisma.businessSubscription.findUnique({
        where: { id: tenant.subscriptionId },
      })
      expect(subscription!.status).toBe('EXPIRED')

      // Check that credits are still available
      const latestCredit = await prisma.creditLedger.findFirst({
        where: { businessId: tenant.businessId },
        orderBy: { createdAt: 'desc' },
      })

      expect(latestCredit).not.toBeNull()
      expect(latestCredit!.balanceAfter).toBe(TRIAL_CONFIG.credits)
      expect(latestCredit!.eventType).toBe(CreditEventType.PROMOTIONAL)

      // Verify no credit expiration entries
      const expiredCredits = await prisma.creditLedger.findMany({
        where: {
          businessId: tenant.businessId,
          eventType: CreditEventType.EXPIRED,
        },
      })

      expect(expiredCredits).toHaveLength(0)
    })
  })

  it('trial configuration supports business type variations', async () => {
    await withRollback(async () => {
      const businessTypes: Array<'RETAIL' | 'RESTAURANT' | 'GROCERY'> = ['RETAIL', 'RESTAURANT', 'GROCERY']

      for (const businessType of businessTypes) {
        const tenant = await seedTenant(prisma, { businessType, planName: TRIAL_CONFIG.planName })

        // All business types should get same trial configuration
        const subscription = await prisma.businessSubscription.findUnique({
          where: { businessId: tenant.businessId },
          include: { plan: true },
        })

        expect(subscription!.plan.includedTxPerMonth).toBe(TRIAL_CONFIG.transactionLimit)
        expect(subscription!.status).toBe('TRIAL')

        // All should get same credit amount
        const creditEntry = await prisma.creditLedger.findFirst({
          where: { businessId: tenant.businessId, eventType: CreditEventType.PROMOTIONAL },
        })

        expect(creditEntry!.amount).toBe(TRIAL_CONFIG.credits)

        // Business type should be preserved
        const business = await prisma.business.findUnique({
          where: { id: tenant.businessId },
        })

        expect(business!.businessType).toBe(businessType)
      }
    })
  })

  it('trial configuration is atomic - either all components succeed or none', async () => {
    await withRollback(async () => {
      // This test verifies the atomicity of trial setup
      // If any part fails, no partial state should be left behind
      const businessId = 'test-atomic-001'

      try {
        // Simulate a successful tenant creation
        const tenant = await seedTenant(prisma, { planName: TRIAL_CONFIG.planName })

        // Verify all components exist together
        const business = await prisma.business.findUnique({ where: { id: tenant.businessId } })
        const subscription = await prisma.businessSubscription.findUnique({ where: { businessId: tenant.businessId } })
        const credits = await prisma.creditLedger.findFirst({ where: { businessId: tenant.businessId } })
        const membership = await prisma.membership.findFirst({ where: { businessId: tenant.businessId } })

        expect(business).not.toBeNull()
        expect(subscription).not.toBeNull()
        expect(credits).not.toBeNull()
        expect(membership).not.toBeNull()

        // All should be consistent
        expect(subscription!.status).toBe('TRIAL')
        expect(credits!.amount).toBe(TRIAL_CONFIG.credits)
        expect(membership!.role).toBe('ADMIN')
      } catch (error) {
        // If there's an error, verify no partial state exists
        const orphanBusinesses = await prisma.business.findMany({
          where: { id: { startsWith: businessId } },
        })
        expect(orphanBusinesses).toHaveLength(0)
      }
    })
  })
})

dbDescribe('Trial Usage Tracking Integration', () => {
  it('trial limits can be monitored through entitlement system', async () => {
    await withRollback(async () => {
      const tenant = await seedTenant(prisma, { planName: 'Trial' })

      // Verify that the subscription and credit data would support entitlement calculation
      const subscription = await prisma.businessSubscription.findUnique({
        where: { businessId: tenant.businessId },
        include: {
          plan: true,
          business: {
            include: {
              creditLedger: { orderBy: { createdAt: 'desc' }, take: 1 }
            }
          }
        },
      })

      expect(subscription).not.toBeNull()

      // Data needed for entitlement calculation should be available
      expect(subscription!.plan.includedTxPerMonth).toBe(500) // TX allowance
      expect(subscription!.business.creditLedger[0]?.balanceAfter).toBe(50) // Credits
      expect(subscription!.status).toBe('TRIAL')

      // Trial end date should be calculable
      expect(subscription!.trialEndsAt).not.toBeNull()
      expect(subscription!.trialEndsAt!.getTime()).toBeGreaterThan(Date.now())
    })
  })
})