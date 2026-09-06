/**
 * milestone-engine.ts — Pure growth milestone detection engine (Phase 5)
 *
 * Detects when a business crosses a meaningful growth threshold based on
 * the characteristics that changed during a recalculation cycle.
 *
 * Architecture:
 *   - Pure function — no IO, no side effects, deterministic output.
 *   - Input: the changedFields array from CharacteristicsEngineOutput
 *     + the full BusinessCharacteristics snapshot + the raw usage summary.
 *   - Output: array of MilestoneEvent values that the Application Layer
 *     (RecalculationJob) persists as GROWTH_MILESTONE notifications and
 *     emits as GROWTH_THRESHOLD_CROSSED events.
 *
 * The seven milestones (from Phase 5 roadmap):
 *   1. FIRST_EMPLOYEE_HIRED        — teamSize changed to 'small'
 *   2. TEAM_REACHED_SIX            — teamSize changed to 'medium'
 *   3. TRANSACTIONS_CROSS_100_DAY  — dailyTransactionVolume changed to 'high' (steady state)
 *   4. RAPID_GROWTH_DETECTED       — dailyTransactionVolume = 'high' via rapid-growth rule
 *   5. CATALOGUE_CROSSED_100_ITEMS — catalogueSize changed to 'large'
 *   6. SECOND_BRANCH_OPENED        — locationCount changed to 'multiple'
 *   7. ONE_YEAR_ANNIVERSARY        — based on businessCreatedAt (injected by caller)
 *
 * Milestones 1–6 are edge-triggered: they fire exactly once when the relevant
 * characteristic field changes to the target value, not on every recalculation
 * where the value is already at that level. The changedFields array enforces this.
 *
 * Milestone 7 (anniversary) is date-triggered: it fires when businessCreatedAt
 * is exactly one year before now (within a ±7-day window to tolerate job timing).
 *
 * Deduplication is the responsibility of the caller (RecalculationJob).
 * The engine does not read from the DB to check if a milestone was already
 * delivered — it only detects which milestones are triggered by this cycle.
 */

import type { BusinessCharacteristics } from '../onboarding/types'
import type { BusinessUsageSummaryData } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A growth milestone that was crossed in this recalculation cycle.
 */
export type MilestoneEvent = {
  /** Stable identifier for this milestone — used for deduplication */
  id: MilestoneId
  /** Notification title shown to the user */
  title: string
  /** Notification body shown to the user — business language, no module names */
  message: string
  /** Capabilities whose recommendation scores should be boosted */
  relatedCapabilityIds: string[]
}

export type MilestoneId =
  | 'FIRST_EMPLOYEE_HIRED'
  | 'TEAM_REACHED_SIX'
  | 'TRANSACTIONS_CROSS_100_DAY'
  | 'RAPID_GROWTH_DETECTED'
  | 'CATALOGUE_CROSSED_100_ITEMS'
  | 'SECOND_BRANCH_OPENED'
  | 'ONE_YEAR_ANNIVERSARY'

export type MilestoneEngineInput = {
  /** Fields that changed value in this recalculation (from CharacteristicsEngineOutput) */
  changedFields: Array<keyof BusinessCharacteristics>
  /** Full characteristics snapshot after recalculation */
  characteristics: BusinessCharacteristics
  /** Raw usage summary — used for the rapid-growth ratio check */
  usageSummary: BusinessUsageSummaryData
  /** When the business was created — used for anniversary detection */
  businessCreatedAt: Date
  /** Current time — injected so tests can use a fixed date */
  now: Date
}

// ---------------------------------------------------------------------------
// Milestone definitions
// ---------------------------------------------------------------------------

type MilestoneDefinition = {
  id: MilestoneId
  title: string
  message: string
  relatedCapabilityIds: string[]
  /** Returns true when this milestone has been crossed in this cycle */
  detect: (input: MilestoneEngineInput) => boolean
}

/**
 * The tolerance window (±days) for anniversary detection.
 * Allows the weekly job to fire within a week of the exact anniversary date.
 */
const ANNIVERSARY_WINDOW_DAYS = 7

