/**
 * tutorial-engine.ts
 *
 * TutorialEngine — pure domain object.
 *
 * Responsibilities:
 *   - evaluate(page, context) → TutorialDefinition[]
 *     Returns only tutorials whose condition is unmet for the given page.
 *   - evaluate('dashboard', context) → all tutorials across all groups
 *     Used by the SetupChecklist on /dashboard.
 *
 * Architectural contract (ADR-001):
 *   - No infrastructure imports, no collection reads, no HTTP calls.
 *   - Deterministic: same page + context → same output.
 *   - All data arrives as TutorialContext from the useTutorials hook.
 */

import { TUTORIAL_DEFINITIONS } from './tutorial-definitions'
import type { TutorialContext, TutorialDefinition } from './tutorial-types'

// ---------------------------------------------------------------------------
// TutorialEngine
// ---------------------------------------------------------------------------

export const TutorialEngine = {
  /**
   * Returns tutorials that should be shown for the given page.
   *
   * Pass 'dashboard' to get all tutorials across all groups (for SetupChecklist).
   * For any other page string, only tutorials whose `page` field matches are returned.
   *
   * A tutorial is included when:
   *   1. The page matches (or page === 'dashboard').
   *   2. The condition function returns true (condition NOT yet resolved).
   */
  evaluate(page: string, context: TutorialContext): TutorialDefinition[] {
    return TUTORIAL_DEFINITIONS.filter(def => {
      // Dashboard mode: return all tutorials regardless of page
      if (page === 'dashboard') {
        return def.condition(context)
      }

      // Page match: check if this tutorial applies to the current route
      const pages = Array.isArray(def.page) ? def.page : [def.page]
      if (!pages.includes(page)) return false

      return def.condition(context)
    })
  },

  /**
   * Returns ALL tutorial definitions (resolved and unresolved) for the given page.
   * Used by SetupChecklist to show the full list with resolved/unresolved states.
   */
  evaluateAll(page: string, context: TutorialContext): Array<TutorialDefinition & { resolved: boolean }> {
    const defs =
      page === 'dashboard'
        ? TUTORIAL_DEFINITIONS
        : TUTORIAL_DEFINITIONS.filter(def => {
            const pages = Array.isArray(def.page) ? def.page : [def.page]
            return pages.includes(page)
          })

    return defs.map(def => ({
      ...def,
      resolved: !def.condition(context),
    }))
  },
}
