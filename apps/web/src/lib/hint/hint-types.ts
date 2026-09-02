/**
 * hint-types.ts
 *
 * Shared types for the Hint system (Phase A).
 *
 * Hints live in the DB (managed by admin in Phase C).
 * HintLog records when each hint was shown to each user.
 * HintEngine selects the next eligible hint using these DTOs.
 */

// ---------------------------------------------------------------------------
// HintDTO — plain DTO representing a row from the `hints` table.
// ---------------------------------------------------------------------------
export interface HintDTO {
  id: string
  title: string
  body: string
  /** null = global; "/pos" = POS only; "/products" = products only */
  page: string | null
  isActive: boolean
  sortOrder: number
}

// ---------------------------------------------------------------------------
// HintLogDTO — plain DTO representing a row from `hint_logs`.
// Only the fields HintEngine needs are included.
// ---------------------------------------------------------------------------
export interface HintLogDTO {
  hintId: string
  userId: string
  /** ISO string of when this hint was last shown */
  shownAt: string
}
