/**
 * ai-adapter-interface.ts — AI seam type definitions + null implementation (Phase 6)
 *
 * This file is the seam. It defines what an AI adapter must provide to the
 * BOS intelligence layer. No model is plugged in; the null implementation
 * returns empty results for all operations.
 *
 * Architecture:
 *   - The interface is pure: all methods are async functions over plain data.
 *   - No model, SDK, or external dependency is imported here.
 *   - When a real ML integration is built, it creates a concrete class
 *     implementing AIAdapter and passes it to registerAIAdapter().
 *   - All downstream code calls getAIAdapter() — the swap is transparent.
 *
 * Scope (Phase 6):
 *   - Type definitions only.
 *   - NullAIAdapter is the only active implementation.
 *   - Remove all detailed AI documentation from architecture docs;
 *     this file is the canonical reference for the AI contract.
 *
 * When a real adapter is built (Phase 7+):
 *   1. Create a new class implementing AIAdapter
 *   2. Call registerAIAdapter(new MyAdapter()) at startup
 *   3. No other code changes are needed — getAIAdapter() returns the new instance
 */

import type { BusinessCharacteristics } from '../onboarding/types'
import type { BusinessUsageSummaryData } from './types'

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/**
 * Everything the AI layer needs to produce a characteristics inference.
 * Plain data — no Prisma types, no DB references.
 */
export type AICharacteristicsInput = {
  /** Current business characteristics from the latest recalculation */
  characteristics: BusinessCharacteristics
  /** Latest usage summary counts */
  usageSummary: BusinessUsageSummaryData
  /** Free-text description of the business (from onboarding or profile editor) */
  businessDescription?: string
}

/**
 * AI-inferred characteristic values.
 * The engine merges these at the lowest priority (AI_INFERENCE source).
 * Human observations always win over AI inferences.
 */
export type AICharacteristicsInference = {
  /**
   * Partial characteristic overrides.
   * Only fields the model is confident about should be included.
   * Fields not included are left at their current source value.
   */
  inferences: Partial<BusinessCharacteristics>
  /**
   * Per-field confidence scores (0.0–1.0).
   * The engine uses these as the confidence value for the AI_INFERENCE source.
   */
  confidences: Partial<Record<keyof BusinessCharacteristics, number>>
  /** Plain-language explanation of the inference (for the Business Profile editor) */
  reasoning?: string
}

/**
 * Input for the capability recommendation hint.
 * The AI adapter can suggest a recommendation reason that is more natural
 * than the booster-label-based reason the engine builds by default.
 */
export type AIRecommendationHintInput = {
  capabilityId: string
  businessDescription?: string
  characteristics: BusinessCharacteristics
}

export type AIRecommendationHint = {
  /** An improved "why is this shown?" reason string, or null if no improvement */
  reason: string | null
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * The AI adapter contract.
 *
 * Implementors must be safe to call in parallel (stateless or thread-safe).
 * All methods return plain data — no streaming, no side effects.
 */
export interface AIAdapter {
  /**
   * Infers missing or uncertain business characteristics from available signals.
   * Called by CharacteristicsEngine after all rule-based sources are merged,
   * at the lowest-priority AI_INFERENCE source level.
   *
   * Must not throw — return empty inferences on failure.
   */
  inferCharacteristics(input: AICharacteristicsInput): Promise<AICharacteristicsInference>

  /**
   * Optionally improves the recommendation reason string shown to the user.
   * The engine uses the booster-label reason by default; this can override it
   * with a more natural explanation if the model is confident.
   *
   * Must not throw — return { reason: null } on failure.
   */
  getRecommendationHint(input: AIRecommendationHintInput): Promise<AIRecommendationHint>
}

// ---------------------------------------------------------------------------
// Null implementation (active in Phase 6)
// ---------------------------------------------------------------------------

/**
 * NullAIAdapter — returns empty results for all operations.
 * This is the only active implementation until a real model is integrated.
 * Using the null object pattern means all downstream code works unchanged
 * when a real adapter is eventually registered.
 */
export class NullAIAdapter implements AIAdapter {
  async inferCharacteristics(_input: AICharacteristicsInput): Promise<AICharacteristicsInference> {
    return { inferences: {}, confidences: {} }
  }

  async getRecommendationHint(_input: AIRecommendationHintInput): Promise<AIRecommendationHint> {
    return { reason: null }
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

let _adapter: AIAdapter = new NullAIAdapter()

/**
 * Register an AI adapter. Call once at startup before any engine runs.
 * Subsequent calls replace the previous adapter.
 *
 * @example
 * // At app startup (e.g. app-bootstrap.ts):
 * import { registerAIAdapter } from '@/lib/evolution/ai-adapter-interface'
 * import { MyOpenAIAdapter } from '@/lib/evolution/ai-openai-adapter'
 * registerAIAdapter(new MyOpenAIAdapter(process.env.OPENAI_API_KEY))
 */
export function registerAIAdapter(adapter: AIAdapter): void {
  _adapter = adapter
}

/**
 * Returns the currently registered AI adapter.
 * All engine code should call this rather than importing a concrete adapter.
 */
export function getAIAdapter(): AIAdapter {
  return _adapter
}
