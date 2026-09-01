/**
 * pricing-engine.ts
 *
 * PricingEngine — single facade for all composable pricing operations.
 *
 * This is the most complex domain engine in the codebase. It orchestrates
 * the five pricing strategies and provides graph utilities (dependency
 * resolution, cycle detection, bundle detection, grandfathered price
 * validation, and quote generation).
 *
 * Architectural contract (ADR-009, ADR-010 — hard compliance gate G10):
 *   - ZERO imports from PrismaClient, collections, better-auth, or any
 *     HTTP/framework package. CI enforcement required.
 *   - All data arrives as DTOs from PricingCatalogRepository.
 *   - calculatedAt is always injected by the caller — engine never calls
 *     new Date() internally.
 *   - PricingResult.grandTotal never includes oneTimeFees.
 *
 * Usage:
 *   const catalog = await repo.loadActive()
 *   const result = PricingEngine.calculate('FEATURE_BASED', input, catalog)
 *   if (!result.ok) return result
 *   const quote = PricingEngine.generateQuote(result, input)
 */

import type { CapabilityKey } from '@startpos-core/lib/entitlement/capability-keys'
import { type OperationResult, opFail, opOk } from '@startpos-core/lib/result'
import { EnterprisePricingStrategy } from './strategies/enterprise-pricing-strategy'
import { FeatureBasedPricingStrategy } from './strategies/feature-based-pricing-strategy'
import { type FlatSubscriptionInput, FlatSubscriptionPricingStrategy } from './strategies/flat-subscription-pricing-strategy'
import { PartnerResellerPricingStrategy } from './strategies/partner-reseller-pricing-strategy'
import { PromotionalPricingStrategy } from './strategies/promotional-pricing-strategy'
import type {
  BusinessSubscriptionFeatureDTO,
  FeatureBundleVersionDTO,
  FeatureDependencyDTO,
  PricingCatalogDTO,
  PricingConfig,
  PricingInput,
  QuoteLineItemDTO,
} from './types'
import { PricingStrategy } from './types'
import { type PriceChangeNotice, PriceChangeNoticeFactory } from './value-objects/price-change-notice'
import type { PricingResult } from './value-objects/pricing-result'

// ---------------------------------------------------------------------------
// PricingEngine
// ---------------------------------------------------------------------------

