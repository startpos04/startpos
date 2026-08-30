/**
 * PaymentProviderRegistry
 * 
 * Central registry for payment provider adapters and configurations.
 * Follows the pure utility pattern like other engines in the codebase.
 * 
 * Design principles:
 * - Provider isolation: Each adapter is isolated; bugs in one don't affect others
 * - Configuration-driven: Easy to enable/disable providers via config
 * - Extensible: Add new providers without modifying existing code
 * - Type-safe: Full TypeScript support with proper types
 */

import type { BillingProviderAdapter } from './billing-provider'

// Re-export types for convenience
export type { BillingProviderAdapter }

export type PaymentProviderId = 'stripe' | 'manual' | 'paymongo' | 'xendit' | 'bank_transfer'

export type ProviderCapabilities = {
  supportsAutomaticConfirmation: boolean   // Stripe: true, Manual: false
  supportsManualReview: boolean            // Stripe: false, Manual: true  
  supportsWebhook: boolean                 // Stripe: true, Manual: false
  supportsRefund: boolean                  // Stripe: true, Manual: manual
  supportsRecurring: boolean               // Stripe: true, Manual: false
  supportsCustomerPortal: boolean          // Stripe: true, Manual: false
}

export type PaymentProviderConfig = {
  providerId: PaymentProviderId
  displayName: string
  isEnabled: boolean
  availableInCountries?: string[]  // ISO codes, undefined = everywhere
  
  // Configuration
  requiresApproval: boolean
  gracePeriodDays?: number
  
  // UI Configuration
  description?: string
  badges?: string[]
  displayOrder: number
  
  // Provider-specific config (extensible)
  config: Record<string, unknown>
}

/**
 * PaymentProviderRegistry
 * 
 * Manages registration and resolution of payment provider adapters.
 * This is the single source of truth for which providers are available.
 */
export class PaymentProviderRegistry {
  private providers: Map<PaymentProviderId, BillingProviderAdapter> = new Map()
  private configs: Map<PaymentProviderId, PaymentProviderConfig> = new Map()

  /**
   * Register a payment provider adapter
   * 
   * @param providerId - Provider identifier
   * @param adapter - Provider adapter implementation
   * @param config - Provider configuration
   */
  register(providerId: PaymentProviderId, adapter: BillingProviderAdapter, config: PaymentProviderConfig): void {
    this.providers.set(providerId, adapter)
    this.configs.set(providerId, config)
  }

  /**
   * Get adapter by provider ID
   * 
   * @param providerId - Provider identifier
   * @returns Provider adapter or null if not found/enabled
   */
  getAdapter(providerId: PaymentProviderId): BillingProviderAdapter | null {
    const config = this.configs.get(providerId)
    if (!config?.isEnabled) {
      return null
    }
    
    return this.providers.get(providerId) || null
  }

  /**
   * Get all enabled providers
   * 
   * @param country - Optional ISO country code for filtering
   * @returns Array of enabled provider configurations
   */
  getEnabledProviders(country?: string): PaymentProviderConfig[] {
    const enabledProviders = Array.from(this.configs.values())
      .filter(config => {
        // Filter disabled providers
        if (!config.isEnabled) return false
        
        // Filter by country availability
        if (config.availableInCountries && country) {
          return config.availableInCountries.includes(country)
        }
        
        return true
      })
      .sort((a, b) => a.displayOrder - b.displayOrder)

    return enabledProviders
  }

  /**
   * Get provider configuration
   * 
   * @param providerId - Provider identifier
   * @returns Provider configuration or null if not found
   */
  getConfig(providerId: PaymentProviderId): PaymentProviderConfig | null {
    return this.configs.get(providerId) || null
  }

  /**
   * Check if provider is enabled
   * 
   * @param providerId - Provider identifier
   * @returns true if provider is enabled
   */
  isProviderEnabled(providerId: PaymentProviderId): boolean {
    const config = this.configs.get(providerId)
    return config?.isEnabled ?? false
  }

  /**
   * Get provider capabilities
   * 
   * @param providerId - Provider identifier
   * @returns Provider capabilities or null if not found/enabled
   */
  getCapabilities(providerId: PaymentProviderId): ProviderCapabilities | null {
    const adapter = this.getAdapter(providerId)
    return adapter?.getCapabilities() || null
  }

  /**
   * Get provider display name
   * 
   * @param providerId - Provider identifier
   * @returns Display name or 'Unknown' if not found
   */
  getDisplayName(providerId: PaymentProviderId): string {
    const config = this.configs.get(providerId)
    return config?.displayName ?? 'Unknown'
  }

  /**
   * Check if provider requires grace period
   * 
   * @param providerId - Provider identifier
   * @returns true if provider requires manual approval
   */
  requiresGracePeriod(providerId: PaymentProviderId): boolean {
    const config = this.configs.get(providerId)
    return config?.requiresApproval ?? false
  }

  /**
   * Get grace period duration in days
   * 
   * @param providerId - Provider identifier
   * @returns Number of days (default: 7)
   */
  getGracePeriodDays(providerId: PaymentProviderId): number {
    const config = this.configs.get(providerId)
    return config?.gracePeriodDays ?? 7
  }

  /**
   * Get all registered provider IDs
   * 
   * @returns Array of registered provider IDs
   */
  getRegisteredProviderIds(): PaymentProviderId[] {
    return Array.from(this.providers.keys())
  }

  /**
   * Clear all registered providers (mainly for testing)
   */
  clear(): void {
    this.providers.clear()
    this.configs.clear()
  }
}

// Global registry instance
export const paymentProviderRegistry = new PaymentProviderRegistry()