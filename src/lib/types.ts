import { ConfigurationKey, PriceConfiguration } from 'prisma/generated/prisma/enums'
import { z } from 'zod'

export const isNotNullish = <T>(item: T): item is NonNullable<T> => {
  return item !== null && item !== undefined
}

// biome-ignore lint/suspicious/noExplicitAny: TODO: explain
const coerceAll = (schema: z.ZodObject<any>) =>
  // biome-ignore lint/suspicious/noExplicitAny: TODO: explain
  z.preprocess((obj: any) => {
    if (!obj || typeof obj !== 'object') return obj

    // Dynamically iterate through all keys and convert types
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => {
        if (typeof value !== 'string') return [key, value]

        const lower = value.toLowerCase().trim()
        if (lower === 'true') return [key, true]
        if (lower === 'false') return [key, false]
        if (value.trim() !== '' && !Number.isNaN(Number(value))) return [key, Number(value)]

        return [key, value]
      }),
    )
  }, schema)

export type Prettify<T> = T extends object ? { [K in keyof T]: T[K] } & {} : T

/**
 * DeepPrettify: Recursively forces TypeScript to resolve intersections (&)
 * into a single clean object. This is what fixes the "ugly" hover state.
 */
export type DeepPrettify<T> = T extends Date ? T : T extends object ? { [K in keyof T]: DeepPrettify<T[K]> } & {} : T

export interface TaskMetadata {
  link?: string
  vendorSessionId?: string
  sourceLocation?: string
  targetLocation?: string
  variantId?: string | null
  movementId?: string
  currentTotal?: number
  suggestedQty?: number
  approvedQty?: number
  verifiedQty?: number | null
  expectedCash?: number | null
  approvedCash?: number | null
  verifiedCash?: number | null
  variance?: number
  sourceLocationId?: string
  targetLocationId?: string
  targetBranchId?: string
  locationId?: string
  supplierId?: string
  batchNumber?: string
}

export interface TransactionComplianceData {
  ptuNumber: string
  ptuIssuedAt: string | null
  vatExemptSales: number
  zeroRatedSales: number
  scPwdName: string | null
  scPwdIdNumber: number | null
  scPwdDiscount: number
}

// Keep the base schemas plain and clean
const BaseConfigSchema = z.object({
  [ConfigurationKey.LOW_STOCK_THRESHOLD]: z.number(),
  [ConfigurationKey.VAT_RATE]: z.number(),
  [ConfigurationKey.IS_VAT_REGISTERED]: z.boolean(),
  [ConfigurationKey.PRICE_CONFIGURATION]: z.enum(PriceConfiguration),
  [ConfigurationKey.BUFFER_RATE]: z.number(),
  [ConfigurationKey.LOCALE]: z.string(),
  [ConfigurationKey.CURRENCY]: z.string(),
  [ConfigurationKey.AUTO_APPROVE_LOW_STOCK_REFILL]: z.boolean().default(true),
  // --- Phase 5: Composable Pricing ---
  [ConfigurationKey.COMPOSABLE_BRANCH_MONTHLY_RATE]: z.number().default(0),
  [ConfigurationKey.COMPOSABLE_MAX_FEATURES]: z.number().default(0),
  [ConfigurationKey.COMPOSABLE_ANNUAL_DISCOUNT_PCT]: z.number().default(0),
  [ConfigurationKey.COMPOSABLE_TAX_RATE]: z.number().default(0),
  [ConfigurationKey.COMPOSABLE_QUOTE_VALIDITY_DAYS]: z.number().default(30),
  [ConfigurationKey.COMPOSABLE_PARTNER_MARGIN_PCT]: z.number().default(0),
  [ConfigurationKey.COMPOSABLE_PROMO_CODE_ENABLED]: z.boolean().default(false),
  // --- Add-on pricing (PHP cents, admin-configurable) ---
  [ConfigurationKey.ADDON_ANALYTICS_PRICE]: z.number().default(29900),
  [ConfigurationKey.ADDON_API_PRICE]: z.number().default(49900),
  [ConfigurationKey.ADDON_BRANCH_PRICE]: z.number().default(19900),
  [ConfigurationKey.ADDON_EMPLOYEE_PRICE]: z.number().default(4900),
})

// Legacy compliance schema - kept for backward compatibility
// New implementation uses compliance adapters and country-specific tables
// See: src/lib/compliance/ and COMPLIANCE_SCHEMA_ARCHITECTURE.md
const BaseComplianceSchema = z.object({
  BIR_TIN: z.string(),
  BIR_PTU_NUMBER: z.string(),
  BIR_PTU_ISSUED_AT: z.string(),
  BIR_RDO_CODE: z.string().optional(),
  BRANCH_SERIAL_NUMBER: z.string().optional(),
  BRANCH_CODE: z.string().optional(),
  BRANCH_PTU_NUMBER: z.string().optional(),
  BRANCH_RDO_CODE: z.string().optional(),
})

// Explicitly define the ZodType shape on the exported schemas!
// This guarantees that .parse() returns exactly ConfigKeyTypes instead of Record<string, unknown>
export const ConfigKeySchema = coerceAll(BaseConfigSchema)
export const ComplianceKeySchema = coerceAll(BaseComplianceSchema)

// Keep your type exports the same
export type ConfigKeyTypes = z.infer<typeof BaseConfigSchema>
export type ComplianceKeyTypes = z.infer<typeof BaseComplianceSchema>
