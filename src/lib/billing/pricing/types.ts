/**
 * billing/pricing/types.ts
 *
 * Shared DTO types for the PricingEngine domain layer.
 *
 * Architectural contract (ADR-009, ADR-010):
 *   - Zero infrastructure imports. No Prisma types, no collections, no SDKs.
 *   - All types are plain objects — safe to import from any layer.
 *   - PricingEngine receives data exclusively via these DTOs, assembled by
 *     PricingCatalogRepository in the Application Layer.
 *   - Monetary amounts: all integers in cents (or basis points where noted).
 */

import type { CapabilityKey } from '@startpos-core/lib/entitlement/capability-keys'

// ---------------------------------------------------------------------------
// BundlePricingType — mirrors the Prisma enum in the domain layer
// ---------------------------------------------------------------------------
export const BundlePricingType = {
  PERCENTAGE_DISCOUNT: 'PERCENTAGE_DISCOUNT',
  FIXED_PRICE: 'FIXED_PRICE',
  FLAT_DISCOUNT: 'FLAT_DISCOUNT',
} as const
export type BundlePricingType = (typeof BundlePricingType)[keyof typeof BundlePricingType]

// ---------------------------------------------------------------------------
// QuoteLineType — mirrors the Prisma enum in the domain layer
// ---------------------------------------------------------------------------
export const QuoteLineType = {
  FEATURE: 'FEATURE',
  BUNDLE_DISCOUNT: 'BUNDLE_DISCOUNT',
  PROMO_DISCOUNT: 'PROMO_DISCOUNT',
  SURCHARGE: 'SURCHARGE',
  TAX: 'TAX',
  ONE_TIME_FEE: 'ONE_TIME_FEE',
} as const
export type QuoteLineType = (typeof QuoteLineType)[keyof typeof QuoteLineType]

