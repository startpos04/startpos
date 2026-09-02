/**
 * hint-engine.ts
 *
 * HintEngine — pure domain object for hint selection.
 *
 * Responsibilities:
 *   - selectHint(hints, logs, userId, frequencyDays, currentPage, now)
 *     Returns the highest-priority eligible hint, or null if none is due.
 *
 * Selection logic:
 *   1. Filter hints to: page === null (global) OR page === currentPage.
 *   2. Filter hints to: isActive === true.
 *   3. Exclude hints where the most recent HintLog.shownAt for this user
 *      is within frequencyDays of `now`.
 *   4. Sort remaining by sortOrder ASC.
 *   5. Return first result, or null.
 *
 * Architectural contract (ADR-001):
 *   - No infrastructure imports, no DB reads, no HTTP calls.
 *   - All data arrives as plain DTOs from the useHints hook / server function.
 *   - Designed to accept the full hint list so future prioritization strategies
 *     (weighted rotation, campaigns, user-segment targeting) are additive changes
 *     to the model and engine signature — not architectural rewrites.
 */

import type { HintDTO, HintLogDTO } from './hint-types'

export const HintEngine = {
  /**
   * Select the next eligible hint to show for the given page and user.
   *
   * @param hints       All active hints from the DB
   * @param logs        HintLog entries for this user
   * @param userId      Current user ID (used to find relevant logs)
   * @param frequencyDays  Days between showing the same hint to the same user
   * @param currentPage Current route path (e.g. '/pos')
   * @param now         Current timestamp (passed in — engine never calls new Date())
   * @returns The next eligible HintDTO, or null if none is due
   */
  selectHint(hints: HintDTO[], logs: HintLogDTO[], userId: string, frequencyDays: number, currentPage: string, now: Date): HintDTO | null {
    const frequencyMs = frequencyDays * 24 * 60 * 60 * 1000

    // Build a map: hintId → most recent shownAt (ms) for this user
    const lastShownMs = new Map<string, number>()
    for (const log of logs) {
      if (log.userId !== userId) continue
      const ms = new Date(log.shownAt).getTime()
      const existing = lastShownMs.get(log.hintId)
      if (existing === undefined || ms > existing) {
        lastShownMs.set(log.hintId, ms)
      }
    }

    const nowMs = now.getTime()

    const eligible = hints
      .filter(hint => {
        // Step 1+2: page match + active
        if (!hint.isActive) return false
        if (hint.page !== null && hint.page !== currentPage) return false

        // Step 3: frequency check — exclude if shown within frequencyDays
        const lastMs = lastShownMs.get(hint.id)
        if (lastMs !== undefined && nowMs - lastMs < frequencyMs) return false

        return true
      })
      // Step 4: sort by sortOrder ASC
      .sort((a, b) => a.sortOrder - b.sortOrder)

    // Step 5: return first eligible, or null
    return eligible[0] ?? null
  },
}
