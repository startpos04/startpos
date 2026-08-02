/**
 * enterprise-pricing-strategy.ts
 *
 * EnterprisePricingStrategy
 *
 * Extends FeatureBasedPricingStrategy with per-line negotiated price overrides.
 * Used for enterprise/custom contracts where a sales rep has agreed on a
 * specific price for one or more features.
 *
 * When a feature has a negotiatedPrice in the input:
 *   - That price is used instead of the catalog price for the line item
 *   - The negotiatedPrice is recorded on the PricingQuoteItem for audit
 *   - Bundle detection still uses the negotiated prices for saving calculations
 *
 * Architectural contract: zero infrastructure imports. Delegates to
 * FeatureBasedPricingStrategy — this strategy is a thin wrapper.
 */

import type { PricingCatalogDTO, PricingConfig, PricingInput } from '../types'
import { FeatureBasedPricingStrategy } from './feature-based-pricing-strategy'

export const EnterprisePricingStrategy = {
  /**
   * Calculate enterprise pricing with optional per-feature negotiated overrides.
   *
   * Negotiated prices are passed via input.negotiatedPrices.
   * FeatureBasedPricingStrategy already handles the override path —
   * this strategy documents the intent and validates the input shape.
   *
   * @param input   - Must include negotiatedPrices for any overridden features
   * @param config  - Policy configuration
   * @param catalog - Active catalog DTO
   */
  calculate(input: PricingInput, config: PricingConfig, catalog: PricingCatalogDTO) {
    // Validate: negotiated prices must be non-negative cents
    if (input.negotiatedPrices) {
      for (const [key, price] of Object.entries(input.negotiatedPrices)) {
        if (typeof price !== 'number' || price < 0) {
          throw new Error(`EnterprisePricingStrategy: negotiatedPrice for "${key}" must be a non-negative integer in cents, got ${price}`)
        }
      }
    }

    // Delegate entirely to FeatureBasedPricingStrategy — it already reads
    // input.negotiatedPrices and applies them at the line level.
    return FeatureBasedPricingStrategy.calculate(input, config, catalog)
  },
}