// ---------------------------------------------------------------------------
// QuoteStatus — mirrors the Prisma enum in the domain layer
// ---------------------------------------------------------------------------
export const QuoteStatus = {
  DRAFT: 'DRAFT',
  CALCULATED: 'CALCULATED',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  CONVERTED: 'CONVERTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus]

// ---------------------------------------------------------------------------
// PricingCategory — mirrors the Prisma enum in the domain layer
// ---------------------------------------------------------------------------
export const PricingCategory = {
  CORE: 'CORE',
  OPERATIONAL: 'OPERATIONAL',
  MANAGEMENT: 'MANAGEMENT',
  INTEGRATION: 'INTEGRATION',
  ADVANCED: 'ADVANCED',
} as const
export type PricingCategory = (typeof PricingCategory)[keyof typeof PricingCategory]

// ---------------------------------------------------------------------------
// FeaturePriceDTO
// A single feature's price entry within a PricingCatalog version.
// ---------------------------------------------------------------------------
export type FeaturePriceDTO = {
  featureKey: CapabilityKey
  /** Feature's human-readable label (for quote line descriptions) */
  featureLabel: string
  /** Monthly price in cents. 0 = included at no charge. */
  monthlyPrice: number
  /**
   * Optional annual price override in cents.
   * Null = use monthlyPrice × 12 (no annual discount on this feature).
   */
  annualPrice: number | null
  /** true = feature is priced at 0 even in composable subscriptions */
  isIncludedInBase: boolean
  /** Display category for grouping in the pricing calculator UI */
  pricingCategory: PricingCategory | null
  /** Display ordering within the category */
  sortOrder: number
  /** Whether the feature is available for customer self-selection */
  isSelectableByCustomer: boolean
}

// ---------------------------------------------------------------------------
// FeatureBundleVersionDTO
// A bundle's discount terms for a specific catalog version.
// ---------------------------------------------------------------------------
export type FeatureBundleVersionDTO = {
  bundleId: string
  bundleKey: string
  bundleLabel: string
  /** Feature keys that are part of this bundle */
  featureKeys: CapabilityKey[]
  pricingType: BundlePricingType
  /**
   * Interpretation depends on pricingType:
   *   PERCENTAGE_DISCOUNT → basis points (1500 = 15%)
   *   FIXED_PRICE         → total cents
   *   FLAT_DISCOUNT       → cents subtracted
   */
  discountValue: number
  /** Min number of bundle items that must be in selection to qualify. 0 = require all. */
  minimumItems: number
}

// ---------------------------------------------------------------------------
// FeatureDependencyDTO
// A single dependency edge in the feature dependency graph.
// ---------------------------------------------------------------------------
export type FeatureDependencyDTO = {
  featureKey: CapabilityKey
  dependsOnKey: CapabilityKey
}

// ---------------------------------------------------------------------------
// PricingCatalogDTO
// The full catalog data assembled by PricingCatalogRepository.
// This is everything PricingEngine needs to perform a calculation.
// ---------------------------------------------------------------------------
export type PricingCatalogDTO = {
  id: string
  version: number
  label: string
  /** All feature prices in this catalog version */
  featurePrices: FeaturePriceDTO[]
  /** All bundle versions in this catalog */
  bundleVersions: FeatureBundleVersionDTO[]
  /** Full dependency graph */
  dependencies: FeatureDependencyDTO[]
}

// ---------------------------------------------------------------------------
// PricingConfig
// Policy configuration injected by the Application Layer.
// Never fetched inside the engine — always passed in as a plain object.
// ---------------------------------------------------------------------------
export type PricingConfig = {
  /** Extra monthly charge per branch (cents). 0 = no branch surcharge. */
  branchMonthlyRate: number
  /** 0 = unlimited feature selections. */
  maxFeatures: number
  /** Annual discount in basis points (e.g. 1000 = 10%). 0 = no annual discount. */
  annualDiscountPct: number
  /** Tax rate in basis points (e.g. 1200 = 12% VAT). 0 = no tax. */
  taxRate: number
  /** Number of days a quote is valid before expiry. */
  quoteValidityDays: number
  /** Partner/reseller margin added to catalog price (basis points). 0 = standard pricing. */
  partnerMarginPct: number
  /** Whether promotional discount codes are active. */
  promoCodeEnabled: boolean
}

// ---------------------------------------------------------------------------
// PricingInput
// The selection submitted to PricingEngine.calculate() by the UI or a job.
// ---------------------------------------------------------------------------
export type PricingInput = {
  /** The business requesting the quote */
  businessId: string
  /** The feature keys the business wants to activate */
  selectedFeatureKeys: CapabilityKey[]
  /** true = calculate annual pricing alongside monthly */
  requestAnnual: boolean
  /** Number of branches (used for branch surcharge calculation) */
  branchCount: number
  /**
   * Optional promo discount in basis points.
   * Only applied when config.promoCodeEnabled = true.
   */
  promoDiscountPct?: number
  /**
   * Per-feature negotiated price overrides (enterprise/partner quotes).
   * Key = featureKey, value = negotiated monthly price in cents.
   * When provided, the engine uses this price instead of catalog price.
   */
  negotiatedPrices?: Partial<Record<CapabilityKey, number>>
  /**
   * ISO timestamp of when the calculation is being performed.
   * Injected by the Application Layer — engine never calls new Date() internally.
   */
  calculatedAt: string
}

// ---------------------------------------------------------------------------
// PricingStrategy
// Identifies which PricingEngine strategy to invoke.
// ---------------------------------------------------------------------------
export const PricingStrategy = {
  FLAT_SUBSCRIPTION: 'FLAT_SUBSCRIPTION',
  FEATURE_BASED: 'FEATURE_BASED',
  ENTERPRISE: 'ENTERPRISE',
  PARTNER_RESELLER: 'PARTNER_RESELLER',
  PROMOTIONAL: 'PROMOTIONAL',
} as const
export type PricingStrategy = (typeof PricingStrategy)[keyof typeof PricingStrategy]

// ---------------------------------------------------------------------------
// QuoteLineItemDTO
// A single line on a generated PricingQuote.
// ---------------------------------------------------------------------------
export type QuoteLineItemDTO = {
  lineType: QuoteLineType
  featureKey: CapabilityKey | null
  description: string
  quantity: number
  /** Cents. Negative for discount lines. */
  unitAmount: number
  /** quantity × unitAmount */
  lineAmount: number
  /** Optional negotiated override (enterprise/partner quotes) */
  negotiatedPrice: number | null
  sortOrder: number
}

// ---------------------------------------------------------------------------
// BusinessSubscriptionFeatureDTO
// Snapshot written to BusinessSubscriptionFeature at quote conversion time.
// ---------------------------------------------------------------------------
export type BusinessSubscriptionFeatureDTO = {
  subscriptionId: string
  featureKey: CapabilityKey
  snapshotPrice: number
  catalogVersion: number
}
