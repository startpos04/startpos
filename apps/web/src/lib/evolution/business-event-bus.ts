/**
 * business-event-bus.ts — In-process pub/sub event router (R3 fix)
 *
 * Routes typed business events from producers to registered subscribers.
 *
 * Principal Architect Review fix R3:
 *   The EventBus MUST NOT couple subscriber implementations at module load.
 *   A broken capability definition must not crash a server function that emits events.
 *
 * Solution: subscriber registration happens at app startup via registerSubscriber(),
 * not through static imports. The EventBus itself imports nothing but its own types.
 * Subscriber modules import the EventBus. The EventBus does NOT import subscribers.
 *
 * This breaks the implicit dependency chain:
 *   server function → EventBus → CharacteristicsEngine → OBSERVATION_RULES → capability-registry
 *
 * Usage:
 *   // In app bootstrap (not in server functions):
 *   import { BusinessEventBus } from '@/lib/evolution/business-event-bus'
 *   import { CharacteristicsEngine } from '@/lib/evolution/characteristics-engine'
 *   BusinessEventBus.registerSubscriber('SUPPLIER_ADDED', CharacteristicsEngine.handleEvent)
 *
 *   // In a server function (just emit — no knowledge of who handles it):
 *   import { BusinessEventBus } from '@/lib/evolution/business-event-bus'
 *   await BusinessEventBus.emit({ type: 'SUPPLIER_ADDED', businessId, ... })
 */

// ---------------------------------------------------------------------------
// Business event types
// ---------------------------------------------------------------------------

export type BusinessEventType =
  | 'SUPPLIER_ADDED'
  | 'EMPLOYEE_INVITED'
  | 'CUSTOMER_REGISTERED'
  | 'BRANCH_CREATED'
  | 'FIRST_FOOD_PRODUCT_ADDED'
  | 'PRODUCT_CREATED'
  | 'PURCHASE_ORDER_CREATED'
  | 'INVENTORY_ADJUSTED'
  | 'CASH_RECONCILIATION_COMPLETED'
  | 'APPROVAL_WORKFLOW_USED'
  | 'CONFIG_CHANGED'
  | 'CHARACTERISTICS_UPDATED'
  | 'CAPABILITY_STATE_CHANGED'
  | 'GROWTH_THRESHOLD_CROSSED'

export type BusinessEvent = {
  type: BusinessEventType
  businessId: string
  branchId?: string
  actorId?: string
  occurredAt: Date
  payload?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Subscriber type
// ---------------------------------------------------------------------------

export type EventSubscriber = (event: BusinessEvent) => void | Promise<void>

// ---------------------------------------------------------------------------
// BusinessEventBus
// ---------------------------------------------------------------------------

/**
 * In-process pub/sub router for business events.
 *
 * IMPORTANT: This class knows nothing about CharacteristicsEngine,
 * RecommendationEngine, or any other subscriber. All coupling is via
 * registerSubscriber() called at startup time.
 */
class BusinessEventBusClass {
  private readonly subscribers = new Map<BusinessEventType, EventSubscriber[]>()

  /**
   * Register a subscriber for a specific event type.
   * Called at app startup — not inside server functions or module definitions.
   */
  registerSubscriber(type: BusinessEventType, handler: EventSubscriber): void {
    const existing = this.subscribers.get(type) ?? []
    this.subscribers.set(type, [...existing, handler])
  }

  /**
   * Remove all subscribers for a specific event type.
   * Used in tests to clean up between test runs.
   */
  clearSubscribers(type?: BusinessEventType): void {
    if (type) {
      this.subscribers.delete(type)
    } else {
      this.subscribers.clear()
    }
  }

  /**
   * Emit an event to all registered subscribers for its type.
   *
   * Error handling: if a subscriber throws, the error is caught and logged.
   * Other subscribers still receive the event — a broken subscriber must not
   * crash the server function that emitted the event.
   */
  async emit(event: BusinessEvent): Promise<void> {
    const handlers = this.subscribers.get(event.type) ?? []

    const results = await Promise.allSettled(handlers.map(handler => Promise.resolve(handler(event))))

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`[BusinessEventBus] Subscriber error for event ${event.type}:`, result.reason)
      }
    }
  }

  /**
   * Returns the number of subscribers registered for a given event type.
   * Useful for testing and diagnostics.
   */
  subscriberCount(type: BusinessEventType): number {
    return (this.subscribers.get(type) ?? []).length
  }
}

/**
 * Global singleton EventBus instance.
 * Import this in server functions to emit events.
 * Import this in app bootstrap to register subscribers.
 */
export const BusinessEventBus = new BusinessEventBusClass()
