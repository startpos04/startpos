/**
 * stripe-handlers-advance.test.ts
 *
 * Unit tests for Stripe webhook handlers with advance payment integration
 *
 * Tests cover:
 * - handleInvoicePaid() with advance credit consumption
 * - handleInvoicePaymentFailed() with advance credit protection
 * - Edge cases (expired credits, zero credits, no credits)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { BusinessSubscription } from '@prisma/client'
import { SubscriptionStatus } from '@/lib/entitlement/entitlement-types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    businessSubscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscriptionStatusHistory: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/billing/advance-payment-service', () => ({
  advancePaymentService: {
    consumeAdvanceCredit: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Import mocked modules
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma-client'
import { advancePaymentService } from '@/lib/billing/advance-payment-service'
import { handleInvoicePaid, handleInvoicePaymentFailed } from '@/lib/billing/webhook-handlers/stripe-handlers'

const mockPrisma = vi.mocked(prisma)
const mockAdvancePaymentService = vi.mocked(advancePaymentService)

// ---------------------------------------------------------------------------
// Test Data Factory
// ---------------------------------------------------------------------------

function createMockSubscription(overrides?: Partial<BusinessSubscription>): BusinessSubscription {
  return {
    id: 'sub-001',
    businessId: 'biz-001',
    subscriptionPlanId: 'plan-001',
    status: SubscriptionStatus.ACTIVE,
    stripeSubscriptionId: 'sub_stripe_123',
    stripeCustomerId: 'cus_stripe_123',
    advancePaymentCredits: 0,
    advancePaymentExpiresAt: null,
    lastAdvancePaymentId: null,
    lastAdvancePaymentAt: null,
    currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
    gracePeriodEndsAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  } as BusinessSubscription
}

function createMockStripeInvoice(overrides?: any): any {
  return {
    id: 'in_test123',
    customer: 'cus_stripe_123',
    subscription: 'sub_stripe_123',
    amount_paid: 5000,
    currency: 'usd',
    status: 'paid',
    period_start: 1725148800, // 2026-09-01
    period_end: 1727740800, // 2026-10-01
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stripe Webhook Handlers - Advance Payment Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // -------------------------------------------------------------------------
  // handleInvoicePaid()
  // -------------------------------------------------------------------------

  describe('handleInvoicePaid', () => {
    it('consumes advance credit when subscription has active credits', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)
      mockAdvancePaymentService.consumeAdvanceCredit.mockResolvedValue(2) // 3 → 2

      const result = await handleInvoicePaid(invoice)

      expect(result.status).toBe('PROCESSED')
      expect(mockPrisma.businessSubscription.findUnique).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_stripe_123' },
        select: {
          id: true,
          businessId: true,
          advancePaymentCredits: true,
          advancePaymentExpiresAt: true,
        },
      })
      expect(mockAdvancePaymentService.consumeAdvanceCredit).toHaveBeenCalledWith('sub-001')
    })

    it('does NOT consume credit when subscription has zero credits', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      const result = await handleInvoicePaid(invoice)

      expect(result.status).toBe('PROCESSED')
      expect(mockAdvancePaymentService.consumeAdvanceCredit).not.toHaveBeenCalled()
    })

    it('does NOT consume credit when credits are expired', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 2,
        advancePaymentExpiresAt: new Date('2026-08-01T00:00:00Z'), // Past
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      // Mock current date to be after expiry
      vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))

      const result = await handleInvoicePaid(invoice)

      expect(result.status).toBe('PROCESSED')
      // Should NOT consume because credits expired
      expect(mockAdvancePaymentService.consumeAdvanceCredit).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('continues processing even if credit consumption fails', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)
      mockAdvancePaymentService.consumeAdvanceCredit.mockRejectedValue(
        new Error('Database error')
      )

      const result = await handleInvoicePaid(invoice)

      // Should still process the payment
      expect(result.status).toBe('PROCESSED')
    })

    it('handles subscription not found', async () => {
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(null)

      const result = await handleInvoicePaid(invoice)

      expect(result.status).toBe('SKIPPED')
      expect(result.message).toContain('Subscription not found')
      expect(mockAdvancePaymentService.consumeAdvanceCredit).not.toHaveBeenCalled()
    })

    it('consumes last credit successfully', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 1, // Last credit
        advancePaymentExpiresAt: new Date('2026-10-01T00:00:00Z'),
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)
      mockAdvancePaymentService.consumeAdvanceCredit.mockResolvedValue(0) // 1 → 0

      const result = await handleInvoicePaid(invoice)

      expect(result.status).toBe('PROCESSED')
      expect(mockAdvancePaymentService.consumeAdvanceCredit).toHaveBeenCalledWith('sub-001')
    })
  })

  // -------------------------------------------------------------------------
  // handleInvoicePaymentFailed()
  // -------------------------------------------------------------------------

  describe('handleInvoicePaymentFailed', () => {
    it('SKIPS grace period transition when advance credits are active', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.ACTIVE,
        advancePaymentCredits: 3,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const invoice = createMockStripeInvoice({ status: 'open', attempt_count: 1 })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      const result = await handleInvoicePaymentFailed(invoice)

      expect(result.status).toBe('SKIPPED')
      expect(result.message).toContain('covered by advance payment')
      // Should NOT update subscription status
      expect(mockPrisma.businessSubscription.update).not.toHaveBeenCalled()
    })

    it('transitions to GRACE_PERIOD when no advance credits', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.ACTIVE,
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
      })
      const invoice = createMockStripeInvoice({ status: 'open', attempt_count: 1 })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)
      mockPrisma.businessSubscription.update.mockResolvedValue(subscription as any)

      const result = await handleInvoicePaymentFailed(invoice)

      expect(result.status).toBe('PROCESSED')
      expect(mockPrisma.businessSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-001' },
        data: expect.objectContaining({
          status: SubscriptionStatus.GRACE_PERIOD,
          gracePeriodEndsAt: expect.any(Date),
        }),
      })
    })

    it('transitions to GRACE_PERIOD when advance credits expired', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.ACTIVE,
        advancePaymentCredits: 2,
        advancePaymentExpiresAt: new Date('2026-08-01T00:00:00Z'), // Past
      })
      const invoice = createMockStripeInvoice({ status: 'open', attempt_count: 1 })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)
      mockPrisma.businessSubscription.update.mockResolvedValue(subscription as any)

      vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))

      const result = await handleInvoicePaymentFailed(invoice)

      expect(result.status).toBe('PROCESSED')
      expect(mockPrisma.businessSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-001' },
        data: expect.objectContaining({
          status: SubscriptionStatus.GRACE_PERIOD,
        }),
      })

      vi.useRealTimers()
    })

    it('SKIPS when credits are about to expire but still valid', async () => {
      // Credits expire tomorrow, should still protect
      const subscription = createMockSubscription({
        status: SubscriptionStatus.ACTIVE,
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: new Date('2026-09-02T00:00:00Z'),
      })
      const invoice = createMockStripeInvoice({ status: 'open', attempt_count: 1 })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))

      const result = await handleInvoicePaymentFailed(invoice)

      expect(result.status).toBe('SKIPPED')
      expect(result.message).toContain('covered by advance payment')

      vi.useRealTimers()
    })

    it('handles subscription not found', async () => {
      const invoice = createMockStripeInvoice({ status: 'open', attempt_count: 1 })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(null)

      const result = await handleInvoicePaymentFailed(invoice)

      expect(result.status).toBe('SKIPPED')
      expect(result.message).toContain('Subscription not found')
    })

    it('skips when already in grace period', async () => {
      const subscription = createMockSubscription({
        status: SubscriptionStatus.GRACE_PERIOD,
        advancePaymentCredits: 0,
        advancePaymentExpiresAt: null,
      })
      const invoice = createMockStripeInvoice({ status: 'open', attempt_count: 1 })

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      const result = await handleInvoicePaymentFailed(invoice)

      expect(result.status).toBe('SKIPPED')
      expect(result.message).toContain('already in grace period')
    })
  })

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('handles credits expiring at exact moment of webhook', async () => {
      const expiryDate = new Date('2026-09-01T12:00:00Z')
      const subscription = createMockSubscription({
        advancePaymentCredits: 1,
        advancePaymentExpiresAt: expiryDate,
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      // Set system time to exact expiry
      vi.setSystemTime(expiryDate)

      const result = await handleInvoicePaid(invoice)

      // Credits expired exactly at webhook time, should NOT consume
      expect(mockAdvancePaymentService.consumeAdvanceCredit).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('handles negative advance credits gracefully', async () => {
      // Defensive: should never happen, but test anyway
      const subscription = createMockSubscription({
        advancePaymentCredits: -1,
        advancePaymentExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)

      const result = await handleInvoicePaid(invoice)

      expect(result.status).toBe('PROCESSED')
      expect(mockAdvancePaymentService.consumeAdvanceCredit).not.toHaveBeenCalled()
    })

    it('handles very large credit count', async () => {
      const subscription = createMockSubscription({
        advancePaymentCredits: 12, // Maximum allowed
        advancePaymentExpiresAt: new Date('2027-09-01T00:00:00Z'),
      })
      const invoice = createMockStripeInvoice()

      mockPrisma.businessSubscription.findUnique.mockResolvedValue(subscription)
      mockAdvancePaymentService.consumeAdvanceCredit.mockResolvedValue(11)

      const result = await handleInvoicePaid(invoice)

      expect(result.status).toBe('PROCESSED')
      expect(mockAdvancePaymentService.consumeAdvanceCredit).toHaveBeenCalledWith('sub-001')
    })
  })
})
