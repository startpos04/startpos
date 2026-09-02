/**
 * get-inventory-mode.ts
 *
 * Utility to extract the current inventory mode from business characteristics.
 *
 * Used by inventory mutation callers to determine which policy to enforce.
 */

import { businessCollection } from '@platform/db/collections'
import { projectToCharacteristics } from '@/lib/evolution/characteristics-engine'
import { DEFAULT_CHARACTERISTICS } from '@/lib/onboarding/defaults'
import type { InventoryMode } from '@/lib/onboarding/types'

/**
 * Gets the inventory mode for a business.
 *
 * Reads from businessCollection.livingCharacteristics, projects to
 * BusinessCharacteristics, and returns inventoryCriticality.
 *
 * Falls back to DEFAULT_CHARACTERISTICS ('none') if business not found
 * or characteristics are invalid.
 *
 * @param businessId - The business ID
 * @returns The inventory mode ('none' | 'relaxed' | 'strict')
 */
export function getInventoryMode(businessId: string): InventoryMode {
  const business = businessCollection.get(businessId)

  if (!business?.livingCharacteristics || typeof business.livingCharacteristics !== 'object') {
    return DEFAULT_CHARACTERISTICS.inventoryCriticality
  }

  const characteristics = projectToCharacteristics(business.livingCharacteristics as Record<string, unknown>)
  return characteristics.inventoryCriticality
}
