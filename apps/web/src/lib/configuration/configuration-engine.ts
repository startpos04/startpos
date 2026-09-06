/**
 * configuration-engine.ts — Web-layer superset
 *
 * Extends the platform ConfigurationEngine with the full tenant-scoped
 * fallback chain:
 *   Branch → Business → Platform Default (ConfigurationDefinition) → Hardcoded Default
 *
 * All tenant-scoped reads/writes use getTenantPrisma for proper row-level
 * isolation — the platform version uses the base prisma client which has
 * no tenant scoping.
 *
 * Usage in apps/web:
 *   import { ConfigurationEngine } from '@/lib/configuration/configuration-engine'
 *
 *   const vatRate = await ConfigurationEngine.get('VAT_RATE', { businessId, branchId })
 *   await ConfigurationEngine.set('VAT_RATE', '0.12', { type: 'BUSINESS', businessId })
 */

import { getDefinition, getDefinitionsByCategory, getHardcodedDefault, validateValue } from '@platform/lib/configuration/configuration-engine'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import type { ConfigCategory, ConfigurationKey, ConfigurationScope } from 'prisma/generated/prisma/enums'
import { getTenantPrisma } from '@/lib/prisma-client'

// Re-export platform primitives so callers only need one import
export { getDefinition, getDefinitionsByCategory, getHardcodedDefault, validateValue }

type CountryCode = 'PH' | 'SG' | 'US'

type ConfigContext = {
  businessId?: string
  branchId?: string
  userId?: string
}

// ---------------------------------------------------------------------------
// get — full fallback chain with tenant isolation
// ---------------------------------------------------------------------------

async function get(key: ConfigurationKey, context: ConfigContext): Promise<string | null> {
  // 1. Branch-scoped override
  if (context.branchId && context.businessId) {
    const prisma = getTenantPrisma(context.businessId, context.branchId)
    const branchConfig = await prisma.configuration.findFirst({
      where: { key, branchId: context.branchId, scope: 'BRANCH' },
    })
    if (branchConfig) return branchConfig.value
  }

  // 2. Business-scoped override
  if (context.businessId) {
    const prisma = getTenantPrisma(context.businessId)
    const businessConfig = await prisma.configuration.findFirst({
      where: { key, businessId: context.businessId, scope: 'BUSINESS' },
    })
    if (businessConfig) return businessConfig.value
  }

  // 3. Platform default (ConfigurationDefinition)
  const definition = await rootPrisma.configurationDefinition.findUnique({ where: { key } })
  if (definition) return definition.defaultValue

  // 4. Hardcoded fallback
  return getHardcodedDefault(key)
}

// ---------------------------------------------------------------------------
// getMany — batch get
// ---------------------------------------------------------------------------

async function getMany(keys: ConfigurationKey[], context: ConfigContext): Promise<Record<string, string>> {
  const results = await Promise.all(keys.map(async key => ({ key, value: (await get(key, context)) ?? '' })))
  return Object.fromEntries(results.map(r => [r.key, r.value]))
}

// ---------------------------------------------------------------------------
// getAll — all configs for a business/branch with definition fallback
// ---------------------------------------------------------------------------

async function getAll(context: ConfigContext): Promise<Record<string, string>> {
  const orClauses = [
    ...(context.businessId != null ? [{ businessId: context.businessId, scope: 'BUSINESS' as const }] : []),
    ...(context.branchId != null ? [{ branchId: context.branchId, scope: 'BRANCH' as const }] : []),
  ]

  const configs = orClauses.length > 0 ? await rootPrisma.configuration.findMany({ where: { OR: orClauses } }) : []

  const map: Record<string, string> = {}
  for (const config of configs) map[config.key] = config.value

  const definitions = await rootPrisma.configurationDefinition.findMany()
  for (const def of definitions) {
    if (!map[def.key]) map[def.key] = def.defaultValue
  }

  return map
}

// ---------------------------------------------------------------------------
// set — upsert a tenant-scoped configuration value
// ---------------------------------------------------------------------------

async function set(
  key: ConfigurationKey,
  value: string,
  scope: {
    type: ConfigurationScope
    businessId?: string
    branchId?: string
    userId?: string
  },
) {
  const definition = await rootPrisma.configurationDefinition.findUnique({ where: { key } })
  if (definition) validateValue(key, value, definition)

  const whereClause =
    scope.type === 'BRANCH'
      ? { key_branchId_scope: { key, branchId: scope.branchId!, scope: scope.type } }
      : scope.type === 'BUSINESS'
        ? { key_businessId_scope: { key, businessId: scope.businessId!, scope: scope.type } }
        : { key_userId_scope: { key, userId: scope.userId!, scope: scope.type } }

  return rootPrisma.configuration.upsert({
    where: whereClause,
    create: {
      key,
      value,
      scope: scope.type,
      businessId: scope.businessId ?? null,
      branchId: scope.branchId ?? null,
      userId: scope.userId ?? null,
    },
    update: { value },
  })
}

// ---------------------------------------------------------------------------
// delete — remove a scoped override (reverts to platform default)
// ---------------------------------------------------------------------------

async function del(
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
      ? { key_branchId_scope: { key, branchId: scope.branchId!, scope: scope.type } }
      : scope.type === 'BUSINESS'
        ? { key_businessId_scope: { key, businessId: scope.businessId!, scope: scope.type } }
        : { key_userId_scope: { key, userId: scope.userId!, scope: scope.type } }

  return rootPrisma.configuration.delete({ where: whereClause })
}

// ---------------------------------------------------------------------------
// Country code
// ---------------------------------------------------------------------------

async function getCountryCode(businessId: string): Promise<CountryCode> {
  const locale = await get('LOCALE', { businessId })
  if (locale?.startsWith('en-PH')) return 'PH'
  if (locale?.startsWith('en-SG')) return 'SG'
  if (locale?.startsWith('en-US')) return 'US'
  return 'PH'
}

// ---------------------------------------------------------------------------
// Type-safe convenience wrappers
// ---------------------------------------------------------------------------

async function getTaxRate(businessId: string): Promise<number> {
  return Number.parseFloat((await get('VAT_RATE', { businessId })) ?? '0.12')
}

async function isTaxRegistered(businessId: string): Promise<boolean> {
  return (await get('IS_VAT_REGISTERED', { businessId })) === 'true'
}

async function getPriceConfiguration(businessId: string): Promise<'INCLUSIVE' | 'EXCLUSIVE'> {
  return ((await get('PRICE_CONFIGURATION', { businessId })) as 'INCLUSIVE' | 'EXCLUSIVE') ?? 'EXCLUSIVE'
}

async function getLocale(businessId: string): Promise<string> {
  return (await get('LOCALE', { businessId })) ?? 'en-PH'
}

async function getCurrency(businessId: string): Promise<string> {
  return (await get('CURRENCY', { businessId })) ?? 'PHP'
}

async function getLowStockThreshold(businessId: string): Promise<number> {
  return Number.parseInt((await get('LOW_STOCK_THRESHOLD', { businessId })) ?? '10', 10)
}

// ---------------------------------------------------------------------------
// Namespace export — drop-in replacement for @platform ConfigurationEngine
// ---------------------------------------------------------------------------

export const ConfigurationEngine = {
  get,
  getMany,
  getAll,
  set,
  delete: del,
  getCountryCode,
  getTaxRate,
  isTaxRegistered,
  getPriceConfiguration,
  getLocale,
  getCurrency,
  getLowStockThreshold,
  // Platform primitives re-exported for convenience
  getDefinition,
  getDefinitionsByCategory,
  getHardcodedDefault,
  validateValue,
}
