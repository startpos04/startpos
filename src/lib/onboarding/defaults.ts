/**
 * defaults.ts — Safe default BusinessCharacteristics
 *
 * Safe defaults always produce the most minimal configuration possible.
 * When a survey question is skipped or not reached (path pruned), the
 * corresponding characteristic resolves to its safe default here.
 *
 * Nothing is enabled that wasn't explicitly signalled.
 */

import type { BusinessCharacteristics } from './types'

/**
 * Safe defaults for all BusinessCharacteristics fields.
 *
 * Rules:
 *   - Default to the least capable / least invasive value
 *   - `sellsPhysicalGoods = true` — assume something is being sold (universal)
 *   - `handlesCash = true` — cash is the universal fallback payment method
 *   - Everything else defaults to minimal / false / 'none'
 */
export const DEFAULT_CHARACTERISTICS: BusinessCharacteristics = {
  // Scale
  dailyTransactionVolume: 'low',
  teamSize: 'solo',
  locationCount: 'one',

  // What is sold
  sellsPhysicalGoods: true, // assume something is being sold
  sellsPreparedFood: false,
  sellsServices: false,
  sellsRawMaterials: false,
  catalogueSize: 'small',
  hasProductVariants: false,
  hasProductComponents: false,
  hasPerishables: false,

  // Sales process
  paymentTiming: 'immediate',
  requiresTableManagement: false,
  hasOrderCustomization: false,
  offersDelivery: false,

  // Inventory
  tracksInventory: false,
  inventoryCriticality: 'none',
  hasMultipleStockLocations: false,
  usesSuppliers: false,
  requiresGoodsReceipt: false,
  hasRegularWaste: false,

  // Team and operations
  hasRoleSeparation: false,
  requiresApprovals: false,
  usesOperationalTasks: false,

  // Finance and compliance
  handlesCash: true, // cash is the universal fallback
  reconcilesCash: false,
  isVatRegistered: false,
  taxDisplayMode: 'exclusive',
  requiresOfficialReceipts: false,
  hasCorporateBuyers: false,

  // Customers
  tracksCustomers: false,
  hasLoyaltyIntent: false,

  // Growth
  plansExpansion: false,
  needsExternalIntegrations: false,

  // Intent fields (Phase 3b) — all default to false (not stated)
  intentToAddMoreStaff: false,
  intentToTrackInventory: false,
  intentToManageSuppliers: false,
  intentToOfferDelivery: false,
  intentToOpenMoreLocations: false,
  intentToIntegrateExternalSystems: false,

  // Batch preparation
  preparesBatches: false,
  preparesBatchesWithRecipes: false,
}
