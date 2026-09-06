/**
 * recalculation-job.ts — Characteristics recalculation job runner (Phase 2)
 *
 * This is the Application Layer orchestrator for the CharacteristicsEngine.
 * It owns all IO: DB reads, DB writes, queue operations, event emission.
 * The CharacteristicsEngine itself is pure — it takes DTOs and returns results.
 *
 * Job flow per entry:
 *   1. Claim a batch from CharacteristicsRecalculationQueue
 *   2. For each entry:
 *      a. Read Business.livingCharacteristics (current state)
 *      b. Read the most recent BusinessUsageSummary for this business
 *      c. Assemble CharacteristicsEngineInput
 *      d. Call computeCharacteristics() — pure, no IO
 *      e. Write updatedLiving back to Business.livingCharacteristics
 *      f. Mark queue entry as processed
 *      g. Emit CHARACTERISTICS_UPDATED if any fields changed
 *   3. Log timing and result
 *
 * Error handling:
 *   - If any step throws for a business, markFailed() is called and processing
 *     continues with the next entry (no partial rollback).
 *   - After 3 failed attempts the entry is left for operator inspection.
 *
 * Architecture:
 *   - Uses rootPrisma (platform-level access to Business + queue tables).
 *   - CharacteristicsEngine is imported only for its pure computeCharacteristics().
 *   - BusinessEventBus is imported for post-write emission only.
 *   - No createServerFn wrapper — this is a background job, not a route handler.
 */

import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { CAPABILITY_REGISTRY } from '../onboarding/capability-registry'
import { resolveCapabilities } from '../onboarding/capability-resolver'
import { classifyProfile } from '../onboarding/profile-classifier'
import { BusinessEventBus } from './business-event-bus'
import { classifyHealthStage } from './business-health-model'
import { advance } from './capability-control'
import { computeCharacteristics } from './characteristics-engine'
import type { MilestoneEvent } from './milestone-engine'
import { detectMilestones } from './milestone-engine'
import { RecalculationPriority, recalculationQueue } from './recalculation-queue'
import type { CapabilityStateForScoring } from './recommendation-engine'
import type { BusinessUsageSummaryData, CharacteristicsEngineInput, LivingCharacteristics } from './types'

// ---------------------------------------------------------------------------
// Job configuration
// ---------------------------------------------------------------------------

const BATCH_SIZE = 10
const MAX_ATTEMPTS = 3

// ---------------------------------------------------------------------------
// Main job function
// ---------------------------------------------------------------------------

/**
 * Processes the next batch of pending recalculation queue entries.
 *
 * @param batchSize - Number of entries to claim and process (default: 10)
 * @returns Summary of the run
 */
