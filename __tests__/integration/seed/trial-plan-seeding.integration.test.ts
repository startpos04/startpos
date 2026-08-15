/**
 * trial-plan-seeding.integration.test.ts
 *
 * Integration tests for trial plan seeding and configuration.
 * Verifies that the database is seeded with correct trial plan data.
 *
 * Coverage:
 *  ✅ Trial plan is seeded with correct transaction limits
 *  ✅ Trial plan description matches configuration
 *  ✅ Trial plan is marked as active
 *  ✅ Trial plan has correct pricing (free)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { getTestPrisma } from '#tests/integration/helpers/test-prisma'

let prisma: PrismaClient

beforeAll(async () => {
  prisma = (await getTestPrisma())!
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Trial Plan Seeding', () => {
  it('trial plan exists and has correct configuration', async () => {
    const trialPlan = await prisma.subscriptionPlan.findFirst({
      where: { name: 'Trial' },
    })

    expect(trialPlan).not.toBeNull()
    expect(trialPlan!.name).toBe('Trial')
    expect(trialPlan!.includedTxPerMonth).toBe(500)
    expect(trialPlan!.monthlyPrice).toBe(0)
    expect(trialPlan!.overagePerTx).toBe(0)
    expect(trialPlan!.isActive).toBe(true)
    expect(trialPlan!.sortOrder).toBe(0) // First in order
  })

  it('trial plan description mentions correct limits', async () => {
    const trialPlan = await prisma.subscriptionPlan.findFirst({
      where: { name: 'Trial' },
    })

    expect(trialPlan).not.toBeNull()
    expect(trialPlan!.description).toContain('500 transactions')
    expect(trialPlan!.description).toContain('30 days')
    expect(trialPlan!.description).toContain('no credit card required')
  })

  it('basic plan has different limits than trial', async () => {
    const [trialPlan, basicPlan] = await Promise.all([
      prisma.subscriptionPlan.findFirst({ where: { name: 'Trial' } }),
      prisma.subscriptionPlan.findFirst({ where: { name: 'Basic' } }),
    ])

    expect(trialPlan).not.toBeNull()
    expect(basicPlan).not.toBeNull()

    // Trial: 500 TX, free
    expect(trialPlan!.includedTxPerMonth).toBe(500)
    expect(trialPlan!.monthlyPrice).toBe(0)

    // Basic: 1000 TX, paid
    expect(basicPlan!.includedTxPerMonth).toBe(1000)
    expect(basicPlan!.monthlyPrice).toBeGreaterThan(0)

    // Verify the distinction
    expect(trialPlan!.includedTxPerMonth).toBeLessThan(basicPlan!.includedTxPerMonth)
  })

  it('all active plans have valid transaction limits', async () => {
    const activePlans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })

    expect(activePlans.length).toBeGreaterThan(0)

    for (const plan of activePlans) {
      expect(plan.name).toBeTruthy()
      
      // Unlimited plans have -1, others should be positive
      if (plan.includedTxPerMonth !== -1) {
        expect(plan.includedTxPerMonth).toBeGreaterThan(0)
      }
      
      // Free trial is the only plan with 0 price
      if (plan.monthlyPrice === 0) {
        expect(plan.name).toBe('Trial')
      }
    }
  })
})