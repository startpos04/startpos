/**
 * recalculation-queue-monitor.ts — Phase 7 production health monitoring
 *
 * Functions that read the CharacteristicsRecalculationQueue table to surface
 * operational health signals. Used by the Phase 7 performance baseline
 * (7.3) and ongoing production monitoring.
 *
 * All functions are plain async functions using rootPrisma directly.
 * No createServerFn wrapper — these are operator/admin tools called from
 * scheduled jobs or admin dashboards, not from user-facing server functions.
 *
 * Key health signals (per roadmap 7.3):
 *   - Queue depth: how many businesses are waiting for recalculation
 *   - Stale claims: entries that have been claimed (attempts > 0) but
 *     not yet processed — indicates job runner issues
 *   - Oldest pending entry age: how long the backlog has been building
 *   - Failed entries: entries that have exceeded MAX_ATTEMPTS
 *   - Throughput: entries processed in the last N minutes (derived from
 *     processedAt timestamps)
 */

import { prisma as rootPrisma } from '@platform/lib/prisma-client'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum attempts before an entry is considered permanently failed */
const MAX_ATTEMPTS = 3

/**
 * Target maximum age for any pending queue entry.
 * If the oldest pending entry is older than this, the job runner
 * may be stalled or under-provisioned.
 */
export const QUEUE_STALE_THRESHOLD_MINUTES = 10

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueHealthReport = {
  generatedAt: Date
  /** Total entries in the queue (pending + processed today) */
  totalEntries: number
  /** Entries with processedAt = null (awaiting processing) */
  pendingCount: number
  /** Pending entries with attempts > 0 (tried but not succeeded yet) */
  retryingCount: number
  /** Entries with attempts â‰¥ MAX_ATTEMPTS and processedAt still null */
  failedCount: number
  /** Age of the oldest pending entry in minutes (null if no pending entries) */
  oldestPendingAgeMinutes: number | null
  /** Whether the queue appears healthy (no stale entries, no failed entries) */
  isHealthy: boolean
  /** Plain-language status summary */
  status: string
}

export type QueueEntry = {
  id: string
  businessId: string
  priority: number
  scheduledAt: Date
  attempts: number
  lastError: string | null
}

// ---------------------------------------------------------------------------
// Queue health report
// ---------------------------------------------------------------------------

/**
 * Returns a health report for the recalculation queue.
 * Call from a scheduled health-check job or admin dashboard endpoint.
 */
export async function getQueueHealthReport(): Promise<QueueHealthReport> {
  const now = new Date()

  // Count all pending entries
  const pendingCount = await rootPrisma.characteristicsRecalculationQueue.count({
    where: { processedAt: null },
  })

  // Count retrying entries (pending + at least one attempt)
  const retryingCount = await rootPrisma.characteristicsRecalculationQueue.count({
    where: { processedAt: null, attempts: { gt: 0 } },
  })

  // Count permanently failed entries
  const failedCount = await rootPrisma.characteristicsRecalculationQueue.count({
    where: { processedAt: null, attempts: { gte: MAX_ATTEMPTS } },
  })

  // Total entries in the table
  const totalEntries = await rootPrisma.characteristicsRecalculationQueue.count()

  // Oldest pending entry
  const oldestPending = await rootPrisma.characteristicsRecalculationQueue.findFirst({
    where: { processedAt: null },
    orderBy: { scheduledAt: 'asc' },
    select: { scheduledAt: true },
  })

  const oldestPendingAgeMinutes = oldestPending ? (now.getTime() - oldestPending.scheduledAt.getTime()) / (1000 * 60) : null

  const isStale = oldestPendingAgeMinutes !== null && oldestPendingAgeMinutes > QUEUE_STALE_THRESHOLD_MINUTES

  const isHealthy = pendingCount === 0 || (!isStale && failedCount === 0)

  let status: string
  if (pendingCount === 0) {
    status = 'Queue is empty — all businesses are up to date.'
  } else if (failedCount > 0) {
    status = `${failedCount} entr${failedCount === 1 ? 'y' : 'ies'} have failed after ${MAX_ATTEMPTS} attempts and require operator inspection.`
  } else if (isStale) {
    status = `Oldest pending entry is ${oldestPendingAgeMinutes?.toFixed(1)} minutes old — exceeds the ${QUEUE_STALE_THRESHOLD_MINUTES}-minute target. Job runner may be stalled.`
  } else {
    status = `${pendingCount} entr${pendingCount === 1 ? 'y' : 'ies'} pending. Queue is processing normally.`
  }

  return {
    generatedAt: now,
    totalEntries,
    pendingCount,
    retryingCount,
    failedCount,
    oldestPendingAgeMinutes,
    isHealthy,
    status,
  }
}

// ---------------------------------------------------------------------------
// Failed entry inspector
// ---------------------------------------------------------------------------

/**
 * Returns all permanently failed queue entries (attempts â‰¥ MAX_ATTEMPTS).
 * Used by the operator to investigate and manually re-queue or clear failures.
 */
export async function getFailedQueueEntries(): Promise<QueueEntry[]> {
  const rows = await rootPrisma.characteristicsRecalculationQueue.findMany({
    where: { processedAt: null, attempts: { gte: MAX_ATTEMPTS } },
    orderBy: { scheduledAt: 'asc' },
    select: {
      id: true,
      businessId: true,
      priority: true,
      scheduledAt: true,
      attempts: true,
      lastError: true,
    },
  })

  return rows.map(r => ({
    id: r.id,
    businessId: r.businessId,
    priority: r.priority,
    scheduledAt: r.scheduledAt,
    attempts: r.attempts,
    lastError: r.lastError,
  }))
}

// ---------------------------------------------------------------------------
// Throughput measurement
// ---------------------------------------------------------------------------

/**
 * Counts entries processed in the last N minutes.
 * Call before and after a batch job run to measure throughput.
 *
 * @param windowMinutes - Look-back window in minutes (default: 60)
 */
export async function getProcessedCountInWindow(windowMinutes = 60): Promise<number> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000)
  return rootPrisma.characteristicsRecalculationQueue.count({
    where: {
      processedAt: { gte: cutoff },
    },
  })
}

// ---------------------------------------------------------------------------
// Manual re-queue helper
// ---------------------------------------------------------------------------

/**
 * Resets a failed queue entry so it will be retried on the next job run.
 * Clears the lastError and resets attempts to 0.
 * Use after investigating and fixing the underlying issue.
 *
 * @param id - The queue entry id to reset
 */
export async function resetFailedEntry(id: string): Promise<void> {
  await rootPrisma.characteristicsRecalculationQueue.update({
    where: { id },
    data: {
      attempts: 0,
      lastError: null,
      processedAt: null,
      scheduledAt: new Date(),
    },
  })
}
