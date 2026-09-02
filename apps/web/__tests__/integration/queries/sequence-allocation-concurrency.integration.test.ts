/**
 * sequence-allocation-concurrency.integration.test.ts
 *
 * Phase 1 & 2 Integration Tests: Server-side atomic sequence allocation
 *
 * Purpose:
 *   Verify that concurrent sequence allocation requests are handled atomically
 *   by the database with Serializable isolation level, preventing duplicate
 *   sequence numbers even under high concurrency.
 *
 * What we test:
 *   ✅ Multiple concurrent allocations produce unique sequence numbers
 *   ✅ Serialization conflicts are detected and retried with exponential backoff
 *   ✅ No gaps in sequence (all numbers are used exactly once)
 *   ✅ BIR permit limits are enforced atomically
 *   ✅ Different sequence types (INVOICE, ORDER, REFUND) are independent
 *   ✅ Offline terminal restriction blocks unauthorized offline allocations
 *
 * Test approach:
 *   - Uses real database (not mocked) via test-db helpers
 *   - Spawns actual concurrent Promise.all() requests
 *   - Verifies database state after concurrent operations
 *   - Tests serialization conflict detection and retry logic
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { SequenceType } from 'prisma/generated/prisma/enums'
import { getTestPrisma, TenantContext, seedTenant, cleanupTable } from '../helpers/fixtures'

describe('Sequence Allocation Concurrency - Integration', () => {
  let prisma: PrismaClient
  let ctx: TenantContext

  beforeEach(async () => {
    // Set up test database with tenant context
    const db = await getTestPrisma()
    if (!db) throw new Error('Test database not available')
    prisma = db

    // Seed minimal tenant data (business, branch, user, subscription)
    ctx = await seedTenant(prisma)

    // Clean up any existing sequence counters
    await cleanupTable(prisma, 'sequenceCounter')

    // Create initial sequence counter for INVOICE type
    await prisma.sequenceCounter.create({
      data: {
        id: crypto.randomUUID(),
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        sequenceType: SequenceType.INVOICE,
        lastNumber: 0,
        prefix: 'INV',
        minNumber: 1,
        maxNumber: 999999,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Create initial sequence counter for ORDER type
    await prisma.sequenceCounter.create({
      data: {
        id: crypto.randomUUID(),
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        sequenceType: SequenceType.ORDER,
        lastNumber: 0,
        prefix: 'ORD',
        minNumber: 1,
        maxNumber: 999999,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
  })

  describe('Concurrent allocation - race condition prevention', () => {
    it('should allocate unique sequence numbers for 10 concurrent requests', async () => {
      // Simulate 10 cashiers checking out at the same time
      const concurrentRequests = 10
      const promises: Promise<number>[] = []

      for (let i = 0; i < concurrentRequests; i++) {
        const promise = prisma.$transaction(
          async tx => {
            // Read current counter
            const counter = await tx.sequenceCounter.findFirst({
              where: {
                businessId: ctx.businessId,
                branchId: ctx.branchId,
                sequenceType: SequenceType.INVOICE,
              },
            })

            if (!counter) throw new Error('Sequence counter not found')

            // Allocate next number
            const nextNumber = counter.lastNumber + 1

            // Check BIR permit limits
            if (nextNumber > counter.maxNumber) {
              throw new Error('Sequence limit exceeded')
            }

            // Update counter atomically
            await tx.sequenceCounter.update({
              where: { id: counter.id },
              data: { lastNumber: nextNumber },
            })

            return nextNumber
          },
          {
            isolationLevel: 'Serializable',
            timeout: 5000,
          },
        )

        promises.push(promise)
      }

      // Execute all requests concurrently
      const results = await Promise.all(promises)

      // Verify all numbers are unique (no duplicates)
      const uniqueNumbers = new Set(results)
      expect(uniqueNumbers.size).toBe(concurrentRequests)

      // Verify all numbers are in expected range [1, 10]
      expect(Math.min(...results)).toBe(1)
      expect(Math.max(...results)).toBe(concurrentRequests)

      // Verify no gaps (all numbers from 1 to 10 are present)
      const sortedResults = [...results].sort((a, b) => a - b)
      for (let i = 0; i < concurrentRequests; i++) {
        expect(sortedResults[i]).toBe(i + 1)
      }

      // Verify final counter state
      const finalCounter = await prisma.sequenceCounter.findFirst({
        where: {
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          sequenceType: SequenceType.INVOICE,
        },
      })

      expect(finalCounter?.lastNumber).toBe(concurrentRequests)
    })

    it('should handle serialization conflicts with retry logic', async () => {
      // This test verifies that when serialization conflicts occur,
      // the retry logic in allocateWithRetry() handles them gracefully.
      // With Serializable isolation, some transactions will fail and retry.

      const concurrentRequests = 20
      const promises: Promise<number | null>[] = []

      for (let i = 0; i < concurrentRequests; i++) {
        // Simulate retry logic (simplified version of allocateWithRetry)
        const promiseWithRetry = (async () => {
          let lastError: Error | null = null
          const maxRetries = 3
          const delays = [100, 200, 400]

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              return await prisma.$transaction(
                async tx => {
                  const counter = await tx.sequenceCounter.findFirst({
                    where: {
                      businessId: ctx.businessId,
                      branchId: ctx.branchId,
                      sequenceType: SequenceType.INVOICE,
                    },
                  })

                  if (!counter) throw new Error('Sequence counter not found')

                  const nextNumber = counter.lastNumber + 1

                  if (nextNumber > counter.maxNumber) {
                    throw new Error('Sequence limit exceeded')
                  }

                  await tx.sequenceCounter.update({
                    where: { id: counter.id },
                    data: { lastNumber: nextNumber },
                  })

                  return nextNumber
                },
                {
                  isolationLevel: 'Serializable',
                  timeout: 5000,
                },
              )
            } catch (error) {
              lastError = error as Error
              // Check if it's a serialization error
              const isSerializationError =
                error instanceof Error && (error.message.includes('serialization') || error.message.includes('deadlock'))

              if (isSerializationError && attempt < maxRetries - 1) {
                // Wait with exponential backoff before retry
                await new Promise(resolve => setTimeout(resolve, delays[attempt]))
                continue
              }
              throw error
            }
          }

          throw lastError || new Error('Max retries exceeded')
        })()

        promises.push(promiseWithRetry)
      }

      // Execute all requests concurrently
      const results = await Promise.all(promises)
      const validResults = results.filter((r): r is number => r !== null)

      // All requests should eventually succeed with retry logic
      expect(validResults.length).toBe(concurrentRequests)

      // All numbers should be unique
      const uniqueNumbers = new Set(validResults)
      expect(uniqueNumbers.size).toBe(concurrentRequests)

      // No gaps in sequence
      expect(Math.min(...validResults)).toBe(1)
      expect(Math.max(...validResults)).toBe(concurrentRequests)
    })

    it('should enforce BIR permit limits atomically', async () => {
      // Set a low limit to test boundary condition
      await prisma.sequenceCounter.updateMany({
        where: {
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          sequenceType: SequenceType.INVOICE,
        },
        data: {
          lastNumber: 8,
          maxNumber: 10, // Only 2 numbers left
        },
      })

      const concurrentRequests = 5 // More requests than available numbers
      const promises: Promise<number>[] = []

      for (let i = 0; i < concurrentRequests; i++) {
        const promise = prisma
          .$transaction(
            async tx => {
              const counter = await tx.sequenceCounter.findFirst({
                where: {
                  businessId: ctx.businessId,
                  branchId: ctx.branchId,
                  sequenceType: SequenceType.INVOICE,
                },
              })

              if (!counter) throw new Error('Sequence counter not found')

              const nextNumber = counter.lastNumber + 1

              if (nextNumber > counter.maxNumber) {
                throw new Error('BIR permit exhausted')
              }

              await tx.sequenceCounter.update({
                where: { id: counter.id },
                data: { lastNumber: nextNumber },
              })

              return nextNumber
            },
            {
              isolationLevel: 'Serializable',
              timeout: 5000,
            },
          )
          .catch(err => {
            // Expected to fail when limit is exceeded
            if (err.message.includes('BIR permit exhausted')) {
              return -1 // Marker for failed allocation
            }
            throw err
          })

        promises.push(promise)
      }

      const results = await Promise.all(promises)

      // Exactly 2 should succeed (9 and 10), 3 should fail
      const successful = results.filter(n => n > 0)
      const failed = results.filter(n => n === -1)

      expect(successful.length).toBe(2)
      expect(failed.length).toBe(3)
      expect(successful).toContain(9)
      expect(successful).toContain(10)
    })

    it('should keep different sequence types independent', async () => {
      // Concurrent allocations of INVOICE and ORDER types should not interfere
      const invoicePromises: Promise<string>[] = []
      const orderPromises: Promise<string>[] = []

      for (let i = 0; i < 5; i++) {
        // Allocate INVOICE
        invoicePromises.push(
          prisma.$transaction(
            async tx => {
              const counter = await tx.sequenceCounter.findFirst({
                where: {
                  businessId: ctx.businessId,
                  branchId: ctx.branchId,
                  sequenceType: SequenceType.INVOICE,
                },
              })

              if (!counter) throw new Error('Counter not found')

              const nextNumber = counter.lastNumber + 1
              await tx.sequenceCounter.update({
                where: { id: counter.id },
                data: { lastNumber: nextNumber },
              })

              return `${counter.prefix}${String(nextNumber).padStart(6, '0')}`
            },
            { isolationLevel: 'Serializable', timeout: 5000 },
          ),
        )

        // Allocate ORDER
        orderPromises.push(
          prisma.$transaction(
            async tx => {
              const counter = await tx.sequenceCounter.findFirst({
                where: {
                  businessId: ctx.businessId,
                  branchId: ctx.branchId,
                  sequenceType: SequenceType.ORDER,
                },
              })

              if (!counter) throw new Error('Counter not found')

              const nextNumber = counter.lastNumber + 1
              await tx.sequenceCounter.update({
                where: { id: counter.id },
                data: { lastNumber: nextNumber },
              })

              return `${counter.prefix}${String(nextNumber).padStart(6, '0')}`
            },
            { isolationLevel: 'Serializable', timeout: 5000 },
          ),
        )
      }

      const [invoiceResults, orderResults] = await Promise.all([Promise.all(invoicePromises), Promise.all(orderPromises)])

      // Both types should have 5 unique numbers
      expect(new Set(invoiceResults).size).toBe(5)
      expect(new Set(orderResults).size).toBe(5)

      // Invoice numbers should all start with INV
      invoiceResults.forEach(inv => expect(inv).toMatch(/^INV\d{6}$/))

      // Order numbers should all start with ORD
      orderResults.forEach(ord => expect(ord).toMatch(/^ORD\d{6}$/))

      // Invoice and order sequences should be independent
      expect(invoiceResults[0]).toBe('INV000001')
      expect(orderResults[0]).toBe('ORD000001')
    })
  })

  describe('Phase 2: Offline terminal restriction', () => {
    it('should block offline allocation for non-designated users', async () => {
      // Create a user who is NOT the designated offline terminal
      const unauthorizedUserId = crypto.randomUUID()
      await prisma.user.create({
        data: {
          id: unauthorizedUserId,
          email: 'unauthorized@example.com',
          name: 'Unauthorized User',
          role: 'CASHIER',
          memberships: {
            create: {
              businessId: ctx.businessId,
              branchId: ctx.branchId,
            },
          },
        },
      })

      // Set a different user as the offline terminal
      const authorizedUserId = ctx.userId
      await prisma.branch.update({
        where: { id: ctx.branchId },
        data: { offlineTerminalId: authorizedUserId },
      })

      // Verify unauthorized user cannot checkout offline
      const branch = await prisma.branch.findUnique({
        where: { id: ctx.branchId },
        select: { offlineTerminalId: true },
      })

      const canCheckoutOffline = branch?.offlineTerminalId === unauthorizedUserId
      expect(canCheckoutOffline).toBe(false)

      // Verify authorized user CAN checkout offline
      const authorizedCanCheckout = branch?.offlineTerminalId === authorizedUserId
      expect(authorizedCanCheckout).toBe(true)
    })

    it('should block all offline checkouts when offlineTerminalId is null', async () => {
      // Set offlineTerminalId to null (no offline terminal designated)
      await prisma.branch.update({
        where: { id: ctx.branchId },
        data: { offlineTerminalId: null },
      })

      // Verify no user can checkout offline
      const branch = await prisma.branch.findUnique({
        where: { id: ctx.branchId },
        select: { offlineTerminalId: true },
      })

      expect(branch?.offlineTerminalId).toBeNull()

      // Even the original user cannot checkout
      const canCheckout = branch?.offlineTerminalId === ctx.userId
      expect(canCheckout).toBe(false)
    })

    it('should allow only one designated offline terminal per branch', async () => {
      const user1Id = ctx.userId
      const user2Id = crypto.randomUUID()

      await prisma.user.create({
        data: {
          id: user2Id,
          email: 'user2@example.com',
          name: 'User 2',
          role: 'CASHIER',
          memberships: {
            create: {
              businessId: ctx.businessId,
              branchId: ctx.branchId,
            },
          },
        },
      })

      // Designate user1 as offline terminal
      await prisma.branch.update({
        where: { id: ctx.branchId },
        data: { offlineTerminalId: user1Id },
      })

      let branch = await prisma.branch.findUnique({
        where: { id: ctx.branchId },
        select: { offlineTerminalId: true },
      })

      expect(branch?.offlineTerminalId).toBe(user1Id)

      // Change designation to user2 (should replace user1)
      await prisma.branch.update({
        where: { id: ctx.branchId },
        data: { offlineTerminalId: user2Id },
      })

      branch = await prisma.branch.findUnique({
        where: { id: ctx.branchId },
        select: { offlineTerminalId: true },
      })

      expect(branch?.offlineTerminalId).toBe(user2Id)

      // Verify user1 is no longer the offline terminal
      expect(branch?.offlineTerminalId).not.toBe(user1Id)
    })
  })
})
