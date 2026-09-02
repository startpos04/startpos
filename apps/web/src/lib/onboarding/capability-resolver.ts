/**
 * capability-resolver.ts — Pure function: BusinessCharacteristics + registry → ResolvedCapability[]
 *
 * Evaluates every capability in the registry against a business's characteristics
 * and determines which are ENABLED, DEFERRED, or NOT_APPLICABLE.
 *
 * Resolution algorithm for each capability:
 *   1. Call required(characteristics)
 *      → false: state = NOT_APPLICABLE, stop
 *   2. Compute confidence = average of all booster signal values
 *      → no boosters: confidence = 1.0 (binary — required gate is sufficient)
 *   3. If confidence ≥ threshold: state = ENABLED, apply outputs
 *   4. If confidence < threshold AND deferrable: state = DEFERRED
 *   5. If confidence < threshold AND NOT deferrable: state = NOT_APPLICABLE
 *
 * Pure function: no IO, no side effects, deterministic output.
 */

import type { BusinessCharacteristics, CapabilityDefinition, ResolvedCapability } from './types'

/**
 * Resolves all capabilities in the provided registry against the given characteristics.
 *
 * @param characteristics - The business's current characteristics
 * @param registry - The capability definitions to evaluate (defaults to CAPABILITY_REGISTRY)
 * @returns Array of ResolvedCapability for every entry in the registry
 */
export function resolveCapabilities(characteristics: BusinessCharacteristics, registry: CapabilityDefinition[]): ResolvedCapability[] {
  return registry.map(cap => resolveOne(cap, characteristics))
}

/**
 * Resolves a single capability against the given characteristics.
 */
export function resolveOne(cap: CapabilityDefinition, characteristics: BusinessCharacteristics): ResolvedCapability {
  // Step 1: Check required gate
  if (!cap.required(characteristics)) {
    return {
      id: cap.id,
      state: 'NOT_APPLICABLE',
      confidence: 0,
      outputs: [],
      rollbackOutputs: [],
    }
  }

  // Step 2: Compute confidence
  const confidence = computeConfidence(cap, characteristics)

  // Step 3 & 4 & 5: Determine state
  const isEnabled = confidence >= cap.threshold

  if (!isEnabled && !cap.deferrable) {
    return {
      id: cap.id,
      state: 'NOT_APPLICABLE',
      confidence,
      outputs: [],
      rollbackOutputs: [],
    }
  }

  const state = isEnabled ? 'ENABLED' : 'DEFERRED'
  const outputs = isEnabled ? cap.outputs(characteristics) : []
  const rollbackOutputs = cap.rollbackOutputs(characteristics)

  return {
    id: cap.id,
    state,
    confidence,
    outputs,
    rollbackOutputs,
  }
}

/**
 * Computes the confidence score for a capability given the characteristics.
 *
 * If no boosters are defined, confidence is 1.0 (binary — required gate suffices).
 * Otherwise confidence is the average of all booster signal values.
 */
export function computeConfidence(cap: CapabilityDefinition, characteristics: BusinessCharacteristics): number {
  if (cap.boosters.length === 0) return 1.0

  const total = cap.boosters.reduce((sum, b) => sum + b.signal(characteristics), 0)
  return total / cap.boosters.length
}

/**
 * Returns only the ENABLED capabilities from a resolved list.
 */
export function getEnabledCapabilities(resolved: ResolvedCapability[]): ResolvedCapability[] {
  return resolved.filter(r => r.state === 'ENABLED')
}

/**
 * Returns only the DEFERRED capabilities from a resolved list.
 */
export function getDeferredCapabilities(resolved: ResolvedCapability[]): ResolvedCapability[] {
  return resolved.filter(r => r.state === 'DEFERRED')
}

/**
 * Collects all unique CapabilityOutput entries from a set of resolved capabilities.
 * Deduplicates by key — last write wins (mirrors how BusinessConfiguration upserts work).
 */
export function collectOutputs(resolved: ResolvedCapability[]): Array<{ key: string; value: string }> {
  const map = new Map<string, string>()
  for (const r of resolved) {
    if (r.state === 'ENABLED') {
      for (const output of r.outputs) {
        map.set(output.key, output.value)
      }
    }
  }
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }))
}
