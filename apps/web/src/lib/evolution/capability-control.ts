/**
 * capability-control.ts — Application Layer: user-directed capability state changes (Phase 3a)
 *
 * Owns all IO for capability lifecycle management:
 *   - Reads `BusinessCapabilityState` from DB
 *   - Validates the lifecycle transition (delegates to capability-lifecycle.ts)
 *   - Applies config outputs via rootPrisma for enable/accept/restore
 *   - Applies rollback outputs for pause
 *   - Writes the new state back to BusinessCapabilityState
 *   - Schedules a characteristics recalculation after significant changes
 *   - Emits CAPABILITY_STATE_CHANGED via BusinessEventBus
 *
 * Public API:
 *   accept(businessId, capabilityId, actorId)  — RECOMMENDED â†’ ENABLED + apply outputs
 *   enable(businessId, capabilityId, actorId)  — HIDDEN|RECOMMENDED â†’ ENABLED + apply outputs
 *   pause(businessId, capabilityId, actorId)   — ENABLED|CONFIGURED â†’ PAUSED + rollback outputs
 *   restore(businessId, capabilityId, actorId) — PAUSED â†’ ENABLED + re-apply outputs
 *   dismiss(businessId, capabilityId, actorId) — RECOMMENDED â†’ HIDDEN (30-day cooldown)
 *   advance(businessId, capabilityId)          — ENABLED â†’ CONFIGURED (system-triggered)
 *
 * Error model:
 *   All methods return `OperationResult` — never throw to the caller.
 *   Invalid transitions return `{ ok: false, code: 'INVALID_TRANSITION' }`.
 *   Missing capability state returns `{ ok: false, code: 'NOT_FOUND' }`.
 *   Always-on capabilities cannot be paused — returns `{ ok: false, code: 'PRECONDITION_FAILED' }`.
 *
 * Architecture:
 *   - Uses rootPrisma for all DB writes (BusinessCapabilityState + Configuration).
 *   - Config outputs are written as Configuration rows at BUSINESS scope.
 *   - Does not call EntitlementEngine — that is runtime access gating, not setup.
 */

import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import type { ConfigurationKey } from 'prisma/generated/prisma/enums'
import { CAPABILITY_REGISTRY } from '../onboarding/capability-registry'
import { DEFAULT_CHARACTERISTICS } from '../onboarding/defaults'
import type { CapabilityDefinition, CapabilityOutput } from '../onboarding/types'
import { BusinessEventBus } from './business-event-bus'
import { assertTransition, type CapabilityLifecycleState, getTargetState, InvalidTransitionError, isAlwaysOn } from './capability-lifecycle'
import { projectToCharacteristics } from './characteristics-engine'
import { RecalculationPriority, recalculationQueue } from './recalculation-queue'

// ---------------------------------------------------------------------------
// Operation result type
// ---------------------------------------------------------------------------

export type ControlResultCode = 'OK' | 'NOT_FOUND' | 'INVALID_TRANSITION' | 'PRECONDITION_FAILED' | 'INTERNAL_ERROR'

export type ControlResult = { ok: true; newState: CapabilityLifecycleState } | { ok: false; code: Exclude<ControlResultCode, 'OK'>; reason: string }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Accept a recommendation: RECOMMENDED â†’ ENABLED.
 * Applies capability outputs to Configuration.
 */
export async function accept(businessId: string, capabilityId: string, actorId: string): Promise<ControlResult> {
  return transition(businessId, capabilityId, actorId, 'USER_ACCEPT', {
    applyOutputs: true,
    schedulePriority: RecalculationPriority.DEFERRED,
  })
}

/**
 * Manually enable a capability: HIDDEN|RECOMMENDED â†’ ENABLED.
 * Applies capability outputs to Configuration.
 */
export async function enable(businessId: string, capabilityId: string, actorId: string): Promise<ControlResult> {
  return transition(businessId, capabilityId, actorId, 'USER_ENABLE', {
    applyOutputs: true,
    schedulePriority: RecalculationPriority.DEFERRED,
  })
}