export async function runRecalculationBatch(batchSize = BATCH_SIZE): Promise<RecalculationBatchResult> {
  const startedAt = Date.now()
  const result: RecalculationBatchResult = {
    claimed: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  }

  const entries = await recalculationQueue.claimBatch(batchSize)
  result.claimed = entries.length

  if (entries.length === 0) {
    result.durationMs = Date.now() - startedAt
    return result
  }

  console.log(`[RecalculationJob] Claimed ${entries.length} entries`)

  for (const entry of entries) {
    // Skip if too many attempts — leave for operator inspection
    if (entry.attempts >= MAX_ATTEMPTS) {
      console.warn(`[RecalculationJob] Skipping ${entry.businessId} — ${entry.attempts} failed attempts`)
      result.skipped++
      continue
    }

    const entryStart = Date.now()
    try {
      await processEntry(entry.id, entry.businessId)
      const entryMs = Date.now() - entryStart
      console.log(`[RecalculationJob] Processed ${entry.businessId} in ${entryMs}ms`)
      result.processed++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[RecalculationJob] Failed for ${entry.businessId}:`, errorMessage)
      await recalculationQueue.markFailed(entry.id, errorMessage)
      result.failed++
    }
  }

  result.durationMs = Date.now() - startedAt
  console.log(
    `[RecalculationJob] Done — processed: ${result.processed}, failed: ${result.failed}, skipped: ${result.skipped}, duration: ${result.durationMs}ms`,
  )
  return result
}

// ---------------------------------------------------------------------------
// Per-entry processing
// ---------------------------------------------------------------------------

async function processEntry(queueId: string, businessId: string): Promise<void> {
  const now = new Date()

  // Step 1: Read current Business state
  const business = await rootPrisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      livingCharacteristics: true,
      onboardingSurveyAnswers: true,
      currentProfile: true,
      createdAt: true,
    },
  })

  if (!business) {
    throw new Error(`Business ${businessId} not found`)
  }

  // Step 2: Read most recent usage summary
  const summaryRow = await rootPrisma.businessUsageSummary.findFirst({
    where: { businessId },
    orderBy: { periodEnd: 'desc' },
    select: { data: true },
  })

  const usageSummary = (summaryRow?.data ?? {}) as BusinessUsageSummaryData

  // Step 3: Assemble input — parse stored living characteristics from JSON
  const current = parseLivingCharacteristics(business.livingCharacteristics)

  const input: CharacteristicsEngineInput = {
    current,
    usageSummary,
    now,
  }

  // Step 4: Run the pure engine
  const output = computeCharacteristics(input)

  // Step 4b: Classify the operational profile and health stage
  const capabilityStateRows = await rootPrisma.businessCapabilityState.findMany({
    where: { businessId },
    select: { capabilityId: true, state: true, dismissedAt: true },
  })

  const capabilityStates: CapabilityStateForScoring[] = capabilityStateRows.map(r => ({
    capabilityId: r.capabilityId,
    state: r.state as CapabilityStateForScoring['state'],
    dismissedAt: r.dismissedAt,
  }))

  const resolved = resolveCapabilities(output.characteristics, CAPABILITY_REGISTRY)
  const newProfile = classifyProfile(output.characteristics, resolved)
  const newHealthStage = classifyHealthStage(output.characteristics, capabilityStates)

  const previousProfile = business.currentProfile ?? null
  const profileChanged = newProfile !== previousProfile

  // Step 5: Persist the updated living characteristics + profile + health stage
  await rootPrisma.business.update({
    where: { id: businessId },
    data: {
      livingCharacteristics: output.updatedLiving as object,
      characteristicsVersion: { increment: 1 },
      characteristicsComputedAt: now,
      currentProfile: newProfile,
      healthStage: newHealthStage,
      lastCharacteristicsEvent: now,
    },
  })

  // Step 6: Mark queue entry as processed
  await recalculationQueue.markProcessed(queueId)

  // Step 7: Emit CHARACTERISTICS_UPDATED if anything changed
  if (output.changedFields.length > 0) {
    await BusinessEventBus.emit({
      type: 'CHARACTERISTICS_UPDATED',
      businessId,
      occurredAt: now,
      payload: {
        changedFields: output.changedFields,
        dominantSourceChanged: output.dominantSourceChanged,
        version: 'unknown', // version is incremented in DB — we don't read it back here
        profileChanged,
        newProfile,
        newHealthStage,
      },
    })
  }

  // Step 7b: Profile graduation notification
  // Fires when the operational profile changes (e.g. LITE_POS â†’ SIMPLE_RETAILER).
  // Creates a system notification — never silently enables capabilities.
  if (profileChanged && previousProfile !== null) {
    await createProfileGraduationNotification(businessId, previousProfile, newProfile, now)
  }

  // Step 7c: Milestone detection (Phase 5)
  // Detects growth thresholds that were crossed in this recalculation cycle.
  // Only fires when changedFields is non-empty (no change â†’ no milestone check).
  if (output.changedFields.length > 0) {
    const milestones = detectMilestones({
      changedFields: output.changedFields,
      characteristics: output.characteristics,
      usageSummary,
      businessCreatedAt: business.createdAt,
      now,
    })

    if (milestones.length > 0) {
      await createMilestoneNotifications(businessId, milestones, now)
    }
  }

  // Step 8: Evaluate configuredSignal for ENABLED capabilities
  // Advances ENABLED â†’ CONFIGURED for any capability whose usage signal has fired.
  await advanceConfiguredCapabilities(businessId, usageSummary)
}

// ---------------------------------------------------------------------------
// Milestone notifications (Phase 5)
// ---------------------------------------------------------------------------

/**
 * Creates GROWTH_MILESTONE notifications for each triggered milestone.
 *
 * Deduplication: we check whether a notification for this milestone has
 * already been created within the last 30 days. This prevents re-firing if
 * the job processes the same business twice in a short window.
 *
 * Notification delivery: one notification per milestone per business.
 * The notification targets every OWNER/ADMIN member of the business so
 * that decision-makers see the milestone, not just the actor who triggered it.
 */
async function createMilestoneNotifications(businessId: string, milestones: MilestoneEvent[], now: Date): Promise<void> {
  try {
    // Look up the branch and admin/owner user IDs for this business
    const branch = await rootPrisma.branch.findFirst({
      where: { businessId },
      select: { id: true },
    })
    if (!branch) return

    const adminMembers = await rootPrisma.membership.findMany({
      where: {
        businessId,
        role: { in: ['OWNER', 'ADMIN'] },
        deletedAt: null,
      },
      select: { userId: true },
    })
    if (adminMembers.length === 0) return

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    for (const milestone of milestones) {
      // Deduplication: skip if this milestone notification was already created recently
      const alreadyCreated = await rootPrisma.notification.findFirst({
        where: {
          businessId,
          type: 'GROWTH_MILESTONE',
          title: milestone.title,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { id: true },
      })
      if (alreadyCreated) continue

      // Emit GROWTH_THRESHOLD_CROSSED event for this milestone
      await BusinessEventBus.emit({
        type: 'GROWTH_THRESHOLD_CROSSED',
        businessId,
        occurredAt: now,
        payload: {
          milestoneId: milestone.id,
          relatedCapabilityIds: milestone.relatedCapabilityIds,
        },
      })

      // Create one notification per admin/owner member
      for (const { userId } of adminMembers) {
        await rootPrisma.notification.create({
          data: {
            businessId,
            branchId: branch.id,
            userId,
            type: 'GROWTH_MILESTONE',
            title: milestone.title,
            message: milestone.message,
            priority: 'HIGH',
            metadata: {
              milestoneId: milestone.id,
              relatedCapabilityIds: milestone.relatedCapabilityIds,
            },
            createdAt: now,
          } as Parameters<typeof rootPrisma.notification.create>[0]['data'],
        })
      }
    }
  } catch (err) {
    // Milestone notification failure must not fail the recalculation
    console.warn(`[RecalculationJob] Milestone notifications failed (${businessId}):`, err)
  }
}

// ---------------------------------------------------------------------------
// Profile graduation notification
// ---------------------------------------------------------------------------

/**
 * Creates a system notification when the operational profile changes.
 * The notification links to Settings â†’ Capabilities where new capabilities
 * are visible. No capability is silently enabled.
 */
async function createProfileGraduationNotification(businessId: string, _fromProfile: string, _toProfile: string, now: Date): Promise<void> {
  try {
    // Look up the branchId for this business (notifications are branch-scoped)
    const branch = await rootPrisma.branch.findFirst({
      where: { businessId },
      select: { id: true },
    })

    if (!branch) return

    await rootPrisma.notification.create({
      data: {
        businessId,
        branchId: branch.id,
        type: 'SYSTEM_ALERT',
        title: 'Your business has grown',
        message: `New capabilities are now available for your business. Visit Settings â†’ Capabilities to see what's changed.`,
        createdAt: now,
      } as Parameters<typeof rootPrisma.notification.create>[0]['data'],
    })
  } catch (err) {
    // Notification creation failure should not fail the recalculation
    console.warn(`[RecalculationJob] Profile graduation notification failed (${businessId}):`, err)
  }
}

