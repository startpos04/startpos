/**
 * recommendation-analytics.ts — Recommendation analytics queries (Phase 6)
 *
 * Computes recommendation analytics from BusinessCapabilityState data.
 * Uses crudAPI (Priority 2) — server-authoritative reads with aggregation
 * that the local collection cannot satisfy directly.
 *
 * All functions are plain async functions. No createServerFn wrapper —
 * crudAPI has its own server function internally.
 *
 * Metrics tracked (per Phase 6 spec):
 *   - Recommendation acceptance rate per capability
 *   - Time from RECOMMENDED to ENABLED per capability (time-to-enable)
 *   - Dismissal rate per capability
 *   - Recommendation-to-abandonment rate (recommended, never re-engaged)
 *
 * These feed into threshold tuning decisions for Phase 7+.
 */

import { crudAPI } from '../prisma-client/crud-api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CapabilityRecommendationStats = {
  capabilityId: string
  /** Total number of businesses where this capability was ever RECOMMENDED */
  totalRecommended: number
  /** Number of businesses that accepted (moved to ENABLED or higher) */
  totalAccepted: number
  /** Number of businesses that dismissed (dismissalCount ≥ 1 and still not ENABLED) */
  totalDismissed: number
  /** Number that were recommended but are still not ENABLED or dismissed — stagnant */
  totalAbandoned: number
  /** Acceptance rate as a fraction 0.0–1.0 (accepted / recommended) */
  acceptanceRate: number
  /** Dismissal rate as a fraction 0.0–1.0 (dismissed / recommended) */
  dismissalRate: number
  /** Abandonment rate (neither accepted nor dismissed / recommended) */
  abandonmentRate: number
  /**
   * Average time in days from recommendedAt to enabledAt for accepted capabilities.
   * null when no acceptances exist.
   */
  avgDaysToEnable: number | null
}

export type RecommendationAnalyticsReport = {
  generatedAt: Date
  totalCapabilitiesAnalyzed: number
  stats: CapabilityRecommendationStats[]
}

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

/**
 * Fetches recommendation analytics across all businesses.
 *
 * Reads BusinessCapabilityState rows that have ever been in RECOMMENDED state
 * (identified by recommendedAt being non-null) and computes per-capability rates.
 *
 * @returns A report of per-capability recommendation statistics
 */
export async function fetchRecommendationAnalytics(): Promise<RecommendationAnalyticsReport> {
  // Fetch all states that were ever recommended (recommendedAt non-null)
  const result = await crudAPI.businessCapabilityState('findMany', {
    where: {
      recommendedAt: { not: null },
    },
    select: {
      capabilityId: true,
      state: true,
      recommendedAt: true,
      enabledAt: true,
      dismissedAt: true,
      dismissalCount: true,
      permanentlyIgnored: true,
    },
    orderBy: { capabilityId: 'asc' },
  })

  if (result.isErr()) throw new Error(result.error)

  const rows = result.value as Array<{
    capabilityId: string
    state: string
    recommendedAt: Date | null
    enabledAt: Date | null
    dismissedAt: Date | null
    dismissalCount: number
    permanentlyIgnored: boolean
  }>

  // Group by capabilityId
  const grouped = new Map<string, typeof rows>()
  for (const row of rows) {
    const existing = grouped.get(row.capabilityId) ?? []
    existing.push(row)
    grouped.set(row.capabilityId, existing)
  }

  const stats: CapabilityRecommendationStats[] = []

  for (const [capabilityId, capRows] of grouped) {
    const totalRecommended = capRows.length

    const acceptedRows = capRows.filter(r => r.state === 'ENABLED' || r.state === 'CONFIGURED' || r.state === 'PAUSED')
    const totalAccepted = acceptedRows.length

    const dismissedRows = capRows.filter(r => r.dismissalCount > 0 && r.state !== 'ENABLED' && r.state !== 'CONFIGURED' && r.state !== 'PAUSED')
    const totalDismissed = dismissedRows.length

    const totalAbandoned = totalRecommended - totalAccepted - totalDismissed

    // Average days from recommendedAt to enabledAt for accepted rows
    const enableTimes = acceptedRows
      .filter(r => r.recommendedAt !== null && r.enabledAt !== null)
      .map(r => (r.enabledAt!.getTime() - r.recommendedAt!.getTime()) / (1000 * 60 * 60 * 24))

    const avgDaysToEnable = enableTimes.length > 0 ? enableTimes.reduce((sum, v) => sum + v, 0) / enableTimes.length : null

    stats.push({
      capabilityId,
      totalRecommended,
      totalAccepted,
      totalDismissed,
      totalAbandoned,
      acceptanceRate: totalRecommended > 0 ? totalAccepted / totalRecommended : 0,
      dismissalRate: totalRecommended > 0 ? totalDismissed / totalRecommended : 0,
      abandonmentRate: totalRecommended > 0 ? Math.max(0, totalAbandoned) / totalRecommended : 0,
      avgDaysToEnable,
    })
  }

  // Sort by acceptance rate descending (highest performing first)
  stats.sort((a, b) => b.acceptanceRate - a.acceptanceRate)

  return {
    generatedAt: new Date(),
    totalCapabilitiesAnalyzed: stats.length,
    stats,
  }
}

/**
 * Fetches the bottom-N capabilities by acceptance rate.
 * Useful for quickly identifying candidates for threshold tuning in Phase 7.
 *
 * @param limit - Number of bottom performers to return (default: 5)
 */
export async function fetchLowAcceptanceCapabilities(limit = 5): Promise<CapabilityRecommendationStats[]> {
  const report = await fetchRecommendationAnalytics()
  return [...report.stats]
    .filter(s => s.totalRecommended >= 10) // Minimum sample size for meaningful rate
    .sort((a, b) => a.acceptanceRate - b.acceptanceRate)
    .slice(0, limit)
}
