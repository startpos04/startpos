/**
 * workflow.ts
 *
 * Generic state-machine factory for aggregates with defined lifecycles,
 * named states, and role-guarded transitions.
 *
 * ADR-002: Accepted â€” Activated at Phase D.
 * The activation condition (two consumers simultaneously) is now met:
 *   - purchaseWorkflow  (Phase D, first consumer)
 *   - taskWorkflow      (Phase D, migrated from task-workflow.ts)
 *
 * Design constraints:
 *   - Pure: no infrastructure imports, no side effects.
 *   - O(1) transition lookup via pre-built maps constructed at createWorkflow() time.
 *   - Uses OperationResult from result.ts â€” no exceptions for expected business conditions.
 *   - Generic over State (string union) and Context (caller-supplied identity + role bag).
 *
 * Usage:
 *   const myWorkflow = createWorkflow(config)
 *   myWorkflow.canTransition(from, to, context)   // OperationResult<void>
 *   myWorkflow.allowedTransitions(from, context)   // TransitionDef<S, C>[]
 *   myWorkflow.isTerminal(state)                   // boolean
 */

import { type OperationResult, opFail, opOk } from '@platform/lib/result'

// ---------------------------------------------------------------------------
// Guard types
// ---------------------------------------------------------------------------

/**
 * A guard function returns null on success or a denial reason string on failure.
 * Multiple guards are ANDed â€” all must pass.
 */
export type TransitionGuard<C> = (context: C) => string | null

// ---------------------------------------------------------------------------
// Transition definition
// ---------------------------------------------------------------------------

export interface TransitionDef<S extends string, C> {
  /** Source state */
  from: S
  /** Target state */
  to: S
  /**
   * Guards evaluated in order. First non-null return short-circuits with
   * PERMISSION_DENIED. An empty array means the transition is unconditionally
   * allowed for any authenticated caller (role check is a guard by convention).
   */
  guards: TransitionGuard<C>[]
  /** UI metadata co-located with the transition that produces it. */
  meta: {
    buttonLabel: string
    label: string
    variant: 'default' | 'outline' | 'secondary' | 'destructive'
  }
}

// ---------------------------------------------------------------------------
// Workflow config
// ---------------------------------------------------------------------------

export interface WorkflowConfig<S extends string, C> {
  /** All valid states. Used to build the terminal set. */
  states: readonly S[]
  /** States from which no outgoing transitions exist. */
  terminalStates: readonly S[]
  /** All valid transitions with their guards and UI metadata. */
  transitions: TransitionDef<S, C>[]
}

// ---------------------------------------------------------------------------
// Workflow object returned by createWorkflow()
// ---------------------------------------------------------------------------

export interface Workflow<S extends string, C> {
  /**
   * Check whether a transition is valid and all guards pass for the given context.
   * Returns opOk() on success, opFail('PERMISSION_DENIED', reason) on guard failure,
   * opFail('PRECONDITION_FAILED', reason) when the transition does not exist.
   */
  canTransition(from: S, to: S, context: C): OperationResult<void>

  /**
   * Return all transitions from `from` whose guards all pass for `context`.
   * The returned objects include UI metadata ready for rendering action buttons.
   */
  allowedTransitions(from: S, context: C): TransitionDef<S, C>[]

  /**
   * True when `state` has no outgoing transitions (terminal state).
   * Use to gate edit and delete operations.
   */
  isTerminal(state: S): boolean

  /**
   * Return the TransitionDef for a specific (from â†’ to) pair, or null if it
   * does not exist. Useful for rendering per-transition UI metadata.
   */
  getTransition(from: S, to: S): TransitionDef<S, C> | null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a Workflow object from a declarative config.
 *
 * All lookup structures are built once at call time â€” canTransition and
 * allowedTransitions are O(guards) at runtime, not O(transitions).
 */
export function createWorkflow<S extends string, C>(config: WorkflowConfig<S, C>): Workflow<S, C> {
  // Pre-build: (from â†’ to) â†’ TransitionDef map for O(1) lookup
  const transitionMap = new Map<string, TransitionDef<S, C>>()
  // Pre-build: from â†’ TransitionDef[] for allowedTransitions
  const outgoingMap = new Map<string, TransitionDef<S, C>[]>()
  // Pre-build: terminal state set
  const terminalSet = new Set<S>(config.terminalStates)

  for (const transition of config.transitions) {
    const key = `${transition.from}â†’${transition.to}`
    transitionMap.set(key, transition)

    const outgoing = outgoingMap.get(transition.from) ?? []
    outgoing.push(transition)
    outgoingMap.set(transition.from, outgoing)
  }

  return {
    canTransition(from: S, to: S, context: C): OperationResult<void> {
      const key = `${from}â†’${to}`
      const def = transitionMap.get(key)

      if (!def) {
        return opFail('PRECONDITION_FAILED', `Transition ${from} â†’ ${to} is not defined in this workflow.`)
      }

      for (const guard of def.guards) {
        const denial = guard(context)
        if (denial !== null) {
          return opFail('PERMISSION_DENIED', denial)
        }
      }

      return opOk()
    },

    allowedTransitions(from: S, context: C): TransitionDef<S, C>[] {
      const candidates = outgoingMap.get(from) ?? []
      return candidates.filter(def => def.guards.every(guard => guard(context) === null))
    },

    isTerminal(state: S): boolean {
      return terminalSet.has(state)
    },

    getTransition(from: S, to: S): TransitionDef<S, C> | null {
      return transitionMap.get(`${from}â†’${to}`) ?? null
    },
  }
}
