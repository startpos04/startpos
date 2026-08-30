/**
 * init-providers.ts
 * 
 * Initialize and register payment providers with the registry.
 * This file should be imported early in the application startup
 * to ensure providers are available when needed.
 */

// Import provider adapters to trigger their registration
// The adapters register themselves with the registry when imported
import './adapters/stripe-adapter'
import './adapters/manual-adapter'  // Added manual adapter

// Future provider imports go here:
// import './adapters/paymongo-adapter'

// Validation
import { validateProviderEnvironment } from './provider-config'
import { paymentProviderRegistry } from './payment-provider-registry'

/**
 * Initialize payment providers
 * Called during application startup
 */
export function initPaymentProviders(): void {
  // Validate environment configuration
  const validation = validateProviderEnvironment()
  if (!validation.valid) {
    console.warn('[PaymentProviders] Missing environment variables:', validation.missing)
  }
  
  // Log registered providers
  const registeredProviders = paymentProviderRegistry.getRegisteredProviderIds()
  console.log('[PaymentProviders] Registered providers:', registeredProviders)
  
  const enabledProviders = paymentProviderRegistry.getEnabledProviders()
  console.log('[PaymentProviders] Enabled providers:', enabledProviders.map(p => p.providerId))
}

// Auto-initialize on import (for server-side code)
if (typeof window === 'undefined') {
  initPaymentProviders()
}