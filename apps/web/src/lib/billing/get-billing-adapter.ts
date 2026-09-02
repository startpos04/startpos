/**
 * getBillingAdapter
 *
 * Central function to get the appropriate billing provider adapter for a business.
 * This replaces direct calls to createStripeAdapter() throughout the codebase.
 *
 * Follows the architecture specification:
 * 1. Business.preferredPaymentProvider (if set and enabled)
 * 2. Most recent payment provider (from BillingPayment records)
 * 3. Platform default (Stripe)
 */

import type { BillingProviderAdapter } from './billing-provider'
import { paymentProviderService } from './payment-provider-service'

/**
 * Get billing adapter for a business
 *
 * @param businessId - Business identifier
 * @returns Promise<BillingProviderAdapter>
 * @throws Error if no provider is available
 */
export async function getBillingAdapter(businessId: string): Promise<BillingProviderAdapter> {
  const adapter = await paymentProviderService.getProviderForBusiness(businessId)

  if (!adapter) {
    throw new Error(`No enabled payment provider found for business ${businessId}`)
  }

  return adapter
}

/**
 * Get billing adapter by provider ID
 * Useful when you know which specific provider you need
 *
 * @param providerId - Provider identifier
 * @returns BillingProviderAdapter
 * @throws Error if provider is not found or not enabled
 */
export function getBillingAdapterByProvider(providerId: string): BillingProviderAdapter {
  const adapter = paymentProviderRegistry.getAdapter(providerId as any)

  if (!adapter) {
    throw new Error(`Provider ${providerId} is not available or not enabled`)
  }

  return adapter
}

/**
 * Legacy compatibility function
 *
 * @deprecated Use getBillingAdapter(businessId) instead
 * @returns Stripe adapter
 */
export function createStripeAdapter(): BillingProviderAdapter {
  return getBillingAdapterByProvider('stripe')
}

// Re-export for backwards compatibility during transition
import { paymentProviderRegistry } from './payment-provider-registry'

export { paymentProviderRegistry }
