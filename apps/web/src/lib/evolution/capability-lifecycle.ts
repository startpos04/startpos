/**
 * capability-lifecycle.ts — Capability state machine (Phase 3a)
 *
 * Defines the six lifecycle states and all valid transitions.
 * Pure module — no IO, no Prisma, no side effects.
 *
 * State diagram:
 *
 *   HIDDEN ──► RECOMMENDED ──► ENABLED ──► CONFIGURED
 *                    │              │
 *                    ▼              ▼
 *                  HIDDEN         PAUSED ──► ENABLED
 *                                   │
 *                                   ▼
 *                               DEPRECATED
 *
 * Rules:
 *   - HIDDEN is the entry state for every capability.
 *   - ALWAYS_ON capabilities (no boosters, threshold=0) start as ENABLED at
 *     registration and can never transition to HIDDEN, PAUSED, or DEPRECATED.
 *   - The RecommendationEngine sets HIDDEN → RECOMMENDED.
 *   - CapabilityControl.accept() / .enable() sets RECOMMENDED → ENABLED.
 *   - The RecalculationJob sets ENABLED → CONFIGURED via configuredSignal.
 *   - CapabilityControl.pause() sets ENABLED or CONFIGURED → PAUSED.
 *   - CapabilityControl.restore() sets PAUSED → ENABLED.
 *   - CapabilityControl.dismiss() sets RECOMMENDED → HIDDEN (30-day cooldown).
 *   - DEPRECATED is terminal — no transitions out.
 */

// ---------------------------------------------------------------------------
// State type
// ---------------------------------------------------------------------------

export const CapabilityLifecycleState = {
  HIDDEN: 'HIDDEN',
  RECOMMENDED: 'RECOMMENDED',
  ENABLED: 'ENABLED',
  CONFIGURED: 'CONFIGURED',
  PAUSED: 'PAUSED',
  DEPRECATED: 'DEPRECATED',
} as const

export type CapabilityLifecycleState = (typeof CapabilityLifecycleState)[keyof typeof CapabilityLifecycleState]

// ---------------------------------------------------------------------------
// Transition types — what action caused the transition
// ---------------------------------------------------------------------------

export type LifecycleTransitionTrigger =
  | 'SYSTEM_RECOMMEND' // RecommendationEngine: HIDDEN → RECOMMENDED
  | 'USER_ACCEPT' // User accepted a recommendation: RECOMMENDED → ENABLED
  | 'USER_ENABLE' // User manually enabled: HIDDEN|RECOMMENDED → ENABLED
  | 'SYSTEM_ADVANCE' // configuredSignal fired: ENABLED → CONFIGURED
  | 'USER_PAUSE' // User paused: ENABLED|CONFIGURED → PAUSED
  | 'USER_RESTORE' // User restored: PAUSED → ENABLED
  | 'USER_DISMISS' // User dismissed recommendation: RECOMMENDED → HIDDEN
  | 'SYSTEM_DEPRECATE' // Platform deprecated: any → DEPRECATED

// ---------------------------------------------------------------------------
// Valid transition table
// ---------------------------------------------------------------------------

type TransitionKey = `${CapabilityLifecycleState}→${CapabilityLifecycleState}`

const VALID_TRANSITIONS: Set<TransitionKey> = new Set([
  // Recommendation engine
  'HIDDEN→RECOMMENDED',
  // User acceptance / manual enable
  'RECOMMENDED→ENABLED',
  'HIDDEN→ENABLED',
  // Dismissal — recommendation hidden again
  'RECOMMENDED→HIDDEN',
  // Automatic advancement
  'ENABLED→CONFIGURED',
  // Pause from active states
  'ENABLED→PAUSED',
  'CONFIGURED→PAUSED',
  // Restore from pause
  'PAUSED→ENABLED',
  // Deprecation — terminal
  'HIDDEN→DEPRECATED',
  'RECOMMENDED→DEPRECATED',
  'ENABLED→DEPRECATED',
  'CONFIGURED→DEPRECATED',
  'PAUSED→DEPRECATED',
])

// ---------------------------------------------------------------------------
// canTransition — pure predicate
// ---------------------------------------------------------------------------

/**
 * Returns true if the transition from `from` to `to` is valid.
 *
 * @param from - The current state
 * @param to   - The desired target state
 */
export function canTransition(from: CapabilityLifecycleState, to: CapabilityLifecycleState): boolean {
  if (from === to) return false
  const key: TransitionKey = `${from}→${to}`
  return VALID_TRANSITIONS.has(key)
}

// ---------------------------------------------------------------------------
// assertTransition — throws a typed error if the transition is invalid
// ---------------------------------------------------------------------------

export class InvalidTransitionError extends Error {
  readonly capabilityId: string
  readonly from: CapabilityLifecycleState
  readonly to: CapabilityLifecycleState

  constructor(capabilityId: string, from: CapabilityLifecycleState, to: CapabilityLifecycleState) {
    super(`Invalid lifecycle transition for '${capabilityId}': ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
    this.capabilityId = capabilityId
    this.from = from
    this.to = to
  }
}

/**
 * Asserts that a transition is valid. Throws `InvalidTransitionError` if not.
 */
export function assertTransition(capabilityId: string, from: CapabilityLifecycleState, to: CapabilityLifecycleState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(capabilityId, from, to)
  }
}

// ---------------------------------------------------------------------------
// Transition helpers — map trigger → expected (from, to) pair
// ---------------------------------------------------------------------------

/**
 * Returns the expected target state for a given trigger and current state.
 * Returns null if the trigger is not applicable to the current state.
 */
export function getTargetState(trigger: LifecycleTransitionTrigger, currentState: CapabilityLifecycleState): CapabilityLifecycleState | null {
  switch (trigger) {
    case 'SYSTEM_RECOMMEND':
      return currentState === 'HIDDEN' ? 'RECOMMENDED' : null

    case 'USER_ACCEPT':
      return currentState === 'RECOMMENDED' ? 'ENABLED' : null

    case 'USER_ENABLE':
      return currentState === 'HIDDEN' || currentState === 'RECOMMENDED' ? 'ENABLED' : null

    case 'SYSTEM_ADVANCE':
      return currentState === 'ENABLED' ? 'CONFIGURED' : null

    case 'USER_PAUSE':
      return currentState === 'ENABLED' || currentState === 'CONFIGURED' ? 'PAUSED' : null

    case 'USER_RESTORE':
      return currentState === 'PAUSED' ? 'ENABLED' : null

    case 'USER_DISMISS':
      return currentState === 'RECOMMENDED' ? 'HIDDEN' : null

    case 'SYSTEM_DEPRECATE':
      return currentState !== 'DEPRECATED' ? 'DEPRECATED' : null
  }
}

// ---------------------------------------------------------------------------
// Utility: always-on capabilities cannot be paused
// ---------------------------------------------------------------------------

/**
 * Returns true if a capability is always-on (threshold=0, no boosters).
 * Always-on capabilities cannot be paused or deprecated.
 * Used by CapabilityControl to block pause on core capabilities.
 */
export function isAlwaysOn(capabilityDef: { boosters: unknown[]; threshold: number; deferrable: boolean }): boolean {
  return capabilityDef.boosters.length === 0 && capabilityDef.threshold === 0 && !capabilityDef.deferrable
}