export const PricingEngine = {
  // -------------------------------------------------------------------------
  // calculate
  // Main entry point. Dispatches to the correct strategy and resolves
  // dependencies before delegating.
  //
  // Returns opFail if:
  //   - catalog is null (no active catalog)
  //   - dependency cycle detected
  //   - maxFeatures limit exceeded
  //   - unknown strategy
  // -------------------------------------------------------------------------
  calculate(strategy: PricingStrategy, input: PricingInput, catalog: PricingCatalogDTO, config: PricingConfig): OperationResult<PricingResult> {
    // Resolve transitive dependencies first
    const resolveResult = PricingEngine.resolveDependencies(input.selectedFeatureKeys as CapabilityKey[], catalog.dependencies)
    if (!resolveResult.ok) return resolveResult

    const resolvedInput: PricingInput = {
      ...input,
      selectedFeatureKeys: resolveResult.value as CapabilityKey[],
    }

    // Validate dependency graph for cycles
    const cycleResult = PricingEngine.validateDependencies(resolvedInput.selectedFeatureKeys as CapabilityKey[], catalog.dependencies)
    if (!cycleResult.ok) return cycleResult

    // Enforce max features cap
    if (config.maxFeatures > 0 && resolvedInput.selectedFeatureKeys.length > config.maxFeatures) {
      return opFail('VALIDATION_FAILED', `Selection exceeds the maximum of ${config.maxFeatures} features allowed on this plan.`)
    }

    try {
      let result: PricingResult

      switch (strategy) {
        case PricingStrategy.FLAT_SUBSCRIPTION: {
          // Flat requires additional fields — cast validated at call site
          result = FlatSubscriptionPricingStrategy.calculate(resolvedInput as FlatSubscriptionInput, config, catalog)
          break
        }
        case PricingStrategy.FEATURE_BASED: {
          result = FeatureBasedPricingStrategy.calculate(resolvedInput, config, catalog)
          break
        }
        case PricingStrategy.ENTERPRISE: {
          result = EnterprisePricingStrategy.calculate(resolvedInput, config, catalog)
          break
        }
        case PricingStrategy.PARTNER_RESELLER: {
          result = PartnerResellerPricingStrategy.calculate(resolvedInput, config, catalog)
          break
        }
        case PricingStrategy.PROMOTIONAL: {
          result = PromotionalPricingStrategy.calculate(resolvedInput, config, catalog)
          break
        }
        default: {
          const _exhaustive: never = strategy
          return opFail('VALIDATION_FAILED', `Unknown pricing strategy: ${_exhaustive}`)
        }
      }

      return opOk(result)
    } catch (err) {
      return opFail('PRECONDITION_FAILED', err instanceof Error ? err.message : 'PricingEngine.calculate failed')
    }
  },

  // -------------------------------------------------------------------------
  // resolveDependencies
  // Expands a feature selection to include all transitive dependencies.
  // Uses iterative BFS to avoid recursion depth limits.
  //
  // Returns opFail('PRECONDITION_FAILED') if a cycle is detected during expansion.
  // -------------------------------------------------------------------------
  resolveDependencies(selectedKeys: CapabilityKey[], dependencies: FeatureDependencyDTO[]): OperationResult<CapabilityKey[]> {
    if (dependencies.length === 0) return opOk([...selectedKeys])

    // Build adjacency map: featureKey → set of keys it directly depends on
    const depMap = new Map<CapabilityKey, Set<CapabilityKey>>()
    for (const dep of dependencies) {
      const key = dep.featureKey as CapabilityKey
      const depOn = dep.dependsOnKey as CapabilityKey
      if (!depMap.has(key)) depMap.set(key, new Set())
      depMap.get(key)!.add(depOn)
    }

    const resolved = new Set<CapabilityKey>(selectedKeys)
    const queue: CapabilityKey[] = [...selectedKeys]
    // Track visit depth to detect potential infinite expansion (cycle guard)
    const MAX_ITERATIONS = 1000
    let iterations = 0

    while (queue.length > 0) {
      if (++iterations > MAX_ITERATIONS) {
        return opFail('PRECONDITION_FAILED', 'Dependency resolution exceeded maximum iterations — likely a cycle in the FeatureDependency graph.')
      }

      const current = queue.shift()!
      const deps = depMap.get(current)
      if (!deps) continue

      for (const dep of deps) {
        if (!resolved.has(dep)) {
          resolved.add(dep)
          queue.push(dep)
        }
      }
    }

    return opOk([...resolved])
  },

  // -------------------------------------------------------------------------
  // validateDependencies
  // Performs a DFS-based cycle detection on the full dependency graph.
  // Must be called before any calculation to guarantee termination.
  //
  // Returns opFail if a cycle is found; opOk(void) if the graph is a valid DAG.
  // -------------------------------------------------------------------------
  validateDependencies(featureKeys: CapabilityKey[], dependencies: FeatureDependencyDTO[]): OperationResult<void> {
    if (dependencies.length === 0) return opOk()

    // Build adjacency map for the selected subgraph
    const depMap = new Map<CapabilityKey, CapabilityKey[]>()
    const keySet = new Set(featureKeys)

    for (const dep of dependencies) {
      const key = dep.featureKey as CapabilityKey
      const depOn = dep.dependsOnKey as CapabilityKey
      // Only consider edges relevant to the selected features
      if (!keySet.has(key) && !keySet.has(depOn)) continue
      if (!depMap.has(key)) depMap.set(key, [])
      depMap.get(key)!.push(depOn)
    }

    const WHITE = 0 // unvisited
    const GRAY = 1 // in current DFS path
    const BLACK = 2 // fully processed

    const color = new Map<CapabilityKey, 0 | 1 | 2>()

    function dfs(node: CapabilityKey): OperationResult<void> {
      color.set(node, GRAY)
      const neighbors = depMap.get(node) ?? []
      for (const neighbor of neighbors) {
        const c = color.get(neighbor) ?? WHITE
        if (c === GRAY) {
          return opFail('PRECONDITION_FAILED', `Cycle detected in FeatureDependency graph: "${node}" → "${neighbor}" creates a circular dependency.`)
        }
        if (c === WHITE) {
          const result = dfs(neighbor)
          if (!result.ok) return result
        }
      }
      color.set(node, BLACK)
      return opOk()
    }

    for (const key of featureKeys) {
      if ((color.get(key) ?? WHITE) === WHITE) {
        const result = dfs(key)
        if (!result.ok) return result
      }
    }

    return opOk()
  },

  // -------------------------------------------------------------------------
  // detectBundle
  // Returns the single qualifying bundle with the highest savings,
  // given the current feature selection and catalog bundle versions.
  // Returns null if no bundle qualifies.
  // -------------------------------------------------------------------------
  detectBundle(selectedKeys: CapabilityKey[], bundleVersions: FeatureBundleVersionDTO[], subtotal: number): FeatureBundleVersionDTO | null {
    const selectedSet = new Set(selectedKeys)
    let bestBundle: FeatureBundleVersionDTO | null = null
    let bestSaving = 0

    for (const bv of bundleVersions) {
      const matchCount = bv.featureKeys.filter(k => selectedSet.has(k)).length
      const required = bv.minimumItems > 0 ? bv.minimumItems : bv.featureKeys.length
      if (matchCount < required) continue

      const saving = computeBundleSaving(subtotal, bv)
      if (saving > bestSaving) {
        bestSaving = saving
        bestBundle = bv
      }
    }

    return bestBundle
  },

  // -------------------------------------------------------------------------
  // generateQuote
  // Converts a PricingResult into a set of PricingQuoteItem DTOs suitable
  // for persisting to the database. Also returns the quote header fields.
  //
  // The Application Layer handles the actual DB write — the engine only
  // constructs the data shape.
  // -------------------------------------------------------------------------
  generateQuote(
    result: PricingResult,
    input: PricingInput,
    catalogId: string,
    quoteValidityDays: number,
  ): {
    businessId: string
    catalogId: string
    subtotalMonthly: number
    discountAmount: number
    taxAmount: number
    grandTotal: number
    annualTotal: number | null
    annualSavings: number | null
    oneTimeFees: number
    validUntil: Date
    generatedBy: string | null
    items: QuoteLineItemDTO[]
  } {
    const validUntil = new Date(input.calculatedAt)
    validUntil.setDate(validUntil.getDate() + quoteValidityDays)

    return {
      businessId: input.businessId,
      catalogId,
      subtotalMonthly: result.subtotalMonthly,
      discountAmount: result.discountAmount,
      taxAmount: result.taxAmount,
      grandTotal: result.grandTotal,
      annualTotal: result.annualGrandTotal,
      annualSavings: result.annualSavings,
      oneTimeFees: result.oneTimeFees,
      validUntil,
      generatedBy: null, // Set by the Application Layer (userId or 'system')
      items: [...result.lineItems],
    }
  },

  // -------------------------------------------------------------------------
  // validateGrandfatheredPrices
  // Compares the prices snapshotted on BusinessSubscriptionFeature records
  // against the current active catalog.
  //
  // Returns a PriceChangeNotice for every feature whose catalog price has
  // changed since the snapshot was taken.
  //
  // Used by the composable-renewal-preview background job.
  // -------------------------------------------------------------------------
  validateGrandfatheredPrices(snapshots: BusinessSubscriptionFeatureDTO[], currentCatalog: PricingCatalogDTO): PriceChangeNotice[] {
    const notices: PriceChangeNotice[] = []
    const currentPriceMap = new Map(currentCatalog.featurePrices.map(fp => [fp.featureKey, fp]))

    for (const snapshot of snapshots) {
      const current = currentPriceMap.get(snapshot.featureKey)
      if (!current) continue // Feature removed from catalog — no notice

      const notice = PriceChangeNoticeFactory.create({
        featureKey: snapshot.featureKey,
        featureLabel: current.featureLabel,
        grandfatheredPrice: snapshot.snapshotPrice,
        currentCatalogPrice: current.monthlyPrice,
        snapshotCatalogVersion: snapshot.catalogVersion,
        currentCatalogVersion: currentCatalog.version,
      })

      if (notice) notices.push(notice)
    }

    return notices
  },
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function computeBundleSaving(subtotal: number, bv: FeatureBundleVersionDTO): number {
  switch (bv.pricingType) {
    case 'PERCENTAGE_DISCOUNT':
      return Math.round((subtotal * bv.discountValue) / 10000)
    case 'FLAT_DISCOUNT':
      return Math.min(bv.discountValue, subtotal)
    case 'FIXED_PRICE':
      return Math.max(0, subtotal - bv.discountValue)
    default:
      return 0
  }
}