/**
 * Pause a capability: ENABLED|CONFIGURED â†’ PAUSED.
 * Applies rollback outputs to Configuration.
 * Always-on capabilities (checkout, products, etc.) cannot be paused.
 */
export async function pause(businessId: string, capabilityId: string, actorId: string): Promise<ControlResult> {
  const cap = findCapability(capabilityId)
  if (!cap) {
    return { ok: false, code: 'NOT_FOUND', reason: `Capability '${capabilityId}' not found in registry` }
  }

  if (isAlwaysOn(cap)) {
    return {
      ok: false,
      code: 'PRECONDITION_FAILED',
      reason: `'${capabilityId}' is an always-on capability and cannot be paused`,
    }
  }

  return transition(businessId, capabilityId, actorId, 'USER_PAUSE', {
    applyRollback: true,
    schedulePriority: RecalculationPriority.DEFERRED,
  })
}

/**
 * Restore a paused capability: PAUSED â†’ ENABLED.
 * Re-applies capability outputs to Configuration.
 */
export async function restore(businessId: string, capabilityId: string, actorId: string): Promise<ControlResult> {
  return transition(businessId, capabilityId, actorId, 'USER_RESTORE', {
    applyOutputs: true,
    schedulePriority: RecalculationPriority.DEFERRED,
  })
}

/**
 * Dismiss a recommendation: RECOMMENDED â†’ HIDDEN (30-day cooldown).
 * No config changes. Sets dismissedAt and increments dismissalCount.
 */
export async function dismiss(businessId: string, capabilityId: string, actorId: string): Promise<ControlResult> {
  return transition(businessId, capabilityId, actorId, 'USER_DISMISS', {
    setDismissedAt: true,
  })
}

/**
 * Advance a capability from ENABLED â†’ CONFIGURED.
 * Called by the RecalculationJob when configuredSignal returns true.
 * No config changes — the capability is already enabled and configured.
 */
export async function advance(businessId: string, capabilityId: string): Promise<ControlResult> {
  return transition(businessId, capabilityId, 'system', 'SYSTEM_ADVANCE', {})
}

// ---------------------------------------------------------------------------
// Core transition engine
// ---------------------------------------------------------------------------

type TransitionOptions = {
  applyOutputs?: boolean
  applyRollback?: boolean
  setDismissedAt?: boolean
  schedulePriority?: number
}

