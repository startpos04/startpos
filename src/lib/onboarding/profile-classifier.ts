/**
 * profile-classifier.ts — Pure function: BusinessCharacteristics + ResolvedCapability[] → OperationalProfile
 *
 * Classifies a business into one of nine operational profiles based on its
 * characteristics. Profiles drive opinionated defaults and recommendation
 * prioritization.
 *
 * Classification rules use first-match priority:
 *   MULTI_BRANCH_ENTERPRISE → FOOD_AND_BEVERAGE → WHOLESALE_DISTRIBUTION →
 *   SERVICE_BUSINESS → INVENTORY_INTENSIVE → QUICK_SERVICE → SIMPLE_RETAILER
 *   → LITE_POS → GENERAL
 *
 * Users never select a profile. The system classifies them.
 * If no rule matches, the fallback is GENERAL.
 *
 * Pure function: no IO, no side effects, deterministic output.
 */

import type { BusinessCharacteristics, OperationalProfile, ResolvedCapability } from './types'

/**
 * Classifies a business into an operational profile.
 *
 * @param characteristics - The business's characteristics
 * @param resolved - The resolved capabilities (used for some profile rules)
 * @returns The classified OperationalProfile
 */
export function classifyProfile(characteristics: BusinessCharacteristics, resolved: ResolvedCapability[]): OperationalProfile {
  const c = characteristics
  const enabledIds = new Set(resolved.filter(r => r.state === 'ENABLED').map(r => r.id))

  // ── MULTI_BRANCH_ENTERPRISE ──────────────────────────────────────────────────
  // Multiple locations, or expansion planned with a medium/large team
  if (c.locationCount === 'multiple' || (c.plansExpansion && (c.teamSize === 'medium' || c.teamSize === 'large'))) {
    return 'MULTI_BRANCH_ENTERPRISE'
  }

  // ── FOOD_AND_BEVERAGE ────────────────────────────────────────────────────────
  // Sells prepared food + deferred/mixed payment
  if (c.sellsPreparedFood && c.paymentTiming !== 'immediate') {
    return 'FOOD_AND_BEVERAGE'
  }

  // ── WHOLESALE_DISTRIBUTION ───────────────────────────────────────────────────
  // Sells raw materials, uses formal suppliers, strict inventory
  if (c.sellsRawMaterials && c.usesSuppliers && c.inventoryCriticality === 'strict') {
    return 'WHOLESALE_DISTRIBUTION'
  }

  // ── SERVICE_BUSINESS ─────────────────────────────────────────────────────────
  // Services only — no physical goods or raw materials, no inventory tracking
  if (c.sellsServices && !c.sellsPhysicalGoods && !c.sellsRawMaterials && !c.tracksInventory) {
    return 'SERVICE_BUSINESS'
  }

  // ── INVENTORY_INTENSIVE ──────────────────────────────────────────────────────
  // Physical goods with strict inventory and suppliers
  if (c.sellsPhysicalGoods && c.tracksInventory && c.inventoryCriticality === 'strict' && c.usesSuppliers) {
    return 'INVENTORY_INTENSIVE'
  }

  // ── QUICK_SERVICE ────────────────────────────────────────────────────────────
  // High volume, immediate payment, small or medium team
  if (
    (c.dailyTransactionVolume === 'high' || c.dailyTransactionVolume === 'medium') &&
    c.paymentTiming === 'immediate' &&
    (c.teamSize === 'small' || c.teamSize === 'medium')
  ) {
    return 'QUICK_SERVICE'
  }

  // ── LITE_POS ─────────────────────────────────────────────────────────────────
  // Solo, immediate payment, no inventory, no suppliers
  // Check before SIMPLE_RETAILER — LITE_POS is more specific (zero-inventory solo)
  if (c.teamSize === 'solo' && c.paymentTiming === 'immediate' && !c.tracksInventory && !c.usesSuppliers) {
    return 'LITE_POS'
  }

  // ── SIMPLE_RETAILER ──────────────────────────────────────────────────────────
  // Physical goods, immediate payment, solo or small team, no raw materials
  if (
    c.sellsPhysicalGoods &&
    !c.sellsRawMaterials &&
    c.paymentTiming === 'immediate' &&
    (c.teamSize === 'solo' || c.teamSize === 'small') &&
    !enabledIds.has('CREATE_ORDER')
  ) {
    return 'SIMPLE_RETAILER'
  }

  // ── GENERAL ───────────────────────────────────────────────────────────────────
  // Mixed or unclear signals — no dominant pattern
  return 'GENERAL'
}

/**
 * Returns the set of capabilities that are suppressed (not recommended) for a profile.
 * These capabilities are available but not pushed to the user's attention.
 */
export function getSuppressedCapabilities(profile: OperationalProfile): Set<string> {
  switch (profile) {
    case 'LITE_POS':
      return new Set(['MANAGE_INVENTORY', 'CREATE_PURCHASE', 'MANAGE_SUPPLIERS', 'CREATE_TASK', 'MANAGE_CUSTOMERS'])

    case 'SERVICE_BUSINESS':
      return new Set(['MANAGE_INVENTORY', 'CREATE_PURCHASE', 'MANAGE_SUPPLIERS'])

    case 'SIMPLE_RETAILER':
      return new Set(['CREATE_ORDER', 'EDIT_ACTIVE_ORDER'])

    case 'WHOLESALE_DISTRIBUTION':
      return new Set(['CREATE_ORDER', 'EDIT_ACTIVE_ORDER'])

    default:
      return new Set()
  }
}
