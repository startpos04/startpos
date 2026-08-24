import { ComplianceKey, ConfigKey, PriceConfiguration } from 'prisma/generated/prisma/enums'
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
  [ConfigKey.LOW_STOCK_THRESHOLD]: z.number(),
  [ConfigKey.VAT_RATE]: z.number(),
  [ConfigKey.IS_VAT_REGISTERED]: z.boolean(),
  [ConfigKey.PRICE_CONFIGURATION]: z.enum(PriceConfiguration),
  [ConfigKey.BUFFER_RATE]: z.number(),
  [ConfigKey.LOCALE]: z.string(),
  [ConfigKey.CURRENCY]: z.string(),
  [ConfigKey.AUTO_APPROVE_LOW_STOCK_REFILL]: z.boolean().default(true),
  // --- Phase 5: Composable Pricing ---
  [ConfigKey.COMPOSABLE_BRANCH_MONTHLY_RATE]: z.number().default(0),
  [ConfigKey.COMPOSABLE_MAX_FEATURES]: z.number().default(0),
  [ConfigKey.COMPOSABLE_ANNUAL_DISCOUNT_PCT]: z.number().default(0),
  [ConfigKey.COMPOSABLE_TAX_RATE]: z.number().default(0),
  [ConfigKey.COMPOSABLE_QUOTE_VALIDITY_DAYS]: z.number().default(30),
  [ConfigKey.COMPOSABLE_PARTNER_MARGIN_PCT]: z.number().default(0),
  [ConfigKey.COMPOSABLE_PROMO_CODE_ENABLED]: z.boolean().default(false),
  // --- Add-on pricing (PHP cents, admin-configurable) ---
  [ConfigKey.ADDON_ANALYTICS_PRICE]: z.number().default(29900),
  [ConfigKey.ADDON_API_PRICE]: z.number().default(49900),
  [ConfigKey.ADDON_BRANCH_PRICE]: z.number().default(19900),
  [ConfigKey.ADDON_EMPLOYEE_PRICE]: z.number().default(4900),
})

const BaseComplianceSchema = z.object({
  [ComplianceKey.BIR_TIN]: z.string(),
  [ComplianceKey.BIR_PTU_NUMBER]: z.string(),
  [ComplianceKey.BIR_PTU_ISSUED_AT]: z.string(),
})

// Explicitly define the ZodType shape on the exported schemas!
// This guarantees that .parse() returns exactly ConfigKeyTypes instead of Record<string, unknown>
export const ConfigKeySchema = coerceAll(BaseConfigSchema)
export const ComplianceKeySchema = coerceAll(BaseComplianceSchema)

// Keep your type exports the same
export type ConfigKeyTypes = z.infer<typeof BaseConfigSchema>
export type ComplianceKeyTypes = z.infer<typeof BaseComplianceSchema>