async function transition(
  businessId: string,
  capabilityId: string,
  actorId: string,
  trigger: Parameters<typeof getTargetState>[0],
  options: TransitionOptions,
): Promise<ControlResult> {
  try {
    // Step 1: Read current state from DB
    let stateRow = await rootPrisma.businessCapabilityState.findUnique({
      where: { businessId_capabilityId: { businessId, capabilityId } },
    })

    // If no row exists and the trigger is USER_ENABLE, auto-create a HIDDEN row
    // so the transition can proceed. This handles capabilities that were not
    // seeded at registration (e.g. capabilities the survey did not surface).
    if (!stateRow && trigger === 'USER_ENABLE') {
      stateRow = await rootPrisma.businessCapabilityState.create({
        data: {
          businessId,
          capabilityId,
          state: 'HIDDEN',
          confidence: 0,
          enteredBy: 'system',
          enteredAt: new Date(),
        },
      })
    }

    if (!stateRow) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        reason: `No capability state found for '${capabilityId}' on business '${businessId}'`,
      }
    }

    const currentState = stateRow.state as CapabilityLifecycleState

    // Step 2: Determine target state
    const targetState = getTargetState(trigger, currentState)
    if (!targetState) {
      return {
        ok: false,
        code: 'INVALID_TRANSITION',
        reason: `Trigger '${trigger}' is not applicable in state '${currentState}' for '${capabilityId}'`,
      }
    }

    // Step 3: Assert the transition is valid (belt-and-suspenders)
    try {
      assertTransition(capabilityId, currentState, targetState)
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return { ok: false, code: 'INVALID_TRANSITION', reason: err.message }
      }
      throw err
    }

    // Step 4: Find capability definition
    const cap = findCapability(capabilityId)

    // Step 5: Read current business characteristics for output functions
    // (needed because outputs are characteristic-aware, e.g. LOW_STOCK_THRESHOLD)
    const business = await rootPrisma.business.findUnique({
      where: { id: businessId },
      select: { livingCharacteristics: true },
    })

    const characteristics = resolveCharacteristics(business?.livingCharacteristics)

    // Step 6: Apply config changes
    if (cap && options.applyOutputs) {
      const outputs = cap.outputs(characteristics)
      await applyConfigOutputs(businessId, outputs, rootPrisma)
    }

    if (cap && options.applyRollback) {
      const rollbacks = cap.rollbackOutputs(characteristics)
      await applyConfigOutputs(businessId, rollbacks, rootPrisma)
    }

    // Step 7: Update BusinessCapabilityState
    const now = new Date()
    const stateHistory = buildUpdatedHistory(stateRow.stateHistory, currentState, targetState, actorId, now)

    await rootPrisma.businessCapabilityState.update({
      where: { businessId_capabilityId: { businessId, capabilityId } },
      data: {
        state: targetState,
        enteredAt: now,
        enteredBy: actorId,
        previousState: currentState,
        stateHistory,
        ...(options.setDismissedAt
          ? {
              dismissedAt: now,
              dismissalCount: { increment: 1 },
            }
          : {}),
        // Phase 6 analytics: stamp timestamps on first entry into key states.
        // Only set if the field is not already populated (use null-coalescing via
        // updateMany is not available here, so we use conditional spread):
        // recommendedAt — set when capability first enters RECOMMENDED
        // enabledAt     — set when capability first enters ENABLED
        ...(targetState === 'RECOMMENDED' && !stateRow.recommendedAt ? { recommendedAt: now } : {}),
        ...(targetState === 'ENABLED' && !stateRow.enabledAt ? { enabledAt: now } : {}),
      },
    })

    // Step 8: Schedule recalculation if needed
    if (options.schedulePriority !== undefined) {
      await recalculationQueue.schedule(businessId, options.schedulePriority)
    }

    // Step 9: Emit CAPABILITY_STATE_CHANGED
    await BusinessEventBus.emit({
      type: 'CAPABILITY_STATE_CHANGED',
      businessId,
      actorId,
      occurredAt: now,
      payload: {
        capabilityId,
        fromState: currentState,
        toState: targetState,
        trigger,
      },
    })

    return { ok: true, newState: targetState }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[CapabilityControl] transition failed (${capabilityId}):`, message)
    return { ok: false, code: 'INTERNAL_ERROR', reason: message }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCapability(capabilityId: string): CapabilityDefinition | undefined {
  return CAPABILITY_REGISTRY.find(c => c.id === capabilityId)
}

/**
 * Applies a set of config key=value pairs to the business's BusinessConfiguration table.
 * Uses upsert so re-enabling is idempotent.
 */
async function applyConfigOutputs(businessId: string, outputs: CapabilityOutput[], prisma: typeof rootPrisma): Promise<void> {
  for (const output of outputs) {
    if (!output.key) continue

    // Map the string key to the ConfigurationKey enum value — cast is safe because
    // capability outputs use the same key names as the ConfigurationKey enum.
    await prisma.configuration.upsert({
      where: {
        key_businessId_scope: {
          key: output.key as ConfigurationKey,
          businessId,
          scope: 'BUSINESS',
        },
      },
      update: { value: output.value },
      create: {
        key: output.key as ConfigurationKey,
        value: output.value,
        scope: 'BUSINESS',
        businessId,
      },
    })
  }
}

/**
 * Resolves the BusinessCharacteristics from a JSON living characteristics blob.
 * Falls back to DEFAULT_CHARACTERISTICS if the blob is absent or invalid.
 */
function resolveCharacteristics(livingRaw: unknown) {
  if (!livingRaw || typeof livingRaw !== 'object') return DEFAULT_CHARACTERISTICS
  return projectToCharacteristics(livingRaw as Record<string, unknown>)
}

/**
 * Appends an entry to the stateHistory JSON array.
 * Returns the updated array (suitable for Prisma Json field).
 */
function buildUpdatedHistory(
  existing: unknown,
  fromState: CapabilityLifecycleState,
  toState: CapabilityLifecycleState,
  changedBy: string,
  changedAt: Date,
): Array<{ state: string; changedAt: string; changedBy: string; fromState: string }> {
  const history: Array<{ state: string; changedAt: string; changedBy: string; fromState: string }> = Array.isArray(existing) ? (existing as typeof history) : []

  return [
    ...history,
    {
      state: toState,
      changedAt: changedAt.toISOString(),
      changedBy,
      fromState,
    },
  ]
}

// ---------------------------------------------------------------------------
// Phase 4: correctCharacteristic — ADMIN_DECISION source
// ---------------------------------------------------------------------------

export type CorrectCharacteristicResult = { ok: true } | { ok: false; code: 'INVALID_FIELD' | 'INTERNAL_ERROR'; reason: string }

/**
 * Allows a business admin to explicitly correct a characteristic.
 * Writes with ADMIN_DECISION source — the highest priority, cannot be
 * overridden by any automated observation rule.
 *
 * After writing, schedules an IMMEDIATE recalculation so the
 * RecommendationEngine re-evaluates based on the corrected value.
 *
 * @param businessId   - The business whose characteristic is being corrected
 * @param field        - The BusinessCharacteristics field key to correct
 * @param value        - The new value for the field
 * @param actorId      - The user making the correction (for audit trail)
 */
export async function correctCharacteristic(
  businessId: string,
  field: keyof import('../onboarding/types').BusinessCharacteristics,
  value: unknown,
  actorId: string,
): Promise<CorrectCharacteristicResult> {
  try {
    const now = new Date()

    // Read current living characteristics
    const business = await rootPrisma.business.findUnique({
      where: { id: businessId },
      select: { livingCharacteristics: true },
    })

    if (!business) {
      return { ok: false, code: 'INTERNAL_ERROR', reason: `Business '${businessId}' not found` }
    }

    // Parse existing living characteristics
    const existing: Record<string, unknown> =
      business.livingCharacteristics && typeof business.livingCharacteristics === 'object' ? (business.livingCharacteristics as Record<string, unknown>) : {}

    // Write the corrected value as an ADMIN_DECISION sourced value
    const correctedLiving = {
      ...existing,
      [field]: {
        value,
        source: 'ADMIN_DECISION',
        confidence: 1.0,
        observedAt: now.toISOString(),
        evidence: `Manually corrected by ${actorId}`,
      },
    }

    // Persist updated living characteristics
    await rootPrisma.business.update({
      where: { id: businessId },
      data: {
        livingCharacteristics: correctedLiving,
        lastCharacteristicsEvent: now,
      },
    })

    // Schedule IMMEDIATE recalculation — characteristics changed, re-evaluate everything
    await recalculationQueue.schedule(businessId, RecalculationPriority.IMMEDIATE)

    // Emit CONFIG_CHANGED so subscribers know characteristics were manually updated
    await BusinessEventBus.emit({
      type: 'CONFIG_CHANGED',
      businessId,
      actorId,
      occurredAt: now,
      payload: { field, value, source: 'ADMIN_DECISION' },
    })

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[CapabilityControl] correctCharacteristic failed (${field}):`, message)
    return { ok: false, code: 'INTERNAL_ERROR', reason: message }
  }
}
