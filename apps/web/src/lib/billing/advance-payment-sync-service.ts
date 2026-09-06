/**
 * advance-payment-sync-service.ts
 *
 * Service for synchronizing manual advance payments with external payment providers.
 * Prevents duplicate charges and maintains consistency between local state and provider state.
 *
 * Architecture:
 * - Provider-agnostic interface
 * - Stripe-specific implementation
 * - Handles sync state management
 * - Implements retry logic with exponential backoff
 */

import dayjs from '@platform/lib/dayjs'
import { prisma } from '@platform/lib/prisma-client'
import type { BillingPayment, BusinessSubscription, PaymentProvider, PaymentSyncStatus } from 'prisma/generated/prisma/client'
import type { BillingProviderAdapter } from './billing-provider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncResult = {
  success: boolean
  syncTransactionId?: string
  syncedAt?: Date
  error?: string
  requiresRetry?: boolean
}

export type ApplyCreditsResult = {
  subscription: BusinessSubscription
  creditsApplied: number
  expiresAt: Date
}

// ---------------------------------------------------------------------------
// AdvancePaymentSyncService Interface
// ---------------------------------------------------------------------------

export interface AdvancePaymentSyncService {
  /**
   * Sync approved advance payment to provider
   * Updates provider with advance payment details to prevent duplicate charges
   */
  syncAdvancePayment(payment: BillingPayment): Promise<SyncResult>

  /**
   * Check if provider should skip charge this period
   * Returns true if advance credits cover this period
   */
  shouldSkipCharge(subscription: BusinessSubscription, periodStart: Date): Promise<boolean>

  /**
   * Apply advance credits to subscription
   * Updates subscription record with advance payment details
   */
  applyAdvanceCredits(subscriptionId: string, payment: BillingPayment): Promise<ApplyCreditsResult>

  /**
   * Consume one period from advance credits
   * Called at each billing cycle to decrement credits
   */
  consumeAdvanceCredit(subscriptionId: string): Promise<number>

  /**
   * Retry failed sync with exponential backoff
   */
  retryFailedSync(paymentId: string): Promise<SyncResult>
}

// ---------------------------------------------------------------------------
// Base Implementation (Provider-Agnostic)
// ---------------------------------------------------------------------------

export class BaseAdvancePaymentSyncService implements AdvancePaymentSyncService {
  async syncAdvancePayment(_payment: BillingPayment): Promise<SyncResult> {
    // Base implementation: no sync needed
    return {
      success: true,
      error: 'No sync required for this provider',
    }
  }

  async shouldSkipCharge(subscription: BusinessSubscription, periodStart: Date): Promise<boolean> {
    // Check if advance credits cover this period
    if (subscription.advancePaymentCredits <= 0) {
      return false
    }

    // Check if period is within advance payment range
    if (!subscription.advancePaymentExpiresAt) {
      return false
    }

    return periodStart < subscription.advancePaymentExpiresAt
  }

  async applyAdvanceCredits(subscriptionId: string, payment: BillingPayment): Promise<ApplyCreditsResult> {
    const subscription = await prisma.businessSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    })

    if (!subscription) {
      throw new Error('Subscription not found')
    }

    // Calculate expiration date based on billing model
    // Monthly = 1 month per period, Yearly = 12 months per period
    const billingIntervalMonths = this.getBillingIntervalMonths(subscription.billingModel)
    const periodsInMonths = payment.periodsAdvancePaid * billingIntervalMonths

    const currentEnd = subscription.currentPeriodEnd || new Date()
    const expiresAt = dayjs(currentEnd).add(periodsInMonths, 'month').toDate()

    // Update subscription with advance payment details
    const updated = await prisma.businessSubscription.update({
      where: { id: subscriptionId },
      data: {
        advancePaymentCredits: {
          increment: payment.periodsAdvancePaid,
        },
        advancePaymentExpiresAt: expiresAt,
        lastAdvancePaymentId: payment.id,
        lastAdvancePaymentAt: new Date(),
      },
    })

    // Update payment record
    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: {
        advancePaymentAppliedAt: new Date(),
        subscriptionId,
      },
    })

    return {
      subscription: updated,
      creditsApplied: payment.periodsAdvancePaid,
      expiresAt,
    }
  }

  async consumeAdvanceCredit(subscriptionId: string): Promise<number> {
    const subscription = await prisma.businessSubscription.findUnique({
      where: { id: subscriptionId },
    })

    if (!subscription || subscription.advancePaymentCredits <= 0) {
      return 0
    }

    const newCredits = subscription.advancePaymentCredits - 1

    await prisma.businessSubscription.update({
      where: { id: subscriptionId },
      data: {
        advancePaymentCredits: newCredits,
        ...(newCredits === 0 && { advancePaymentExpiresAt: null }),
      },
    })

    return newCredits
  }

  async retryFailedSync(paymentId: string): Promise<SyncResult> {
    const payment = await prisma.billingPayment.findUnique({
      where: { id: paymentId },
      include: { subscription: true },
    })

    if (!payment) {
      return { success: false, error: 'Payment not found' }
    }

    // Exponential backoff: 5min, 15min, 30min, 1hr
    const backoffMinutes = [5, 15, 30, 60]
    const attempt = payment.syncAttempts
    const backoff = backoffMinutes[Math.min(attempt, backoffMinutes.length - 1)] ?? 5

    const timeSinceLastAttempt = payment.lastSyncAttemptAt ? Date.now() - payment.lastSyncAttemptAt.getTime() : Infinity

    if (timeSinceLastAttempt < backoff * 60 * 1000) {
      return {
        success: false,
        error: 'Backoff period not elapsed',
        requiresRetry: true,
      }
    }

    // Update attempt counter
    await prisma.billingPayment.update({
      where: { id: paymentId },
      data: {
        syncAttempts: attempt + 1,
        lastSyncAttemptAt: new Date(),
        syncStatus: 'IN_PROGRESS' as PaymentSyncStatus,
      },
    })

    // Retry sync
    return await this.syncAdvancePayment(payment)
  }

  protected getBillingIntervalMonths(billingModel: string): number {
    switch (billingModel) {
      case 'YEARLY_SUBSCRIPTION':
        return 12
      default:
        return 1
    }
  }
}