const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    id: 'FIRST_EMPLOYEE_HIRED',
    title: 'Your first team member has joined',
    message: 'Now that you have a team, you can set up separate access levels and cash reconciliation to keep things running smoothly.',
    relatedCapabilityIds: ['MANAGE_EMPLOYEES', 'CREATE_TASK', 'CASH_RECONCILIATION'],
    detect: ({ changedFields, characteristics }) => changedFields.includes('teamSize') && characteristics.teamSize === 'small',
  },
  {
    id: 'TEAM_REACHED_SIX',
    title: 'Your team has reached 6 people',
    message: 'With a growing team, approval workflows and role-based access become important for accountability.',
    relatedCapabilityIds: ['MANAGE_EMPLOYEES', 'APPROVAL_WORKFLOW', 'CREATE_TASK'],
    detect: ({ changedFields, characteristics }) => changedFields.includes('teamSize') && characteristics.teamSize === 'medium',
  },
  {
    id: 'TRANSACTIONS_CROSS_100_DAY',
    title: "You're processing over 100 transactions a day",
    message: 'At this volume, sales reports and end-of-day summaries will save you significant time each week.',
    relatedCapabilityIds: ['VIEW_SALES_REPORTS', 'CASH_RECONCILIATION', 'VIEW_TRANSACTION_HISTORY'],
    detect: ({ changedFields, characteristics, usageSummary }) => {
      if (!changedFields.includes('dailyTransactionVolume')) return false
      if (characteristics.dailyTransactionVolume !== 'high') return false
      // Steady-state high volume — not the rapid-growth case.
      // Rapid growth also sets 'high' but is detected separately via the ratio check.
      // Here we check that the average itself crossed 100 (not just a doubling).
      return (usageSummary.avgDailyTransactions ?? 0) > 100
    },
  },
  {
    id: 'RAPID_GROWTH_DETECTED',
    title: 'Your transaction volume has doubled',
    message: 'Your business volume doubled compared to last month. Make sure your processes can handle the pace.',
    relatedCapabilityIds: ['MANAGE_INVENTORY', 'VIEW_SALES_REPORTS', 'MANAGE_EMPLOYEES'],
    detect: ({ changedFields, characteristics, usageSummary }) => {
      if (!changedFields.includes('dailyTransactionVolume')) return false
      if (characteristics.dailyTransactionVolume !== 'high') return false
      // Rapid growth: current period ≥ 2× previous, both ≥ 10
      const current = usageSummary.transactionsLast30Days ?? 0
      const prev = usageSummary.transactionsPrev30Days ?? 0
      return current >= 10 && prev >= 10 && current >= prev * 2
    },
  },
  {
    id: 'CATALOGUE_CROSSED_100_ITEMS',
    title: 'Your product catalogue has grown past 100 items',
    message: 'With over 100 products, catalogue organization and inventory tracking become much more valuable.',
    relatedCapabilityIds: ['MANAGE_INVENTORY', 'VIEW_INVENTORY_REPORTS', 'MANAGE_CATEGORIES'],
    detect: ({ changedFields, characteristics }) => changedFields.includes('catalogueSize') && characteristics.catalogueSize === 'large',
  },
  {
    id: 'SECOND_BRANCH_OPENED',
    title: "You've opened a second location",
    message: 'Multi-branch businesses benefit from stock transfers, consolidated reporting, and branch-level access controls.',
    relatedCapabilityIds: ['MANAGE_BRANCHES', 'STOCK_TRANSFER', 'VIEW_SALES_REPORTS'],
    detect: ({ changedFields, characteristics }) => changedFields.includes('locationCount') && characteristics.locationCount === 'multiple',
  },
  {
    id: 'ONE_YEAR_ANNIVERSARY',
    title: "You've been in business for a year",
    message: 'Congratulations on one year. Take a moment to review your setup — there may be capabilities that fit where you are now.',
    relatedCapabilityIds: [],
    detect: ({ businessCreatedAt, now }) => {
      const anniversaryDate = new Date(businessCreatedAt)
      anniversaryDate.setFullYear(anniversaryDate.getFullYear() + 1)
      const diffMs = Math.abs(now.getTime() - anniversaryDate.getTime())
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      return diffDays <= ANNIVERSARY_WINDOW_DAYS
    },
  },
]

// ---------------------------------------------------------------------------
// Main engine function
// ---------------------------------------------------------------------------

/**
 * Detects which growth milestones were crossed in this recalculation cycle.
 *
 * @param input - Changed fields, current characteristics, usage summary, and timing
 * @returns Array of triggered milestone events (may be empty)
 */
export function detectMilestones(input: MilestoneEngineInput): MilestoneEvent[] {
  const triggered: MilestoneEvent[] = []

  for (const def of MILESTONE_DEFINITIONS) {
    if (def.detect(input)) {
      triggered.push({
        id: def.id,
        title: def.title,
        message: def.message,
        relatedCapabilityIds: def.relatedCapabilityIds,
      })
    }
  }

  return triggered
}

/**
 * Returns the full set of milestone definitions.
 * Exported for use in tests and the CAPABILITY_GUIDE.
 */
export function getAllMilestoneDefinitions(): ReadonlyArray<Readonly<MilestoneDefinition>> {
  return MILESTONE_DEFINITIONS
}
