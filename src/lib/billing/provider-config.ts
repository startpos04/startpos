/**
 * Provider Configuration
 * 
 * Centralized configuration system for payment providers.
 * Loads configuration from environment variables and provides
 * type-safe access to provider-specific settings.
 * 
 * Design principles:
 * - Configuration must not be scattered through application code
 * - Type-safe configuration access
 * - Environment-based enable/disable
 * - Extensible for future providers
 */

import type { PaymentProviderId } from './payment-provider-registry'

// Provider configuration types
export type StripeProviderConfig = {
  secretKey: string
  webhookSecret: string
  planPriceIds: Record<string, string>
  creditPackagePriceIds: Record<string, string>
  addonPriceIds: Record<string, string>
}

export type ManualProviderConfig = {
  paymentMethod: 'GCASH' | 'BANK_TRANSFER' | 'MAYA'
  accountName: string
  accountNumber: string
  paymentInstructions: string
  gracePeriodDays: number
  autoExpireDays: number
  setupRoute: string
}

export type PayMongoProviderConfig = {
  secretKey: string
  publicKey: string
  webhookSecret: string
  planPriceIds: Record<string, string>
}

export type XenditProviderConfig = {
  secretKey: string
  webhookVerificationToken: string
  planPriceIds: Record<string, string>
}

export type ProviderConfigMap = {
  stripe: StripeProviderConfig
  manual: ManualProviderConfig
  paymongo?: PayMongoProviderConfig
  xendit?: XenditProviderConfig
}

/**
 * Load provider configurations from environment variables
 * 
 * @returns Configuration map for all providers
 */
export function loadProviderConfigs(): ProviderConfigMap {
  return {
    stripe: {
      secretKey: process.env['STRIPE_SECRET_KEY'] ?? '',
      webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
      planPriceIds: {
        starter_monthly: process.env['STRIPE_PLAN_STARTER_PRICE_ID'] ?? '',
        starter_annual: process.env['STRIPE_PLAN_STARTER_ANNUAL_PRICE_ID'] ?? '',
        professional_monthly: process.env['STRIPE_PLAN_PROFESSIONAL_PRICE_ID'] ?? '',
        professional_annual: process.env['STRIPE_PLAN_PROFESSIONAL_ANNUAL_PRICE_ID'] ?? '',
        enterprise_monthly: process.env['STRIPE_PLAN_ENTERPRISE_PRICE_ID'] ?? '',
        enterprise_annual: process.env['STRIPE_PLAN_ENTERPRISE_ANNUAL_PRICE_ID'] ?? '',
      },
      creditPackagePriceIds: {
        credits_10: process.env['STRIPE_CREDIT_PKG_10_PRICE_ID'] ?? '',
        credits_25: process.env['STRIPE_CREDIT_PKG_25_PRICE_ID'] ?? '',
        credits_50: process.env['STRIPE_CREDIT_PKG_50_PRICE_ID'] ?? '',
        credits_100: process.env['STRIPE_CREDIT_PKG_100_PRICE_ID'] ?? '',
      },
      addonPriceIds: {
        branch: process.env['STRIPE_ADDON_BRANCH_PRICE_ID'] ?? '',
        employee: process.env['STRIPE_ADDON_EMPLOYEE_PRICE_ID'] ?? '',
        analytics: process.env['STRIPE_ADDON_ANALYTICS_PRICE_ID'] ?? '',
        api_access: process.env['STRIPE_ADDON_API_PRICE_ID'] ?? '',
        tx_500: process.env['STRIPE_ADDON_TX_500_PRICE_ID'] ?? '',
        tx_1000: process.env['STRIPE_ADDON_TX_1000_PRICE_ID'] ?? '',
        tx_5000: process.env['STRIPE_ADDON_TX_5000_PRICE_ID'] ?? '',
      },
    },
    manual: {
      paymentMethod: (process.env['MANUAL_PAYMENT_METHOD'] as 'GCASH' | 'BANK_TRANSFER' | 'MAYA') ?? 'GCASH',
      accountName: process.env['MANUAL_ACCOUNT_NAME'] ?? 'StartPOS Business',
      accountNumber: process.env['MANUAL_ACCOUNT_NUMBER'] ?? '09171234567',
      paymentInstructions: process.env['MANUAL_PAYMENT_INSTRUCTIONS'] ?? 'Transfer to the account above and upload proof of payment.',
      gracePeriodDays: parseInt(process.env['MANUAL_GRACE_PERIOD_DAYS'] ?? '7'),
      autoExpireDays: parseInt(process.env['MANUAL_AUTO_EXPIRE_DAYS'] ?? '7'),
      setupRoute: '/billing/manual-payment',
    },
    // Future providers can be added here
    ...(process.env['PAYMONGO_SECRET_KEY'] && {
      paymongo: {
        secretKey: process.env['PAYMONGO_SECRET_KEY'],
        publicKey: process.env['PAYMONGO_PUBLIC_KEY'] ?? '',
        webhookSecret: process.env['PAYMONGO_WEBHOOK_SECRET'] ?? '',
        planPriceIds: {
          starter_monthly: process.env['PAYMONGO_PLAN_STARTER_PRICE_ID'] ?? '',
          professional_monthly: process.env['PAYMONGO_PLAN_PROFESSIONAL_PRICE_ID'] ?? '',
          enterprise_monthly: process.env['PAYMONGO_PLAN_ENTERPRISE_PRICE_ID'] ?? '',
        },
      } as PayMongoProviderConfig,
    }),
    ...(process.env['XENDIT_SECRET_KEY'] && {
      xendit: {
        secretKey: process.env['XENDIT_SECRET_KEY'],
        webhookVerificationToken: process.env['XENDIT_WEBHOOK_VERIFICATION_TOKEN'] ?? '',
        planPriceIds: {
          starter_monthly: process.env['XENDIT_PLAN_STARTER_PRICE_ID'] ?? '',
          professional_monthly: process.env['XENDIT_PLAN_PROFESSIONAL_PRICE_ID'] ?? '',
          enterprise_monthly: process.env['XENDIT_PLAN_ENTERPRISE_PRICE_ID'] ?? '',
        },
      } as XenditProviderConfig,
    }),
  }
}

