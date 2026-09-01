/**
 * advance-payment-service.ts
 * 
 * High-level service for managing advance payments across all providers.
 * Handles provider detection, sync coordination, and business logic.
 */

import type { BillingPayment, BusinessSubscription } from '@prisma/client'
import { prisma } from '@startpos-core/lib/prisma-client'
import { createAdvancePaymentSyncService } from './advance-payment-sync-service'
import { createStripeAdapter } from './adapters/stripe-adapter'

// ---------------------------------------------------------------------------
// AdvancePaymentService
// ---------------------------------------------------------------------------

export class AdvancePaymentService {
  
  /**
   * Determine if sync is needed for a business
   * 
   * Returns true if:
   * - Business has a preferred payment provider (not manual)
   * - OR business has recent automated payments
   */
  async shouldSyncToProvider(businessId: string): Promise<boolean> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { preferredPaymentProvider: true },
    })

    // No sync if no provider or provider is MANUAL
    if (!business?.preferredPaymentProvider || business.preferredPaymentProvider === 'MANUAL') {
      return false
    }

    // Sync needed for automated providers
    return true
  }

  /**
   * Get the provider to sync to
   */
  async getProviderToSync(businessId: string): Promise<'STRIPE' | 'PAYMONGO' | null> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { preferredPaymentProvider: true },
    })

    const provider = business?.preferredPaymentProvider

    switch (provider) {
      case 'STRIPE':
        return 'STRIPE'
      case 'PAYMONGO':
        return 'PAYMONGO'
      default:
        return null
    }
  }

  /**
   * Apply advance payment and sync if needed
   * 
   * Main entry point for processing approved advance payments
   */
  async applyAdvancePayment(payment: BillingPayment): Promise<{
    success: boolean
    subscription: BusinessSubscription
    syncRequired: boolean
    syncResult?: any
    error?: string
  }> {
    try {
      // Step 1: Check if sync is needed
      const shouldSync = await this.shouldSyncToProvider(payment.businessId)
      const provider = shouldSync ? await this.getProviderToSync(payment.businessId) : null

      // Step 2: Apply credits to subscription
      const syncService = createAdvancePaymentSyncService(provider)
      
      if (!payment.subscriptionId) {
        throw new Error('Payment has no associated subscription')
      }

      const { subscription } = await syncService.applyAdvanceCredits(
        payment.subscriptionId,
        payment
      )

      // Step 3: Sync to provider if needed
      let syncResult = null
      if (shouldSync && provider) {
        // Update payment sync status to PENDING
        await prisma.billingPayment.update({
          where: { id: payment.id },
          data: { 
            syncStatus: 'PENDING',
            syncedProviderId: provider,
          },
        })

        // Create provider-specific sync service
        const stripeClient = provider === 'STRIPE' ? createStripeAdapter() : undefined
        const providerSyncService = createAdvancePaymentSyncService(provider, stripeClient)
        
        syncResult = await providerSyncService.syncAdvancePayment(payment)
        
        if (!syncResult.success) {
          console.error('[AdvancePaymentService] Sync failed:', syncResult.error)
          // Note: We don't fail the entire operation if sync fails
          // The payment is still applied, and sync can be retried
        }
      } else {
        // No sync needed - update payment status
        await prisma.billingPayment.update({
          where: { id: payment.id },
          data: { syncStatus: 'NOT_REQUIRED' },
        })
      }

      return {
        success: true,
        subscription,
        syncRequired: shouldSync,
        syncResult,
      }

    } catch (error) {
      console.error('[AdvancePaymentService] Error applying advance payment:', error)
      return {
        success: false,
        subscription: {} as BusinessSubscription, // Type placeholder
        syncRequired: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Check if a billing period should be skipped due to advance credits
   * 
   * Called by webhook handlers and billing jobs
   */
  async shouldSkipBillingPeriod(
    subscriptionId: string,
    periodStart: Date
  ): Promise<boolean> {
    const subscription = await prisma.businessSubscription.findUnique({
      where: { id: subscriptionId },
    })

    if (!subscription) {
      return false
    }

    const syncService = createAdvancePaymentSyncService(null)
    return await syncService.shouldSkipCharge(subscription, periodStart)
  }

  /**
   * Consume advance credit for current billing cycle
   * 
   * Called after successful billing period completion
   */
  async consumeAdvanceCredit(subscriptionId: string): Promise<number> {
    const syncService = createAdvancePaymentSyncService(null)
    return await syncService.consumeAdvanceCredit(subscriptionId)
  }

  /**
   * Get advance payment status for a subscription
   */
  async getAdvancePaymentStatus(subscriptionId: string): Promise<{
    hasCredits: boolean
    creditsRemaining: number
    expiresAt: Date | null
    lastPaymentId: string | null
    lastPaymentAt: Date | null
  }> {
    const subscription = await prisma.businessSubscription.findUnique({
      where: { id: subscriptionId },
      select: {
        advancePaymentCredits: true,
        advancePaymentExpiresAt: true,
        lastAdvancePaymentId: true,
        lastAdvancePaymentAt: true,
      },
    })

    if (!subscription) {
      return {
        hasCredits: false,
        creditsRemaining: 0,
        expiresAt: null,
        lastPaymentId: null,
        lastPaymentAt: null,
      }
    }

    return {
      hasCredits: subscription.advancePaymentCredits > 0,
      creditsRemaining: subscription.advancePaymentCredits,
      expiresAt: subscription.advancePaymentExpiresAt,
      lastPaymentId: subscription.lastAdvancePaymentId,
      lastPaymentAt: subscription.lastAdvancePaymentAt,
    }
  }

  /**
   * Retry all failed syncs
   * 
   * Background job calls this to retry payments with FAILED sync status
   */
  async retryFailedSyncs(): Promise<{
    processed: number
    succeeded: number
    failed: number
  }> {
    // Get all payments with FAILED sync status
    const failedPayments = await prisma.billingPayment.findMany({
      where: {
        syncStatus: 'FAILED',
        // Only retry if not exceeded max attempts (10)
        syncAttempts: { lt: 10 },
      },
      include: {
        subscription: {
          include: {
            business: true,
          },
        },
      },
      take: 50, // Process in batches
    })

    let succeeded = 0
    let failed = 0

    for (const payment of failedPayments) {
      const provider = payment.syncedProviderId as 'STRIPE' | 'PAYMONGO' | null
      
      if (!provider) {
        continue
      }

      const stripeClient = provider === 'STRIPE' ? createStripeAdapter() : undefined
      const syncService = createAdvancePaymentSyncService(provider, stripeClient)
      
      const result = await syncService.retryFailedSync(payment.id)
      
      if (result.success) {
        succeeded++
      } else {
        failed++
      }
    }

    return {
      processed: failedPayments.length,
      succeeded,
      failed,
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

export const advancePaymentService = new AdvancePaymentService()
