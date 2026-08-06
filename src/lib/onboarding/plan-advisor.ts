/**
 * plan-advisor.ts — Pure function: BusinessCharacteristics + OperationalProfile → SuggestedPlan
 *
 * Suggests the appropriate subscription plan based on business characteristics
 * and operational profile. This is a recommendation shown during the signup
 * flow — it does not enforce anything.
 *
 * Separated from ConfigurationEngine per Principal Architect Review (P2-3):
 * ConfigurationEngine is a capability configuration engine and must not know
 * about billing plan names.
 *
 * Plan logic:
 *   Enterprise  → multi-branch OR large team OR needs integrations
 *   Premium     → (tracks inventory AND uses suppliers) OR F&B profile
 *                 OR wholesale profile OR (medium team AND requires approvals)
 *   Basic       → everything else
 *
 * Pure function: no IO, no side effects, deterministic output.
 */

import type { BusinessCharacteristics, OperationalProfile, SuggestedPlan } from './types'

/**
 * Suggests an appropriate subscription plan based on business characteristics
 * and the classified operational profile.
 *
 * @param characteristics - The business's characteristics
 * @param profile - The classified operational profile
 * @returns The suggested plan name
 */
export function suggestPlan(characteristics: BusinessCharacteristics, profile: OperationalProfile): SuggestedPlan {
  const c = characteristics

  // Enterprise: multi-branch, large team, or needs external integrations
  if (c.locationCount === 'multiple' || c.teamSize === 'large' || c.needsExternalIntegrations || profile === 'MULTI_BRANCH_ENTERPRISE') {
    return 'Enterprise'
  }

  // Premium: inventory + suppliers, F&B, wholesale, or medium team with approvals
  if (
    (c.tracksInventory && c.usesSuppliers) ||
    profile === 'FOOD_AND_BEVERAGE' ||
    profile === 'WHOLESALE_DISTRIBUTION' ||
    profile === 'INVENTORY_INTENSIVE' ||
    (c.teamSize === 'medium' && c.requiresApprovals)
  ) {
    return 'Premium'
  }

  return 'Basic'
}