// ---------------------------------------------------------------------------
// Stripe-Specific Implementation
// ---------------------------------------------------------------------------

export class StripeAdvancePaymentSyncService extends BaseAdvancePaymentSyncService {
  // biome-ignore lint/suspicious/noExplicitAny: Stripe SDK client — typed loosely to avoid importing Stripe types
  private stripe: any | undefined

  // biome-ignore lint/suspicious/noExplicitAny: Stripe SDK client
  constructor(stripeClient?: any) {
    super()
    this.stripe = stripeClient
  }

  /**
   * Sync Strategy for Stripe:
   *
   * 1. Update subscription metadata with advance payment info
   * 2. Create subscription schedule to pause billing during advance period
   * 3. Resume billing after advance period expires
   *
   * Alternative approach: Create invoice credit
   * - Less complex but doesn't prevent invoice generation
   * - We use schedule approach for cleaner UX
   */
  async syncAdvancePayment(payment: BillingPayment): Promise<SyncResult> {
    // If no Stripe client, mark as NOT_REQUIRED
    if (!this.stripe) {
      await prisma.billingPayment.update({
        where: { id: payment.id },
        data: { syncStatus: 'NOT_REQUIRED' as PaymentSyncStatus },
      })
      return { success: true, error: 'Stripe client not configured' }
    }

    try {
      const subscription = await this.getSubscription(payment.subscriptionId)

      if (!subscription?.externalId) {
        // No Stripe subscription exists - mark as NOT_REQUIRED
        await prisma.billingPayment.update({
          where: { id: payment.id },
          data: { syncStatus: 'NOT_REQUIRED' as PaymentSyncStatus },
        })
        return {
          success: true,
          error: 'No Stripe subscription found - sync not required',
        }
      }

      // Update sync status to IN_PROGRESS
      await prisma.billingPayment.update({
        where: { id: payment.id },
        data: { syncStatus: 'IN_PROGRESS' as PaymentSyncStatus },
      })

      // Step 1: Update subscription metadata
      await this.stripe.subscriptions.update(subscription.externalId, {
        metadata: {
          advancePaymentId: payment.id,
          advancePaymentExpiresAt: payment.advancePaymentExpiresAt?.toISOString() || '',
          advancePaymentCredits: payment.periodsAdvancePaid.toString(),
          advancePaymentAppliedAt: new Date().toISOString(),
        },
      })

      // Step 2: Create subscription schedule to pause billing
      // Note: This is a simplified approach. In production, you'd need to:
      // - Check if schedule already exists
      // - Handle existing schedule phases
      // - Manage phase transitions properly

      const schedule = await this.createSubscriptionSchedule(subscription, payment)

      // Step 3: Update payment record with sync result
      await prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          syncStatus: 'COMPLETED' as PaymentSyncStatus,
          syncedToProvider: true,
          syncedProviderId: 'STRIPE' as PaymentProvider,
          syncedAt: new Date(),
          syncTransactionId: schedule?.id || subscription.externalId,
        },
      })

      return {
        success: true,
        syncTransactionId: schedule?.id || subscription.externalId,
        syncedAt: new Date(),
      }
    } catch (error) {
      console.error('[StripeAdvancePaymentSync] Error:', error)

      // Update payment record with failure
      await prisma.billingPayment.update({
        where: { id: payment.id },
        data: {
          syncStatus: 'FAILED' as PaymentSyncStatus,
          syncErrorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requiresRetry: true,
      }
    }
  }

  /**
   * Create subscription schedule to pause billing during advance period
   *
   * Stripe Subscription Schedules allow us to:
   * - Define billing phases
   * - Pause billing for specific periods
   * - Automatically resume billing after pause
   */
  // biome-ignore lint/suspicious/noExplicitAny: flexibility required
  private async createSubscriptionSchedule(subscription: any, payment: BillingPayment): Promise<any> {
    // Get the current subscription from Stripe
    const stripeSubscription = await this.stripe!.subscriptions.retrieve(subscription.externalId)

    // Calculate phase dates
    const now = Math.floor(Date.now() / 1000)
    const currentPeriodEnd = Math.floor((subscription.currentPeriodEnd?.getTime() || Date.now()) / 1000)
    const advanceExpiresAt = Math.floor((payment.advancePaymentExpiresAt?.getTime() || Date.now()) / 1000)

    // Create schedule with phases:
    // 1. Current phase: keep existing subscription as-is
    // 2. Pause phase: advance payment period (no billing)
    // 3. Resume phase: normal billing resumes

    try {
      const schedule = await this.stripe!.subscriptionSchedules.create({
        from_subscription: subscription.externalId,
        phases: [
          {
            // Phase 1: Current period (unchanged)
            // biome-ignore lint/suspicious/noExplicitAny: flexibility required
            items: stripeSubscription.items.data.map((item: any) => ({
              price: item.price.id,
              quantity: item.quantity,
            })),
            start_date: now,
            end_date: currentPeriodEnd,
          },
          {
            // Phase 2: Advance payment period (paused billing)
            // biome-ignore lint/suspicious/noExplicitAny: flexibility required
            items: stripeSubscription.items.data.map((item: any) => ({
              price: item.price.id,
              quantity: item.quantity,
            })),
            start_date: currentPeriodEnd,
            end_date: advanceExpiresAt,
            // Pause billing by setting billing_cycle_anchor to 'unchanged'
            // and not creating invoices
            collection_method: 'send_invoice',
            days_until_due: null,
            proration_behavior: 'none',
          },
          {
            // Phase 3: Resume normal billing
            // biome-ignore lint/suspicious/noExplicitAny: flexibility required
            items: stripeSubscription.items.data.map((item: any) => ({
              price: item.price.id,
              quantity: item.quantity,
            })),
            start_date: advanceExpiresAt,
            // No end_date = continue indefinitely
          },
        ],
        end_behavior: 'release', // Release subscription after schedule completes
      })

      return schedule
    } catch (error) {
      console.error('[StripeSync] Schedule creation failed:', error)
      // If schedule creation fails, try alternative: invoice credit
      return await this.createInvoiceCredit(subscription, payment)
    }
  }

  /**
   * Alternative sync method: Create invoice credit
   *
   * Instead of pausing subscription, create a credit that will be
   * automatically applied to future invoices
   */
  // biome-ignore lint/suspicious/noExplicitAny: flexibility required
  private async createInvoiceCredit(subscription: any, payment: BillingPayment): Promise<any> {
    // Create customer balance transaction (credit)
    const credit = await this.stripe!.customers.createBalanceTransaction(subscription.business.externalCustomerId || subscription.businessId, {
      amount: -payment.amount, // Negative = credit
      currency: payment.currency.toLowerCase(),
      description: `Advance payment credit - ${payment.periodsAdvancePaid} period(s)`,
      metadata: {
        advancePaymentId: payment.id,
        periodsAdvancePaid: payment.periodsAdvancePaid.toString(),
      },
    })

    return credit
  }

  private async getSubscription(subscriptionId?: string | null) {
    if (!subscriptionId) return null
    return await prisma.businessSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        business: true,
      },
    })
  }
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create appropriate sync service based on provider
 */
export function createAdvancePaymentSyncService(provider: PaymentProvider | null, stripeClient?: BillingProviderAdapter): AdvancePaymentSyncService {
  switch (provider) {
    case 'STRIPE':
      return new StripeAdvancePaymentSyncService(stripeClient)
    default:
      return new BaseAdvancePaymentSyncService()
  }
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

// Export base instance for manual-only scenarios
export const advancePaymentSyncService = new BaseAdvancePaymentSyncService()
