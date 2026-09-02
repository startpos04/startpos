/**
 * price-change-notice.ts
 *
 * PriceChangeNotice â€” immutable value object produced by
 * PricingEngine.validateGrandfatheredPrices().
 *
 * Describes a feature whose catalog price has changed since the business's
 * subscription snapshot was taken (i.e. they locked in a price at quote-
 * conversion time but the catalog has since been updated).
 *
 * Used by the composable-renewal-preview background job to notify businesses
 * before their next renewal that their grandfathered price is ending.
 *
 * Architectural contract:
 *   - Zero infrastructure imports.
 *   - Immutable after construction â€” all fields are readonly.
 *   - All monetary amounts are integers in cents.
 */

import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'

// ---------------------------------------------------------------------------
// PriceChangeDirection
// ---------------------------------------------------------------------------
export const PriceChangeDirection = {
  INCREASE: 'INCREASE',
  DECREASE: 'DECREASE',
} as const
export type PriceChangeDirection = (typeof PriceChangeDirection)[keyof typeof PriceChangeDirection]

// ---------------------------------------------------------------------------
// PriceChangeNotice
// ---------------------------------------------------------------------------
export type PriceChangeNotice = {
  readonly featureKey: CapabilityKey
  readonly featureLabel: string
  /** The price locked in at subscription snapshot time (cents/month) */
  readonly grandfatheredPrice: number
  /** The current catalog price for this feature (cents/month) */
  readonly currentCatalogPrice: number
  /** Difference: currentCatalogPrice - grandfatheredPrice (signed, cents) */
  readonly priceDelta: number
  readonly direction: PriceChangeDirection
  /** The catalog version when the snapshot was taken */
  readonly snapshotCatalogVersion: number
  /** The current (latest active) catalog version */
  readonly currentCatalogVersion: number
}

// ---------------------------------------------------------------------------
// PriceChangeNoticeFactory
// ---------------------------------------------------------------------------
export const PriceChangeNoticeFactory = {
  /**
   * Build a PriceChangeNotice for a single feature.
   * Returns null if the price is unchanged.
   */
  create(params: {
    featureKey: CapabilityKey
    featureLabel: string
    grandfatheredPrice: number
    currentCatalogPrice: number
    snapshotCatalogVersion: number
    currentCatalogVersion: number
  }): PriceChangeNotice | null {
    const delta = params.currentCatalogPrice - params.grandfatheredPrice
    if (delta === 0) return null

    return {
      featureKey: params.featureKey,
      featureLabel: params.featureLabel,
      grandfatheredPrice: params.grandfatheredPrice,
      currentCatalogPrice: params.currentCatalogPrice,
      priceDelta: delta,
      direction: delta > 0 ? PriceChangeDirection.INCREASE : PriceChangeDirection.DECREASE,
      snapshotCatalogVersion: params.snapshotCatalogVersion,
      currentCatalogVersion: params.currentCatalogVersion,
    }
  },
}
