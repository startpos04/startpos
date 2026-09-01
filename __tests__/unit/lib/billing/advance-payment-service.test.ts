/**
 * advance-payment-service.test.ts
 *
 * Unit tests for AdvancePaymentService
 *
 * Tests cover:
 * - Payment application with credit allocation
 * - Provider sync detection
 * - Credit consumption logic
 * - Billing period skip detection
 * - Failed sync retry mechanism
 * - Edge cases (expired credits, zero credits, invalid data)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { BillingPayment, BusinessSubscription, Business } from '@prisma/client'
import { advancePaymentService, AdvancePaymentService } from '@/lib/billing/advance-payment-service'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
    },
    businessSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    billingPayment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/billing/advance-payment-sync-service', () => ({
  createAdvancePaymentSyncService: vi.fn(() => ({
    applyAdvanceCredits: vi.fn(),
    syncAdvancePayment: vi.fn(),
    shouldSkipCharge: vi.fn(),
    consumeAdvanceCredit: vi.fn(),
    retryFailedSync: vi.fn(),
  })),
}))

vi.mock('@/lib/billing/adapters/stripe-adapter', () => ({
  createStripeAdapter: vi.fn(() => ({})),
}))

// ---------------------------------------------------------------------------
// Import mocked modules
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma-client'
import { createAdvancePaymentSyncService } from '@/lib/billing/advance-payment-sync-service'

const mockPrisma = vi.mocked(prisma)
const mockCreateSyncService = vi.mocked(createAdvancePaymentSyncService)

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createMockBusiness(overrides?: Partial<Business>): Business {
  return {
    id: 'biz-001',
    name: 'Test Business',
    preferredPaymentProvider: 'STRIPE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Business
}

function createMockSubscription(overrides?: Partial<BusinessSubscription>): BusinessSubscription {
  return {
    id: 'sub-001',
    businessId: 'biz-001',
    subscriptionPlanId: 'plan-001',
    status: 'ACTIVE',
    advancePaymentCredits: 0,
    advancePaymentExpiresAt: null,
    lastAdvancePaymentId: null,
    lastAdvancePaymentAt: null,
    currentPeriodStart: new Date('2026-08-01'),
    currentPeriodEnd: new Date('2026-09-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as BusinessSubscription
}

function createMockPayment(overrides?: Partial<BillingPayment>): BillingPayment {
  return {
    id: 'pay-001',
    businessId: 'biz-001',
    subscriptionId: 'sub-001',
    amount: 15000, // $150.00 (3 months × $50)
    currency: 'USD',
    status: 'SUCCEEDED',
    provider: 'MANUAL',
    isAdvancePayment: true,
    periodsAdvancePaid: 3,
    coversPeriodStart: new Date('2026-09-01'),
    coversPeriodEnd: new Date('2026-12-01'),
    syncStatus: 'PENDING',
    syncedProviderId: null,
    syncTransactionId: null,
    syncAttempts: 0,
    lastSyncAttemptAt: null,
    syncErrorMessage: null,
    createdAt: new Date('2026-08-31'),
    paidAt: new Date('2026-08-31'),
    ...overrides,
  } as BillingPayment
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvancePaymentService', () => {
  let service: AdvancePaymentService

  beforeEach(() => {
    vi.clearAllMocks()
    service = advancePaymentService
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // -------------------------------------------------------------------------
  // shouldSyncToProvider()
  // -------------------------------------------------------------------------

  describe('shouldSyncToProvider', () => {
    it('returns true when business has Stripe provider', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'STRIPE' })
      )

      const result = await service.shouldSyncToProvider('biz-001')

      expect(result).toBe(true)
      expect(mockPrisma.business.findUnique).toHaveBeenCalledWith({
        where: { id: 'biz-001' },
        select: { preferredPaymentProvider: true },
      })
    })

    it('returns true when business has PayMongo provider', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'PAYMONGO' })
      )

      const result = await service.shouldSyncToProvider('biz-001')

      expect(result).toBe(true)
    })

    it('returns false when business has MANUAL provider', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'MANUAL' })
      )

      const result = await service.shouldSyncToProvider('biz-001')

      expect(result).toBe(false)
    })

    it('returns false when business has no provider', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: null })
      )

      const result = await service.shouldSyncToProvider('biz-001')

      expect(result).toBe(false)
    })

    it('returns false when business not found', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(null)

      const result = await service.shouldSyncToProvider('biz-999')

      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // getProviderToSync()
  // -------------------------------------------------------------------------

  describe('getProviderToSync', () => {
    it('returns STRIPE when business uses Stripe', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'STRIPE' })
      )

      const result = await service.getProviderToSync('biz-001')

      expect(result).toBe('STRIPE')
    })

    it('returns PAYMONGO when business uses PayMongo', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'PAYMONGO' })
      )

      const result = await service.getProviderToSync('biz-001')

      expect(result).toBe('PAYMONGO')
    })

    it('returns null when business uses MANUAL', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'MANUAL' })
      )

      const result = await service.getProviderToSync('biz-001')

      expect(result).toBe(null)
    })

    it('returns null when business not found', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(null)

      const result = await service.getProviderToSync('biz-999')

      expect(result).toBe(null)
    })
  })

  // -------------------------------------------------------------------------
  // applyAdvancePayment()
  // -------------------------------------------------------------------------

  describe('applyAdvancePayment', () => {
    it('applies advance payment with Stripe sync', async () => {
      const payment = createMockPayment()
      const subscription = createMockSubscription({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01'),
      })

      // Mock business has Stripe
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'STRIPE' })
      )

      // Mock sync service
      const mockSyncService = {
        applyAdvanceCredits: vi.fn().mockResolvedValue({ subscription }),
        syncAdvancePayment: vi.fn().mockResolvedValue({ success: true, scheduleId: 'sched_123' }),
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.applyAdvancePayment(payment)

      expect(result.success).toBe(true)
      expect(result.subscription).toEqual(subscription)
      expect(result.syncRequired).toBe(true)
      expect(mockSyncService.applyAdvanceCredits).toHaveBeenCalledWith('sub-001', payment)
      expect(mockSyncService.syncAdvancePayment).toHaveBeenCalledWith(payment)
      expect(mockPrisma.billingPayment.update).toHaveBeenCalledWith({
        where: { id: 'pay-001' },
        data: {
          syncStatus: 'PENDING',
          syncedProviderId: 'STRIPE',
        },
      })
    })

    it('applies advance payment without sync (manual-only)', async () => {
      const payment = createMockPayment()
      const subscription = createMockSubscription({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01'),
      })

      // Mock business has no provider
      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: null })
      )

      const mockSyncService = {
        applyAdvanceCredits: vi.fn().mockResolvedValue({ subscription }),
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.applyAdvancePayment(payment)

      expect(result.success).toBe(true)
      expect(result.subscription).toEqual(subscription)
      expect(result.syncRequired).toBe(false)
      expect(mockPrisma.billingPayment.update).toHaveBeenCalledWith({
        where: { id: 'pay-001' },
        data: { syncStatus: 'NOT_REQUIRED' },
      })
    })

    it('handles payment without subscriptionId', async () => {
      const payment = createMockPayment({ subscriptionId: null })

      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'STRIPE' })
      )

      const result = await service.applyAdvancePayment(payment)

      expect(result.success).toBe(false)
      expect(result.error).toContain('no associated subscription')
    })

    it('continues even if sync fails', async () => {
      const payment = createMockPayment()
      const subscription = createMockSubscription({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01'),
      })

      mockPrisma.business.findUnique.mockResolvedValue(
        createMockBusiness({ preferredPaymentProvider: 'STRIPE' })
      )

      const mockSyncService = {
        applyAdvanceCredits: vi.fn().mockResolvedValue({ subscription }),
        syncAdvancePayment: vi.fn().mockResolvedValue({ success: false, error: 'Stripe API error' }),
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.applyAdvancePayment(payment)

      // Payment application succeeds even though sync failed
      expect(result.success).toBe(true)
      expect(result.subscription).toEqual(subscription)
      expect(result.syncResult?.success).toBe(false)
    })

    it('handles errors gracefully', async () => {
      const payment = createMockPayment()

      mockPrisma.business.findUnique.mockRejectedValue(new Error('Database error'))

      const result = await service.applyAdvancePayment(payment)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database error')
    })
  })

  // -------------------------------------------------------------------------
  // shouldSkipBillingPeriod()
  // -------------------------------------------------------------------------

  describe('shouldSkipBillingPeriod', () => {
    it('returns true when subscription has active advance credits', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01'),
      })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      const mockSyncService = {
        shouldSkipCharge: vi.fn().mockResolvedValue(true),
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.shouldSkipBillingPeriod('sub-001', new Date('2026-09-01'))

      expect(result).toBe(true)
      expect(mockSyncService.shouldSkipCharge).toHaveBeenCalledWith(
        subscription,
        new Date('2026-09-01')
      )
    })

    it('returns false when subscription not found', async () => {
      mockPrisma.businessSubscription.findUnique.mockResolvedValue(null)

      const result = await service.shouldSkipBillingPeriod('sub-999', new Date('2026-09-01'))

      expect(result).toBe(false)
    })

    it('returns false when subscription has no advance credits', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
      })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      const mockSyncService = {
        shouldSkipCharge: vi.fn().mockResolvedValue(false),
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.shouldSkipBillingPeriod('sub-001', new Date('2026-09-01'))

      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // consumeAdvanceCredit()
  // -------------------------------------------------------------------------

  describe('consumeAdvanceCredit', () => {
    it('consumes one credit and returns remaining count', async () => {
      const mockSyncService = {
        consumeAdvanceCredit: vi.fn().mockResolvedValue(2), // 3 → 2
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.consumeAdvanceCredit('sub-001')

      expect(result).toBe(2)
      expect(mockSyncService.consumeAdvanceCredit).toHaveBeenCalledWith('sub-001')
    })

    it('returns 0 when last credit consumed', async () => {
      const mockSyncService = {
        consumeAdvanceCredit: vi.fn().mockResolvedValue(0), // 1 → 0
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.consumeAdvanceCredit('sub-001')

      expect(result).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // getAdvancePaymentStatus()
  // -------------------------------------------------------------------------

  describe('getAdvancePaymentStatus', () => {
    it('returns status with active credits', async () => {
      mockPrisma.businessSubscription.findUnique.mockResolvedValue(
        createMockSubscription({
          advancePaymentCredits: 3,
          advancePaymentExpiresAt: new Date('2026-12-01'),
          lastAdvancePaymentId: 'pay-001',
          lastAdvancePaymentAt: new Date('2026-08-31'),
        })
      )

      const result = await service.getAdvancePaymentStatus('sub-001')

      expect(result).toEqual({
        hasCredits: true,
        creditsRemaining: 3,
        expiresAt: new Date('2026-12-01'),
        lastPaymentId: 'pay-001',
        lastPaymentAt: new Date('2026-08-31'),
      })
    })

    it('returns status with no credits', async () => {
      mockPrisma.businessSubscription.findUnique.mockResolvedValue(
        createMockSubscription({
          advancePaymentCredits: 0,
          advancePaymentExpiresAt: null,
          lastAdvancePaymentId: null,
          lastAdvancePaymentAt: null,
        })
      )

      const result = await service.getAdvancePaymentStatus('sub-001')

      expect(result).toEqual({
        hasCredits: false,
        creditsRemaining: 0,
        expiresAt: null,
        lastPaymentId: null,
        lastPaymentAt: null,
      })
    })

    it('returns default status when subscription not found', async () => {
      mockPrisma.businessSubscription.findUnique.mockResolvedValue(null)

      const result = await service.getAdvancePaymentStatus('sub-999')

      expect(result).toEqual({
        hasCredits: false,
        creditsRemaining: 0,
        expiresAt: null,
        lastPaymentId: null,
        lastPaymentAt: null,
      })
    })
  })

  // -------------------------------------------------------------------------
  // retryFailedSyncs()
  // -------------------------------------------------------------------------

  describe('retryFailedSyncs', () => {
    it('retries failed syncs and returns success count', async () => {
      const failedPayments = [
        createMockPayment({
          id: 'pay-001',
          syncStatus: 'FAILED',
          syncedProviderId: 'STRIPE',
          syncAttempts: 2,
        }),
        createMockPayment({
          id: 'pay-002',
          syncStatus: 'FAILED',
          syncedProviderId: 'STRIPE',
          syncAttempts: 5,
        }),
      ]

      mockPrisma.billingPayment.findMany.mockResolvedValue(
        failedPayments.map(p => ({
          ...p,
          subscription: {
            ...createMockSubscription(),
            business: createMockBusiness(),
          },
        })) as any
      )

      const mockSyncService = {
        retryFailedSync: vi
          .fn()
          .mockResolvedValueOnce({ success: true })
          .mockResolvedValueOnce({ success: false }),
      }
      mockCreateSyncService.mockReturnValue(mockSyncService as any)

      const result = await service.retryFailedSyncs()

      expect(result).toEqual({
        processed: 2,
        succeeded: 1,
        failed: 1,
      })
      expect(mockPrisma.billingPayment.findMany).toHaveBeenCalledWith({
        where: {
          syncStatus: 'FAILED',
          syncAttempts: { lt: 10 },
        },
        include: {
          subscription: {
            include: {
              business: true,
            },
          },
        },
        take: 50,
      })
    })

    it('skips payments without provider', async () => {
      const failedPayments = [
        createMockPayment({
          id: 'pay-001',
          syncStatus: 'FAILED',
          syncedProviderId: null, // No provider
          syncAttempts: 2,
        }),
      ]

      mockPrisma.billingPayment.findMany.mockResolvedValue(
        failedPayments.map(p => ({
          ...p,
          subscription: {
            ...createMockSubscription(),
            business: createMockBusiness(),
          },
        })) as any
      )

      const result = await service.retryFailedSyncs()

      expect(result).toEqual({
        processed: 1,
        succeeded: 0,
        failed: 0,
      })
    })

    it('handles empty result set', async () => {
      mockPrisma.billingPayment.findMany.mockResolvedValue([])

      const result = await service.retryFailedSyncs()

      expect(result).toEqual({
        processed: 0,
        succeeded: 0,
        failed: 0,
      })
    })
  })
})
