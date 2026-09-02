/**
 * event-subscribers.ts â€” Startup-time BusinessEventBus subscriber registration (Phase 6)
 *
 * This file is the single place where all BusinessEventBus subscribers are
 * registered. It must be imported once at application startup â€” before any
 * server function or background job can emit events.
 *
 * Architecture (R3 fix from Principal Architect Review):
 *   - BusinessEventBus itself imports NOTHING from subscriber modules.
 *   - Subscribers import BusinessEventBus (not the other way around).
 *   - This file (event-subscribers.ts) is the only place that creates
 *     the coupling: import subscriber â†’ call registerSubscriber().
 *   - A broken subscriber implementation cannot crash server functions
 *     that emit events, because the EventBus error-swallows per subscriber.
 *
 * Phase 6 additions:
 *   - CAPABILITY_STATE_CHANGED â†’ writes to BusinessEventLog for analytics
 *
 * To add a new subscriber:
 *   1. Write the handler function in the relevant module
 *   2. Import it here
 *   3. Call BusinessEventBus.registerSubscriber(type, handler)
 *   No other changes needed â€” the EventBus dispatches automatically.
 *
 * Bootstrap call site: import '@/lib/evolution/event-subscribers' in the
 * app entry point (e.g. app-bootstrap.ts, server startup, or root.tsx).
 */

import type { BusinessEvent } from '@platform/lib/evolution/business-event-bus'
import { BusinessEventBus } from '@platform/lib/evolution/business-event-bus'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'

// ---------------------------------------------------------------------------
// CAPABILITY_STATE_CHANGED â†’ BusinessEventLog (Phase 6 analytics)
// ---------------------------------------------------------------------------

/**
 * Persists CAPABILITY_STATE_CHANGED events to BusinessEventLog.
 *
 * This gives the analytics layer a queryable record of every state transition,
 * including the timestamp, actor, and before/after state. Combined with the
 * recommendedAt/enabledAt columns on BusinessCapabilityState (also Phase 6),
 * this enables:
 *   - Recommendation acceptance rate per capability
 *   - Time from RECOMMENDED to ENABLED per capability
 *   - Dismissal rate per capability
 *   - Recommendation-to-abandonment rate
 *
 * Error handling: failure to write the log must never affect the transition
 * that triggered it. Errors are caught and logged, not re-thrown.
 */
async function handleCapabilityStateChanged(event: BusinessEvent): Promise<void> {
  try {
    await rootPrisma.businessEventLog.create({
      data: {
        type: event.type,
        businessId: event.businessId,
        actorId: event.actorId ?? null,
        occurredAt: event.occurredAt,
        payload: event.payload ?? {},
      },
    })
  } catch (err) {
    console.warn(`[EventSubscribers] Failed to write BusinessEventLog for CAPABILITY_STATE_CHANGED (${event.businessId}):`, err)
  }
}

// ---------------------------------------------------------------------------
// GROWTH_THRESHOLD_CROSSED â†’ BusinessEventLog (Phase 5 milestone tracking)
// ---------------------------------------------------------------------------

/**
 * Persists GROWTH_THRESHOLD_CROSSED events to BusinessEventLog.
 * Gives the analytics layer a record of every milestone for reporting
 * (Phase 6.3 milestone frequency query).
 */
async function handleGrowthThresholdCrossed(event: BusinessEvent): Promise<void> {
  try {
    await rootPrisma.businessEventLog.create({
      data: {
        type: event.type,
        businessId: event.businessId,
        actorId: event.actorId ?? null,
        occurredAt: event.occurredAt,
        payload: event.payload ?? {},
      },
    })
  } catch (err) {
    console.warn(`[EventSubscribers] Failed to write BusinessEventLog for GROWTH_THRESHOLD_CROSSED (${event.businessId}):`, err)
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Registers all BusinessEventBus subscribers.
 * Call once at application startup â€” idempotent (re-registering the same
 * handler is safe; it will be called twice per event, not overwritten).
 *
 * The recommended call site is your app entry point before the HTTP server
 * starts handling requests.
 */
export function registerAllEventSubscribers(): void {
  BusinessEventBus.registerSubscriber('CAPABILITY_STATE_CHANGED', handleCapabilityStateChanged)
  BusinessEventBus.registerSubscriber('GROWTH_THRESHOLD_CROSSED', handleGrowthThresholdCrossed)
}
