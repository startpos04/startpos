/**
 * configuration-engine.ts — Pure function: resolved + profile + characteristics → BusinessConfiguration
 *
 * Consumes resolved capabilities and the operational profile to produce the
 * BusinessConfiguration object that complete-registration.ts persists.
 *
 * Config resolution logic:
 *   1. Start from universal safe defaults (all features off, EXCLUSIVE pricing)
 *   2. Apply all outputs from ENABLED capabilities (overrides defaults)
 *   3. Apply profile-level overrides (e.g. F&B forces INCLUSIVE when VAT present)
 *   4. Collect deferred capability IDs for progressive activation
 *
 * Plan suggestion is NOT in this engine — that belongs to PlanAdvisor (P2-3 fix).
 *
 * Pure function: no IO, no side effects, deterministic output.
 */

import { collectOutputs, getDeferredCapabilities, getEnabledCapabilities } from './capability-resolver'
import type { BusinessCharacteristics, BusinessConfiguration, CapabilityOutput, OperationalProfile, ResolvedCapability } from './types'

/**
 * Produces the complete BusinessConfiguration for a new business registration.
 *
 * @param characteristics - The business's characteristics (from SurveyInterpreter)
 * @param resolved - All resolved capabilities (from CapabilityResolver)
 * @param profile - The classified operational profile (from ProfileClassifier)
 * @returns BusinessConfiguration ready to persist to the database
 */
export function buildConfiguration(
  characteristics: BusinessCharacteristics,
  resolved: ResolvedCapability[],
  profile: OperationalProfile,
): BusinessConfiguration {
  // Step 1: Collect all outputs from ENABLED capabilities
  const capabilityOutputs = collectOutputs(resolved)

  // Step 2: Build output map — last write wins on key collisions
  const outputMap = new Map<string, string>()

  // Start from safe defaults (all capability features off)
  for (const [key, value] of SAFE_DEFAULTS) {
    outputMap.set(key, value)
  }

  // Apply capability outputs
  for (const output of capabilityOutputs) {
    outputMap.set(output.key, output.value)
  }

  // Step 3: Apply profile-level overrides
  applyProfileOverrides(outputMap, characteristics, profile)

  // Step 4: Build final output array
  const systemConfigs: CapabilityOutput[] = Array.from(outputMap.entries()).map(([key, value]) => ({
    key,
    value,
  }))

  // Step 5: Collect capability ID lists
  const enabled = getEnabledCapabilities(resolved)
  const deferred = getDeferredCapabilities(resolved)

  return {
    systemConfigs,
    enabledCapabilities: enabled.map(r => r.id),
    deferredCapabilities: deferred.map(r => r.id),
    operationalProfile: profile,
  }
}

// ---------------------------------------------------------------------------
// Safe defaults — applied before capability outputs override them
// Only config keys that capabilities can turn on/off need defaults here.
// ---------------------------------------------------------------------------

const SAFE_DEFAULTS: Array<[string, string]> = [
  ['ENABLE_ORDER', 'false'],
  ['ENABLE_ORDER_TAB', 'false'],
  ['ENABLE_CASH_RECONCILIATION', 'false'],
  ['ENABLE_TASK', 'false'],
  ['ENABLE_PRINT_RECEIPT', 'false'],
  ['PRICE_CONFIGURATION', 'EXCLUSIVE'],
  ['IS_VAT_REGISTERED', 'false'],
]

// ---------------------------------------------------------------------------
// Profile-level overrides
// ---------------------------------------------------------------------------

/**
 * Applies opinionated overrides based on the operational profile.
 * These override individual capability outputs when the profile demands it.
 */
function applyProfileOverrides(outputMap: Map<string, string>, characteristics: BusinessCharacteristics, profile: OperationalProfile): void {
  // F&B profile: force INCLUSIVE pricing when VAT-registered
  // (inclusive pricing implies tax is already in the displayed price)
  if (profile === 'FOOD_AND_BEVERAGE' && characteristics.isVatRegistered) {
    outputMap.set('PRICE_CONFIGURATION', 'INCLUSIVE')
    outputMap.set('IS_VAT_REGISTERED', 'true')
  }

  // VAT-registered businesses always have IS_VAT_REGISTERED=true
  if (characteristics.isVatRegistered) {
    outputMap.set('IS_VAT_REGISTERED', 'true')
    // Apply the tax display mode from characteristics
    if (characteristics.taxDisplayMode === 'inclusive') {
      outputMap.set('PRICE_CONFIGURATION', 'INCLUSIVE')
    }
  }

  // Wholesale + raw materials: force EXCLUSIVE pricing (wholesale uses tax-exclusive prices)
  if (profile === 'WHOLESALE_DISTRIBUTION') {
    outputMap.set('PRICE_CONFIGURATION', 'EXCLUSIVE')
  }

  // Conflict resolution: ENABLE_ORDER_TAB requires ENABLE_ORDER
  if (outputMap.get('ENABLE_ORDER_TAB') === 'true' && outputMap.get('ENABLE_ORDER') !== 'true') {
    outputMap.set('ENABLE_ORDER_TAB', 'false')
  }
}

/**
 * Returns a human-readable summary of what the configuration enables.
 * Useful for logging and debugging during shadow-running.
 */
export function summarizeConfiguration(config: BusinessConfiguration): Record<string, unknown> {
  const enabledConfigs = config.systemConfigs.filter(c => c.value === 'true').map(c => c.key)

  return {
    profile: config.operationalProfile,
    enabledCapabilities: config.enabledCapabilities,
    deferredCapabilities: config.deferredCapabilities,
    enabledConfigs,
    priceConfiguration: config.systemConfigs.find(c => c.key === 'PRICE_CONFIGURATION')?.value,
    isVatRegistered: config.systemConfigs.find(c => c.key === 'IS_VAT_REGISTERED')?.value,
  }
}
