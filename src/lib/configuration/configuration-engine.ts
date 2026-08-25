/**
 * configuration-engine.ts
 *
 * Central configuration access layer with fallback logic.
 * Implements the three-pillar architecture pattern matching Authorization and Capability systems.
 *
 * Architecture:
 *   ConfigurationDefinition (base definitions)
 *       ↓
 *   Configuration (state per platform/business/branch/user)
 *       ↓
 *   ConfigurationEngine (access + validation)
 *
 * Fallback Chain:
 *   Branch → Business → Platform → Hardcoded Default
 *
 * Usage:
 *   const value = await ConfigurationEngine.get('VAT_RATE', { businessId })
 *   await ConfigurationEngine.set('VAT_RATE', '0.12', { type: 'BUSINESS', businessId })
 */

import type { ConfigurationKey, ConfigurationScope } from 'prisma/generated/prisma/enums'
import { prisma } from '@/lib/prisma-client'

type CountryCode = 'PH' | 'SG' | 'US'

type ConfigContext = {
  businessId?: string
  branchId?: string
  userId?: string
}

export const ConfigurationEngine = {
  /**
   * Get configuration value with fallback chain:
   * Branch → Business → Platform Default → Hardcoded Default
   */
  async get(key: ConfigurationKey, context: ConfigContext): Promise<string | null> {
    // 1. Try branch-scoped
    if (context.branchId) {
      const branchConfig = await prisma.configuration.findFirst({
        where: {
          key,
          branchId: context.branchId,
          scope: 'BRANCH',
        },
      })
      if (branchConfig) return branchConfig.value
    }

    // 2. Try business-scoped
    if (context.businessId) {
      const businessConfig = await prisma.configuration.findFirst({
        where: {
          key,
          businessId: context.businessId,
          scope: 'BUSINESS',
        },
      })
      if (businessConfig) return businessConfig.value
    }

    // 3. Try platform default (from ConfigurationDefinition)
    const definition = await prisma.configurationDefinition.findUnique({
      where: { key },
    })
    if (definition) return definition.defaultValue

    // 4. Hardcoded fallback (last resort)
    return ConfigurationEngine._getHardcodedDefault(key)
  },

  /**
   * Get multiple configurations at once (more efficient)
   */
  async getMany(keys: ConfigurationKey[], context: ConfigContext): Promise<Record<string, string>> {
    const results = await Promise.all(
      keys.map(async key => ({
        key,
        value: (await ConfigurationEngine.get(key, context)) ?? '',
      })),
    )

    return Object.fromEntries(results.map(r => [r.key, r.value]))
  },

  /**
   * Get all configurations for a business/branch as a map
   */
  async getAll(context: ConfigContext): Promise<Record<string, string>> {
    const configs = await prisma.configuration.findMany({
      where: {
        OR: [
          { businessId: context.businessId, scope: 'BUSINESS' },
          { branchId: context.branchId, scope: 'BRANCH' },
        ],
      },
    })

    // Build map with fallback to definitions
    const map: Record<string, string> = {}
    for (const config of configs) {
      map[config.key] = config.value
    }

    // Fill in missing keys from definitions
    const definitions = await prisma.configurationDefinition.findMany()
    for (const def of definitions) {
      if (!map[def.key]) {
        map[def.key] = def.defaultValue
      }
    }

    return map
  },

  /**
   * Set configuration value
   */
  async set(
    key: ConfigurationKey,
    value: string,
    scope: {
      type: ConfigurationScope
      businessId?: string
      branchId?: string
      userId?: string
    },
  ) {
    // Validate against definition
    const definition = await prisma.configurationDefinition.findUnique({
      where: { key },
    })

    if (definition) {
      // Validate based on data type and validation rules
      ConfigurationEngine._validateValue(key, value, definition)
    }

    // Build unique constraint fields based on scope
    const whereClause =
      scope.type === 'BRANCH'
        ? { key_branchId_scope: { key, branchId: scope.branchId, scope: scope.type } }
        : scope.type === 'BUSINESS'
          ? { key_businessId_scope: { key, businessId: scope.businessId, scope: scope.type } }
          : { key_userId_scope: { key, userId: scope.userId, scope: scope.type } }

    return prisma.configuration.upsert({
      where: whereClause,
      create: {
        key,
        value,
        scope: scope.type,
        businessId: scope.businessId,
        branchId: scope.branchId,
        userId: scope.userId,
      },
      update: {
        value,
      },
    })
  },

  /**
   * Validate configuration value against definition rules
   * @throws Error if validation fails
   */
  _validateValue(
    _key: ConfigurationKey,
    value: string,
    definition: {
      dataType: string
      validation: unknown
      label: string
    },
  ) {
    // Number validation
    if (definition.dataType === 'NUMBER') {
      const numValue = Number(value)
      if (Number.isNaN(numValue)) {
        throw new Error(`${definition.label} must be a valid number`)
      }

      if (definition.validation) {
        const rules = definition.validation as { min?: number; max?: number }
        
        if (rules.min !== undefined && numValue < rules.min) {
          throw new Error(`${definition.label} must be at least ${rules.min}`)
        }
        
        if (rules.max !== undefined && numValue > rules.max) {
          throw new Error(`${definition.label} must be at most ${rules.max}`)
        }
      }
    }

    // Boolean validation
    if (definition.dataType === 'BOOLEAN') {
      if (value !== 'true' && value !== 'false') {
        throw new Error(`${definition.label} must be either 'true' or 'false'`)
      }
    }

    // Enum validation
    if (definition.dataType === 'ENUM') {
      if (definition.validation) {
        const rules = definition.validation as { values: string[] }
        if (!rules.values?.includes(value)) {
          throw new Error(
            `${definition.label} must be one of: ${rules.values.join(', ')}`
          )
        }
      }
    }

    // String validation (regex, minLength, maxLength)
    if (definition.dataType === 'STRING') {
      if (definition.validation) {
        const rules = definition.validation as { 
          regex?: string
          minLength?: number
          maxLength?: number
        }
        
        if (rules.regex) {
          const regex = new RegExp(rules.regex)
          if (!regex.test(value)) {
            throw new Error(`${definition.label} format is invalid`)
          }
        }
        
        if (rules.minLength !== undefined && value.length < rules.minLength) {
          throw new Error(
            `${definition.label} must be at least ${rules.minLength} characters`
          )
        }
        
        if (rules.maxLength !== undefined && value.length > rules.maxLength) {
          throw new Error(
            `${definition.label} must be at most ${rules.maxLength} characters`
          )
        }
      }
    }

    // JSON validation (check if parseable)
    if (definition.dataType === 'JSON') {
      try {
        JSON.parse(value)
      } catch {
        throw new Error(`${definition.label} must be valid JSON`)
      }
    }
  },

  /**
   * Delete configuration (revert to default)
   */
  async delete(
    key: ConfigurationKey,
    scope: {
      type: ConfigurationScope
      businessId?: string
      branchId?: string
      userId?: string
    },
  ) {
    const whereClause =
      scope.type === 'BRANCH'
        ? { key_branchId_scope: { key, branchId: scope.branchId, scope: scope.type } }
        : scope.type === 'BUSINESS'
          ? { key_businessId_scope: { key, businessId: scope.businessId, scope: scope.type } }
          : { key_userId_scope: { key, userId: scope.userId, scope: scope.type } }

    return prisma.configuration.delete({
      where: whereClause,
    })
  },

  /**
   * Get country code from business configuration
   * Used by ComplianceEngine (Phase 2) to route to correct compliance table
   */
  async getCountryCode(businessId: string): Promise<CountryCode> {
    const locale = await ConfigurationEngine.get('LOCALE', { businessId })

    // Derive country from locale
    if (locale?.startsWith('en-PH')) return 'PH'
    if (locale?.startsWith('en-SG')) return 'SG'
    if (locale?.startsWith('en-US')) return 'US'

    return 'PH' // Default
  },

  /**
   * Get configuration definition metadata
   */
  async getDefinition(key: ConfigurationKey) {
    return prisma.configurationDefinition.findUnique({
      where: { key },
    })
  },

  /**
   * Get all definitions for a category
   */
  async getDefinitionsByCategory(category: string) {
    return prisma.configurationDefinition.findMany({
      where: { category: category as unknown },
    })
  },

  /**
   * Hardcoded defaults (last resort fallback)
   * Used when definition doesn't exist in database yet
   */
  _getHardcodedDefault(key: ConfigurationKey): string {
    const defaults: Partial<Record<ConfigurationKey, string>> = {
      // Tax & Compliance
      VAT_RATE: '0.12',
      IS_VAT_REGISTERED: 'false',
      PRICE_CONFIGURATION: 'EXCLUSIVE',

      // Locale & Regional
      LOCALE: 'en-PH',
      CURRENCY: 'PHP',

      // Operational
      LOW_STOCK_THRESHOLD: '10',
      BUFFER_RATE: '0.05',
      AUTO_APPROVE_LOW_STOCK_REFILL: 'true',

      // Billing & Subscription
      TRIAL_DURATION_DAYS: '30',
      GRACE_PERIOD_DAYS: '7',
      LONG_TERM_INACTIVE_DAYS: '90',
      CREDIT_LOW_BALANCE_THRESHOLD: '10',
      OVERAGE_BILLING_ENABLED: 'false',

      // Composable Pricing
      COMPOSABLE_BRANCH_MONTHLY_RATE: '0',
      COMPOSABLE_MAX_FEATURES: '0',
      COMPOSABLE_ANNUAL_DISCOUNT_PCT: '0',
      COMPOSABLE_TAX_RATE: '0',
      COMPOSABLE_QUOTE_VALIDITY_DAYS: '30',
      COMPOSABLE_PARTNER_MARGIN_PCT: '0',
      COMPOSABLE_PROMO_CODE_ENABLED: 'false',

      // Guidance
      HINT_FREQUENCY_DAYS: '1',
      HINT_DISPLAY_SECONDS: '6',

      // Add-on Pricing (PHP cents)
      ADDON_ANALYTICS_PRICE: '29900',
      ADDON_API_PRICE: '49900',
      ADDON_BRANCH_PRICE: '19900',
      ADDON_EMPLOYEE_PRICE: '4900',
      ADDON_TX_500_PRICE: '9900',
      ADDON_TX_1000_PRICE: '17900',
      ADDON_TX_5000_PRICE: '79900',
      ADDON_TX_RECURRING_500_PRICE: '9900',
      ADDON_TX_RECURRING_1000_PRICE: '17900',
      ADDON_TX_RECURRING_5000_PRICE: '79900',
    }

    return defaults[key] ?? ''
  },

  /**
   * Type-safe getters for common configurations
   */
  async getTaxRate(businessId: string): Promise<number> {
    const value = await ConfigurationEngine.get('VAT_RATE', { businessId })
    return Number.parseFloat(value ?? '0.12')
  },

  async isTaxRegistered(businessId: string): Promise<boolean> {
    const value = await ConfigurationEngine.get('IS_VAT_REGISTERED', { businessId })
    return value === 'true'
  },

  async getPriceConfiguration(businessId: string): Promise<'INCLUSIVE' | 'EXCLUSIVE'> {
    const value = await ConfigurationEngine.get('PRICE_CONFIGURATION', { businessId })
    return (value as 'INCLUSIVE' | 'EXCLUSIVE') ?? 'EXCLUSIVE'
  },

  async getLocale(businessId: string): Promise<string> {
    return (await ConfigurationEngine.get('LOCALE', { businessId })) ?? 'en-PH'
  },

  async getCurrency(businessId: string): Promise<string> {
    return (await ConfigurationEngine.get('CURRENCY', { businessId })) ?? 'PHP'
  },

  async getLowStockThreshold(businessId: string): Promise<number> {
    const value = await ConfigurationEngine.get('LOW_STOCK_THRESHOLD', { businessId })
    return Number.parseInt(value ?? '10', 10)
  },
}
