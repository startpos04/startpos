/**
 * platform-analytics.ts â€” Internal platform analytics queries (Phase 6)
 *
 * Admin-facing aggregation queries for the internal analytics dashboard.
 * All functions are plain async functions (crudAPI/coreAPI have their own
 * server functions internally â€” no createServerFn wrapper).
 *
 * Aggregations (per Phase 6 spec 6.3):
 *   - Health stage distribution across all businesses
 *   - Recommendation acceptance rate per capability (â†’ recommendation-analytics.ts)
 *   - Most common profiles at registration
 *   - Profile graduation frequency
 *   - Milestone frequency (GROWTH_THRESHOLD_CROSSED events by milestoneId)
 *
 * Data access: crudAPI for tenant data (Business, BusinessEventLog).
 * These are platform-level reporting queries â€” they read across all businesses.
 * They should only be called from admin-authenticated server paths.
 */

import { crudAPI } from '@/lib/prisma-client/crud-api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthStageDistribution = {
  stage: string
  count: number
  percentage: number
}

export type ProfileDistributionEntry = {
  profile: string
  count: number
  percentage: number
}

export type ProfileGraduationEntry = {
  fromProfile: string
  toProfile: string
  count: number
}

export type MilestoneFrequencyEntry = {
  milestoneId: string
  count: number
}

export type PlatformAnalyticsReport = {
  generatedAt: Date
  totalBusinesses: number
  healthStageDistribution: HealthStageDistribution[]
  onboardingProfileDistribution: ProfileDistributionEntry[]
  currentProfileDistribution: ProfileDistributionEntry[]
  milestoneFrequency: MilestoneFrequencyEntry[]
}

// ---------------------------------------------------------------------------
// Health stage distribution
// ---------------------------------------------------------------------------

/**
 * Returns the distribution of businesses across health stages.
 * Businesses with no health stage set (pre-Phase 4 backfill) are grouped
 * under 'UNKNOWN'.
 */
export async function fetchHealthStageDistribution(): Promise<HealthStageDistribution[]> {
  const result = await crudAPI.business('findMany', {
    select: { healthStage: true },
    where: { deletedAt: null },
  })

  if (result.isErr()) throw new Error(result.error)

  const rows = result.value as Array<{ healthStage: string | null }>
  const total = rows.length
  if (total === 0) return []

  const counts = new Map<string, number>()
  for (const row of rows) {
    const stage = row.healthStage ?? 'UNKNOWN'
    counts.set(stage, (counts.get(stage) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([stage, count]) => ({
      stage,
      count,
      percentage: Math.round((count / total) * 1000) / 10, // one decimal place
    }))
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------
// Profile distribution
// ---------------------------------------------------------------------------

/**
 * Returns the distribution of onboarding profiles (profile chosen at registration).
 * Tells you which profiles are most common among new businesses.
 */
export async function fetchOnboardingProfileDistribution(): Promise<ProfileDistributionEntry[]> {
  return fetchProfileDistribution('onboardingProfile')
}

/**
 * Returns the distribution of current profiles (after recalculation evolution).
 * Compare with onboarding distribution to see how businesses graduate over time.
 */
export async function fetchCurrentProfileDistribution(): Promise<ProfileDistributionEntry[]> {
  return fetchProfileDistribution('currentProfile')
}

async function fetchProfileDistribution(field: 'onboardingProfile' | 'currentProfile'): Promise<ProfileDistributionEntry[]> {
  const result = await crudAPI.business('findMany', {
    select: { [field]: true },
    where: { deletedAt: null, [field]: { not: null } },
  })

  if (result.isErr()) throw new Error(result.error)

  const rows = result.value as Array<Record<string, string | null>>
  const total = rows.length
  if (total === 0) return []

  const counts = new Map<string, number>()
  for (const row of rows) {
    const profile = row[field] ?? 'UNKNOWN'
    counts.set(profile, (counts.get(profile) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([profile, count]) => ({
      profile,
      count,
      percentage: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------
// Milestone frequency
// ---------------------------------------------------------------------------

/**
 * Returns how many times each growth milestone has been crossed across all businesses.
 * Reads from BusinessEventLog where type = 'GROWTH_THRESHOLD_CROSSED'.
 *
 * @param since - Optional start date to filter events (defaults to all time)
 */
export async function fetchMilestoneFrequency(since?: Date): Promise<MilestoneFrequencyEntry[]> {
  const result = await crudAPI.businessEventLog('findMany', {
    where: {
      type: 'GROWTH_THRESHOLD_CROSSED',
      ...(since ? { occurredAt: { gte: since } } : {}),
    },
    select: { payload: true },
  })

  if (result.isErr()) throw new Error(result.error)

  const rows = result.value as Array<{ payload: Record<string, unknown> | null }>

  const counts = new Map<string, number>()
  for (const row of rows) {
    const milestoneId = row.payload && typeof row.payload['milestoneId'] === 'string' ? row.payload['milestoneId'] : 'UNKNOWN'
    counts.set(milestoneId, (counts.get(milestoneId) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([milestoneId, count]) => ({ milestoneId, count }))
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------
// Composite report
// ---------------------------------------------------------------------------

/**
 * Fetches all platform analytics in parallel and returns a composite report.
 * Suitable for rendering the admin analytics dashboard in one server call.
 */
export async function fetchPlatformAnalyticsReport(): Promise<PlatformAnalyticsReport> {
  const [healthStageDistribution, onboardingProfileDistribution, currentProfileDistribution, milestoneFrequency, totalResult] = await Promise.all([
    fetchHealthStageDistribution(),
    fetchOnboardingProfileDistribution(),
    fetchCurrentProfileDistribution(),
    fetchMilestoneFrequency(),
    crudAPI.business('count', { where: { deletedAt: null } }),
  ])

  if (totalResult.isErr()) throw new Error(totalResult.error)

  return {
    generatedAt: new Date(),
    totalBusinesses: totalResult.value as number,
    healthStageDistribution,
    onboardingProfileDistribution,
    currentProfileDistribution,
    milestoneFrequency,
  }
}
