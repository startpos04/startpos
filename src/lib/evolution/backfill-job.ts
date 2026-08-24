/**
 * backfill-job.ts — One-shot backfill for existing businesses (Phase 4)
 *
 * Populates `livingCharacteristics`, `currentProfile`, and `healthStage`
 * for every existing business that has `livingCharacteristics = NULL`.
 *
 * Run once on staging first, verify with spot-checks, then run on production.
 * Safe to re-run — businesses with existing `livingCharacteristics` are skipped.
 *
 * Backfill strategy per business:
 *   1. If `onboardingSurveyAnswers` exists → interpret survey + apply as SURVEY_ANSWER sources
 *   2. Else infer from current `Configuration` keys (IS_VAT_REGISTERED, ENABLE_ORDER, etc.)
 *   3. Read the latest `BusinessUsageSummary` (if any)
 *   4. Run `CharacteristicsEngine.compute()` to merge sources
 *   5. Classify profile and health stage
 *   6. Write all three fields, set `characteristicsVersion = 1`
 *
 * Architecture:
 *   - Uses rootPrisma (platform-level, no tenant isolation needed — this is an admin job).
 *   - Processes businesses in batches of BATCH_SIZE to avoid memory pressure.
 *   - Each business is committed independently — one failure does not block others.
 */