// ---------------------------------------------------------------------------
// configuredSignal advancement
// ---------------------------------------------------------------------------

/**
 * Evaluates configuredSignal for all ENABLED capabilities of the given business.
 * Advances ENABLED â†’ CONFIGURED for any capability whose signal has fired.
 *
 * This is called at the end of every recalculation so advancement happens
 * promptly after usage data is updated — no separate job needed.
 *
 * @param businessId - The business to check
 * @param usageSummary - The latest usage counts (already read by the caller)
 */
export async function advanceConfiguredCapabilities(businessId: string, usageSummary: BusinessUsageSummaryData): Promise<void> {
  // Read all ENABLED capability states for this business
  const enabledStates = await rootPrisma.businessCapabilityState.findMany({
    where: { businessId, state: 'ENABLED' },
    select: { capabilityId: true },
  })

  if (enabledStates.length === 0) return

  for (const { capabilityId } of enabledStates) {
    const cap = CAPABILITY_REGISTRY.find(c => c.id === capabilityId)
    if (!cap) continue

    // Check if the configuredSignal fires for this business's usage
    if (cap.configuredSignal(usageSummary)) {
      const result = await advance(businessId, capabilityId)
      if (!result.ok && result.code !== 'INVALID_TRANSITION') {
        // INVALID_TRANSITION is expected if the state was already CONFIGURED
        console.warn(`[RecalculationJob] advanceConfigured failed for ${capabilityId}: ${result.reason}`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scheduling helpers
// ---------------------------------------------------------------------------

/**
 * Schedules a recalculation for a business at the given priority.
 * Call this from server functions after significant events.
 *
 * @example
 * // After a supplier is added:
 * await scheduleRecalculation(businessId, RecalculationPriority.DEFERRED)
 */
export async function scheduleRecalculation(businessId: string, priority = RecalculationPriority.DEFERRED): Promise<void> {
  await recalculationQueue.schedule(businessId, priority)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parses the JSON blob stored in Business.livingCharacteristics.
 * Returns an empty LivingCharacteristics if the value is null or invalid.
 */
function parseLivingCharacteristics(raw: unknown): LivingCharacteristics {
  if (!raw || typeof raw !== 'object') return {}
  return raw as LivingCharacteristics
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type RecalculationBatchResult = {
  claimed: number
  processed: number
  failed: number
  skipped: number
  durationMs: number
}