/**
 * Check if a provider is enabled based on configuration
 * 
 * @param providerId - Provider identifier
 * @returns true if provider is enabled
 */
export function isProviderEnabled(providerId: PaymentProviderId): boolean {
  const config = loadProviderConfigs()
  
  switch (providerId) {
    case 'stripe':
      return !!config.stripe.secretKey
    case 'manual':
      return true  // Manual provider always available
    case 'paymongo':
      return !!config.paymongo?.secretKey
    case 'xendit':
      return !!config.xendit?.secretKey
    case 'bank_transfer':
      return true  // Bank transfer is a manual method
    default:
      return false
  }
}

/**
 * Get configuration for a specific provider
 * 
 * @param providerId - Provider identifier
 * @returns Provider configuration or null if not available
 */
export function getProviderConfig<T extends keyof ProviderConfigMap>(providerId: T): ProviderConfigMap[T] | null {
  const configs = loadProviderConfigs()
  return configs[providerId] || null
}

/**
 * Get all enabled provider configurations
 * 
 * @returns Array of enabled provider configs with their IDs
 */
export function getEnabledProviderConfigs(): Array<{ providerId: PaymentProviderId; config: ProviderConfigMap[keyof ProviderConfigMap] }> {
  const configs = loadProviderConfigs()
  const enabled: Array<{ providerId: PaymentProviderId; config: ProviderConfigMap[keyof ProviderConfigMap] }> = []

  // Check each provider
  const providers: PaymentProviderId[] = ['stripe', 'manual', 'paymongo', 'xendit', 'bank_transfer']
  
  for (const providerId of providers) {
    if (isProviderEnabled(providerId)) {
      const config = getProviderConfig(providerId)
      if (config) {
        enabled.push({ providerId, config })
      }
    }
  }

  return enabled
}

// Environment validation helper
export function validateProviderEnvironment(): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  
  // Stripe validation (if enabled)
  if (process.env['STRIPE_SECRET_KEY']) {
    if (!process.env['STRIPE_WEBHOOK_SECRET']) {
      missing.push('STRIPE_WEBHOOK_SECRET')
    }
    // Additional Stripe validations can be added here
  }

  // PayMongo validation (if enabled) 
  if (process.env['PAYMONGO_SECRET_KEY']) {
    if (!process.env['PAYMONGO_PUBLIC_KEY']) {
      missing.push('PAYMONGO_PUBLIC_KEY')
    }
  }

  // Xendit validation (if enabled)
  if (process.env['XENDIT_SECRET_KEY']) {
    if (!process.env['XENDIT_WEBHOOK_VERIFICATION_TOKEN']) {
      missing.push('XENDIT_WEBHOOK_VERIFICATION_TOKEN')
    }
  }

  return {
    valid: missing.length === 0,
    missing
  }
}