import { CAPABILITY_REGISTRY } from '../onboarding/capability-registry'
import { resolveCapabilities } from '../onboarding/capability-resolver'
import { DEFAULT_CHARACTERISTICS } from '../onboarding/defaults'
import { classifyProfile } from '../onboarding/profile-classifier'
import { interpretSurvey } from '../onboarding/survey-interpreter'
import type { BusinessCharacteristics } from '../onboarding/types'
import { prisma as rootPrisma } from '../prisma-client'
import { classifyHealthStage } from './business-health-model'
import { applysurveyAnswers, computeCharacteristics } from './characteristics-engine'
import type { CapabilityStateForScoring } from './recommendation-engine'
import type { BusinessUsageSummaryData, CharacteristicsEngineInput, LivingCharacteristics } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BackfillResult = {
  total: number
  processed: number
  skipped: number
  failed: number
  durationMs: number
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50

/**
 * Runs the backfill for all businesses with null livingCharacteristics.
 *
 * @param dryRun - If true, computes but does not write to DB (for spot-checking)
 * @returns Summary of the backfill run
 */
export async function runBackfill(dryRun = false): Promise<BackfillResult> {
  const startedAt = Date.now()
  const result: BackfillResult = {
    total: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
  }

  console.log(`[BackfillJob] Starting${dryRun ? ' (DRY RUN)' : ''}`)

  let cursor: string | undefined

  // Process in batches to avoid loading all businesses into memory
  while (true) {
    const batch = await rootPrisma.business.findMany({
      where: { livingCharacteristics: null, deletedAt: null },
      select: {
        id: true,
        onboardingSurveyAnswers: true,
        configurations: {
          select: { key: true, value: true, scope: true },
        },
      },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    })

    if (batch.length === 0) break
    result.total += batch.length
    cursor = batch[batch.length - 1]?.id

    for (const business of batch) {
      try {
        await backfillBusiness(business, dryRun)
        result.processed++
      } catch (err) {
        console.error(`[BackfillJob] Failed for ${business.id}:`, err instanceof Error ? err.message : err)
        result.failed++
      }
    }

    console.log(`[BackfillJob] Progress — processed: ${result.processed}, failed: ${result.failed}`)
  }

  result.durationMs = Date.now() - startedAt
  console.log(
    `[BackfillJob] Done${dryRun ? ' (DRY RUN)' : ''} — ` +
      `total: ${result.total}, processed: ${result.processed}, ` +
      `skipped: ${result.skipped}, failed: ${result.failed}, ` +
      `duration: ${result.durationMs}ms`,
  )
  return result
}

// ---------------------------------------------------------------------------
// Per-business backfill
// ---------------------------------------------------------------------------

type BusinessRow = {
  id: string
  onboardingSurveyAnswers: unknown
  configurations: Array<{ key: string; value: string; scope: string }>
}

async function backfillBusiness(business: BusinessRow, dryRun: boolean): Promise<void> {
  const now = new Date()

  // Step 1: Build initial living characteristics from survey or configuration
  let initial: LivingCharacteristics

  if (business.onboardingSurveyAnswers && typeof business.onboardingSurveyAnswers === 'object') {
    // Path A: survey answers present — interpret them
    const surveyChars = interpretSurvey(business.onboardingSurveyAnswers as Parameters<typeof interpretSurvey>[0])
    initial = applysurveyAnswers(surveyChars, now)
  } else {
    // Path B: no survey — infer from Configuration settings
    const chars = inferFromConfiguration(business.configurations)
    initial = applysurveyAnswers(chars, now)
  }

  // Step 2: Read latest usage summary
  const summaryRow = await rootPrisma.businessUsageSummary.findFirst({
    where: { businessId: business.id },
    orderBy: { periodEnd: 'desc' },
    select: { data: true },
  })

  const usageSummary = (summaryRow?.data ?? {}) as BusinessUsageSummaryData

  // Step 3: Run the engine
  const engineInput: CharacteristicsEngineInput = {
    current: initial,
    usageSummary,
    now,
  }

  const output = computeCharacteristics(engineInput)

  // Step 4: Classify profile and health
  const capabilityStateRows = await rootPrisma.businessCapabilityState.findMany({
    where: { businessId: business.id },
    select: { capabilityId: true, state: true, dismissedAt: true },
  })

  const capabilityStates: CapabilityStateForScoring[] = capabilityStateRows.map(r => ({
    capabilityId: r.capabilityId,
    state: r.state as CapabilityStateForScoring['state'],
    dismissedAt: r.dismissedAt,
  }))

  const resolved = resolveCapabilities(output.characteristics, CAPABILITY_REGISTRY)
  const profile = classifyProfile(output.characteristics, resolved)
  const healthStage = classifyHealthStage(output.characteristics, capabilityStates)

  if (dryRun) {
    console.log(`[BackfillJob] DRY RUN ${business.id} → profile: ${profile}, health: ${healthStage}`)
    return
  }

  // Step 5: Write to DB
  await rootPrisma.business.update({
    where: { id: business.id },
    data: {
      livingCharacteristics: output.updatedLiving as object,
      characteristicsVersion: 1,
      characteristicsComputedAt: now,
      currentProfile: profile,
      healthStage,
      lastCharacteristicsEvent: now,
    },
  })
}

// ---------------------------------------------------------------------------
// Configuration inference (Path B — no survey answers)
// ---------------------------------------------------------------------------

/**
 * Infers BusinessCharacteristics from existing Configuration settings.
 * Used for businesses that registered before the survey system existed.
 *
 * Only maps what can be reliably inferred from config keys.
 * Everything else falls back to DEFAULT_CHARACTERISTICS safe defaults.
 */
function inferFromConfiguration(configs: Array<{ key: string; value: string; scope: string }>): BusinessCharacteristics {
  const configMap = new Map(configs.map(c => [c.key, c.value]))

  const isVatRegistered = configMap.get('IS_VAT_REGISTERED') === 'true'
  const enableOrder = configMap.get('ENABLE_ORDER') === 'true'
  const enableOrderTab = configMap.get('ENABLE_ORDER_TAB') === 'true'
  const enableCashReconciliation = configMap.get('ENABLE_CASH_RECONCILIATION') === 'true'
  const enableTask = configMap.get('ENABLE_TASK') === 'true'
  const priceConfiguration = configMap.get('PRICE_CONFIGURATION') ?? 'EXCLUSIVE'

  return {
    ...DEFAULT_CHARACTERISTICS,
    isVatRegistered,
    taxDisplayMode: priceConfiguration === 'INCLUSIVE' ? 'inclusive' : 'exclusive',
    paymentTiming: enableOrder ? 'deferred' : 'immediate',
    requiresTableManagement: enableOrderTab,
    hasOrderCustomization: enableOrderTab,
    reconcilesCash: enableCashReconciliation,
    usesOperationalTasks: enableTask,
  }
}
