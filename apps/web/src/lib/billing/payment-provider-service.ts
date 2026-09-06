/**
 * PaymentProviderService
 *
 * Business-level service for payment provider selection and management.
 * Handles provider resolution logic for businesses and provides convenient
 * methods for determining which provider to use for billing operations.
 *
 * Resolution order:
 * 1. Business.preferredPaymentProvider (if set and enabled)
 * 2. Most recent payment provider (from BillingPayment records)
 * 3. Platform default (Stripe)
 */

import { prisma } from '@platform/lib/prisma-client'
import { type BillingProviderAdapter, type PaymentProviderConfig, type PaymentProviderId, paymentProviderRegistry } from './payment-provider-registry'

export class PaymentProviderService {
  /**
   * Get provider adapter for a business
   *
   * @param businessId - Business identifier
   * @returns Promise<BillingProviderAdapter | null>
   */
  async getProviderForBusiness(businessId: string): Promise<BillingProviderAdapter | null> {
    // 1. Check business preferred provider
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { preferredPaymentProvider: true },
    })

    if (business?.preferredPaymentProvider) {
      const adapter = paymentProviderRegistry.getAdapter(business.preferredPaymentProvider)
      if (adapter) {
        return adapter
      }
    }

    // 2. Check most recent payment provider
    const recentPayment = await prisma.billingPayment.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      select: { provider: true },
    })

    if (recentPayment?.provider) {
      const adapter = paymentProviderRegistry.getAdapter(recentPayment.provider as PaymentProviderId)
      if (adapter) {
        return adapter
      }
    }

    // 3. Platform default (Stripe)
    return paymentProviderRegistry.getAdapter('stripe')
  }

  /**
   * Get available providers for a business
   * Filters by business country and enabled status
   *
   * @param businessId - Business identifier
   * @returns Promise<PaymentProviderConfig[]>
   */
  async getAvailableProviders(businessId: string): Promise<PaymentProviderConfig[]> {
    // Get business country for filtering
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { countryCode: true },
    })

    const country = business?.countryCode || 'PH' // Default to Philippines
    return paymentProviderRegistry.getEnabledProviders(country)
  }

  /**
   * Set preferred provider for a business
   *
   * @param businessId - Business identifier
   * @param providerId - Provider identifier
   * @returns Promise<void>
   */
  async setPreferredProvider(businessId: string, providerId: PaymentProviderId): Promise<void> {
    // Verify provider is enabled
    if (!paymentProviderRegistry.isProviderEnabled(providerId)) {
      throw new Error(`Provider ${providerId} is not enabled`)
    }

    await prisma.business.update({
      where: { id: businessId },
      data: { preferredPaymentProvider: providerId },
    })
  }

  /**
   * Get preferred provider ID for a business
   *
   * @param businessId - Business identifier
   * @returns Promise<PaymentProviderId | null>
   */
  async getPreferredProvider(businessId: string): Promise<PaymentProviderId | null> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { preferredPaymentProvider: true },
    })

    return (business?.preferredPaymentProvider as PaymentProviderId) || null
  }

  /**
   * Check if provider supports automatic renewal for a business
   *
   * @param businessId - Business identifier
   * @returns Promise<boolean>
   */
  async supportsAutoRenewal(businessId: string): Promise<boolean> {
    const adapter = await this.getProviderForBusiness(businessId)
    if (!adapter) return false

    const capabilities = adapter.getCapabilities()
    return capabilities.supportsRecurring
  }

  /**
   * Check if provider requires manual approval for a business
   *
   * @param businessId - Business identifier
   * @returns Promise<boolean>
   */
  async requiresManualApproval(businessId: string): Promise<boolean> {
    const adapter = await this.getProviderForBusiness(businessId)
    if (!adapter) return false

    const capabilities = adapter.getCapabilities()
    return capabilities.supportsManualReview
  }

  /**
   * Get provider display name for a business
   *
   * @param businessId - Business identifier
   * @returns Promise<string>
   */
  async getProviderDisplayName(businessId: string): Promise<string> {
    const adapter = await this.getProviderForBusiness(businessId)
    if (!adapter) return 'Unknown'

    return adapter.getProviderName()
  }

  /**
   * Determine subscription flow for a business
   * Core routing logic - decides where to send user when they click "Subscribe"
   *
   * @param businessId - Business identifier
   * @param planId - Plan they're subscribing to
   * @returns Promise<SubscriptionFlow>
   */
  async getSubscriptionFlow(
    businessId: string,
    planId: string,
  ): Promise<{
    type: 'stripe-checkout' | 'manual-payment' | 'select-method'
    redirectUrl?: string
  }> {
    const preferredProvider = await this.getPreferredProvider(businessId)

    // No payment method set - user must choose first
    if (!preferredProvider) {
      return {
        type: 'select-method',
        redirectUrl: `/billing/payment-method-setup?planId=${planId}`,
      }
    }

    // Stripe - use existing checkout flow
    if (preferredProvider === 'stripe') {
      return { type: 'stripe-checkout' }
    }

    // Manual payment method - get config for setup route
    const config = paymentProviderRegistry.getConfig(preferredProvider)
    if (config?.config.setupRoute) {
      return {
        type: 'manual-payment',
        redirectUrl: `${config.config.setupRoute}?planId=${planId}`,
      }
    }

    // Fallback - shouldn't happen, but handle gracefully
    return {
      type: 'select-method',
      redirectUrl: `/billing/payment-method-setup?planId=${planId}`,
    }
  }

  /**
   * Get setup route for a provider
   *
   * @param providerId - Provider identifier
   * @param planId - Optional plan ID to include in query params
   * @returns Setup route path
   */
  getSetupRoute(providerId: PaymentProviderId, planId?: string): string {
    const config = paymentProviderRegistry.getConfig(providerId)
    const baseRoute = (config?.config.setupRoute as string) || '/billing/plans'

    return planId ? `${baseRoute}?planId=${planId}` : baseRoute
  }
}

// Export singleton instance
export const paymentProviderService = new PaymentProviderService()
