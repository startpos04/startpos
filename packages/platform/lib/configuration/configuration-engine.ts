/**
 * configuration-engine.ts
 *
 * Platform responsibility: ConfigurationDefinition reads and value validation.
 * No tenant coupling — operates only on platform-level definition tables.
 *
 * Fallback Chain (platform layer only):
 *   ConfigurationDefinition.defaultValue → Hardcoded Default
 *
 * The full fallback chain including tenant-scoped overrides lives in the web layer:
 *   apps/web/src/lib/configuration/configuration-engine.ts
 *   Branch → Business → Platform Default → Hardcoded Default
 */

import { prisma } from '@platform/lib/prisma-client'
import type { ConfigCategory, ConfigurationKey } from 'prisma/generated/prisma/enums'

// ---------------------------------------------------------------------------
// getDefault — platform-level config resolution (no tenant)
//
// Reads ConfigurationDefinition.defaultValue from DB, falls back to hardcoded.
// Use this in platform-internal code that has no businessId/branchId context.
//
// @example
// const days = await getDefault('HINT_FREQUENCY_DAYS')
// ---------------------------------------------------------------------------

export async function getDefault(key: ConfigurationKey): Promise<string> {
  const definition = await prisma.configurationDefinition.findUnique({ where: { key } })
  if (definition) return definition.defaultValue
  return getHardcodedDefault(key)
}

// ---------------------------------------------------------------------------
// getDefinition / getDefinitionsByCategory — metadata reads
// ---------------------------------------------------------------------------

export async function getDefinition(key: ConfigurationKey) {
  return prisma.configurationDefinition.findUnique({ where: { key } })
}

export async function getDefinitionsByCategory(category: ConfigCategory) {
  return prisma.configurationDefinition.findMany({ where: { category } })
}

// ---------------------------------------------------------------------------
// validateValue — pure validation against definition rules
// ---------------------------------------------------------------------------

export function validateValue(key: ConfigurationKey, value: string, definition: { dataType: string; validation: unknown; label: string }): void {
  const label = `${definition.label} [${key}]`

  if (definition.dataType === 'NUMBER') {
    const numValue = Number(value)
    if (Number.isNaN(numValue)) throw new Error(`${label} must be a valid number`)
    if (definition.validation) {
      const rules = definition.validation as { min?: number; max?: number }
      if (rules.min !== undefined && numValue < rules.min) throw new Error(`${label} must be at least ${rules.min}`)
      if (rules.max !== undefined && numValue > rules.max) throw new Error(`${label} must be at most ${rules.max}`)
    }
  }

  if (definition.dataType === 'BOOLEAN') {
    if (value !== 'true' && value !== 'false') throw new Error(`${label} must be either 'true' or 'false'`)
  }

  if (definition.dataType === 'ENUM' && definition.validation) {
    const rules = definition.validation as { values: string[] }
    if (!rules.values?.includes(value)) throw new Error(`${label} must be one of: ${rules.values.join(', ')}`)
  }

  if (definition.dataType === 'STRING' && definition.validation) {
    const rules = definition.validation as { regex?: string; minLength?: number; maxLength?: number }
    if (rules.regex && !new RegExp(rules.regex).test(value)) throw new Error(`${label} format is invalid`)
    if (rules.minLength !== undefined && value.length < rules.minLength) throw new Error(`${label} must be at least ${rules.minLength} characters`)
    if (rules.maxLength !== undefined && value.length > rules.maxLength) throw new Error(`${label} must be at most ${rules.maxLength} characters`)
  }

  if (definition.dataType === 'JSON') {
    try {
      JSON.parse(value)
    } catch {
      throw new Error(`${label} must be valid JSON`)
    }
  }
}

// ---------------------------------------------------------------------------
// getHardcodedDefault — last-resort fallback, no DB
// ---------------------------------------------------------------------------

export function getHardcodedDefault(key: ConfigurationKey): string {
  const defaults: Partial<Record<ConfigurationKey, string>> = {
    VAT_RATE: '0.12',
    IS_VAT_REGISTERED: 'false',
    PRICE_CONFIGURATION: 'EXCLUSIVE',
    LOCALE: 'en-PH',
    CURRENCY: 'PHP',
    LOW_STOCK_THRESHOLD: '10',
    BUFFER_RATE: '0.05',
    AUTO_APPROVE_LOW_STOCK_REFILL: 'true',
    TRIAL_DURATION_DAYS: '30',
    GRACE_PERIOD_DAYS: '7',
    LONG_TERM_INACTIVE_DAYS: '90',
    CREDIT_LOW_BALANCE_THRESHOLD: '10',
    OVERAGE_BILLING_ENABLED: 'false',
    COMPOSABLE_BRANCH_MONTHLY_RATE: '0',
    COMPOSABLE_MAX_FEATURES: '0',
    COMPOSABLE_ANNUAL_DISCOUNT_PCT: '0',
    COMPOSABLE_TAX_RATE: '0',
    COMPOSABLE_QUOTE_VALIDITY_DAYS: '30',
    COMPOSABLE_PARTNER_MARGIN_PCT: '0',
    COMPOSABLE_PROMO_CODE_ENABLED: 'false',
    HINT_FREQUENCY_DAYS: '1',
    HINT_DISPLAY_SECONDS: '6',
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
}

// ---------------------------------------------------------------------------
// Namespace export — for callers that use ConfigurationEngine.getDefinition() etc.
// ---------------------------------------------------------------------------

export const ConfigurationEngine = {
  getDefault,
  getDefinition,
  getDefinitionsByCategory,
  validateValue,
  getHardcodedDefault,
}
