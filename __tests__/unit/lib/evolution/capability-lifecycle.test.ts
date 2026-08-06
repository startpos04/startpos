/**
 * capability-lifecycle.test.ts — Pattern A unit tests
 *
 * Coverage:
 *  - canTransition: every valid transition returns true
 *  - canTransition: every invalid transition returns false
 *  - canTransition: same-state self-transition returns false
 *  - DEPRECATED is terminal — no transitions out
 *  - assertTransition: does not throw on valid transitions
 *  - assertTransition: throws InvalidTransitionError on invalid transitions
 *  - getTargetState: correct target for each trigger × current state
 *  - getTargetState: returns null when trigger is not applicable
 *  - isAlwaysOn: true for always-on capability definition
 *  - isAlwaysOn: false for conditional/deferrable capability definition
 */

import { describe, expect, it } from 'vitest'
import {
  CapabilityLifecycleState,
  InvalidTransitionError,
  assertTransition,
  canTransition,
  getTargetState,
  isAlwaysOn,
} from '@/lib/evolution/capability-lifecycle'

const S = CapabilityLifecycleState

// ---------------------------------------------------------------------------
// canTransition — valid transitions
// ---------------------------------------------------------------------------

describe('canTransition — valid transitions', () => {
  const VALID: Array<[string, string]> = [
    [S.HIDDEN, S.RECOMMENDED],
    [S.RECOMMENDED, S.ENABLED],
    [S.HIDDEN, S.ENABLED],
    [S.RECOMMENDED, S.HIDDEN],
    [S.ENABLED, S.CONFIGURED],
    [S.ENABLED, S.PAUSED],
    [S.CONFIGURED, S.PAUSED],
    [S.PAUSED, S.ENABLED],
    [S.HIDDEN, S.DEPRECATED],
    [S.RECOMMENDED, S.DEPRECATED],
    [S.ENABLED, S.DEPRECATED],
    [S.CONFIGURED, S.DEPRECATED],
    [S.PAUSED, S.DEPRECATED],
  ]

  for (const [from, to] of VALID) {
    it(`${from} → ${to} is valid`, () => {
      expect(canTransition(from as typeof S[keyof typeof S], to as typeof S[keyof typeof S])).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------
// canTransition — invalid transitions
// ---------------------------------------------------------------------------

describe('canTransition — invalid transitions', () => {
  const INVALID: Array<[string, string]> = [
    // Self-transitions
    [S.HIDDEN, S.HIDDEN],
    [S.ENABLED, S.ENABLED],
    [S.CONFIGURED, S.CONFIGURED],

    // Backwards / skipping states
    [S.ENABLED, S.HIDDEN],
    [S.ENABLED, S.RECOMMENDED],
    [S.CONFIGURED, S.HIDDEN],
    [S.CONFIGURED, S.RECOMMENDED],
    [S.CONFIGURED, S.ENABLED],  // must go via PAUSED
    [S.PAUSED, S.CONFIGURED],   // restore goes to ENABLED, not CONFIGURED
    [S.PAUSED, S.HIDDEN],
    [S.PAUSED, S.RECOMMENDED],

    // From DEPRECATED (terminal — no exits)
    [S.DEPRECATED, S.HIDDEN],
    [S.DEPRECATED, S.RECOMMENDED],
    [S.DEPRECATED, S.ENABLED],
    [S.DEPRECATED, S.CONFIGURED],
    [S.DEPRECATED, S.PAUSED],
    [S.DEPRECATED, S.DEPRECATED],
  ]

  for (const [from, to] of INVALID) {
    it(`${from} → ${to} is invalid`, () => {
      expect(canTransition(from as typeof S[keyof typeof S], to as typeof S[keyof typeof S])).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// DEPRECATED is terminal
// ---------------------------------------------------------------------------

describe('DEPRECATED is a terminal state', () => {
  const allStates = Object.values(S)

  for (const target of allStates) {
    it(`DEPRECATED → ${target} is always invalid`, () => {
      expect(canTransition(S.DEPRECATED, target)).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// assertTransition
// ---------------------------------------------------------------------------

describe('assertTransition', () => {
  it('does not throw for a valid transition', () => {
    expect(() => assertTransition('CAP_A', S.HIDDEN, S.RECOMMENDED)).not.toThrow()
  })

  it('does not throw for ENABLED → PAUSED', () => {
    expect(() => assertTransition('CAP_A', S.ENABLED, S.PAUSED)).not.toThrow()
  })

  it('throws InvalidTransitionError for an invalid transition', () => {
    expect(() => assertTransition('CAP_A', S.ENABLED, S.HIDDEN)).toThrow(InvalidTransitionError)
  })

  it('thrown error includes the capability ID', () => {
    try {
      assertTransition('MY_CAPABILITY', S.PAUSED, S.CONFIGURED)
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError)
      expect((err as InvalidTransitionError).capabilityId).toBe('MY_CAPABILITY')
      expect((err as InvalidTransitionError).from).toBe(S.PAUSED)
      expect((err as InvalidTransitionError).to).toBe(S.CONFIGURED)
    }
  })

  it('thrown error has a human-readable message', () => {
    try {
      assertTransition('TEST_CAP', S.DEPRECATED, S.ENABLED)
    } catch (err) {
      expect((err as Error).message).toContain('TEST_CAP')
      expect((err as Error).message).toContain('DEPRECATED')
      expect((err as Error).message).toContain('ENABLED')
    }
  })
})

// ---------------------------------------------------------------------------
// getTargetState
// ---------------------------------------------------------------------------

describe('getTargetState — SYSTEM_RECOMMEND', () => {
  it('HIDDEN → RECOMMENDED when SYSTEM_RECOMMEND fires', () => {
    expect(getTargetState('SYSTEM_RECOMMEND', S.HIDDEN)).toBe(S.RECOMMENDED)
  })

  it('returns null when already RECOMMENDED', () => {
    expect(getTargetState('SYSTEM_RECOMMEND', S.RECOMMENDED)).toBeNull()
  })

  it('returns null when ENABLED', () => {
    expect(getTargetState('SYSTEM_RECOMMEND', S.ENABLED)).toBeNull()
  })
})

describe('getTargetState — USER_ACCEPT', () => {
  it('RECOMMENDED → ENABLED on accept', () => {
    expect(getTargetState('USER_ACCEPT', S.RECOMMENDED)).toBe(S.ENABLED)
  })

  it('returns null if not RECOMMENDED', () => {
    expect(getTargetState('USER_ACCEPT', S.HIDDEN)).toBeNull()
    expect(getTargetState('USER_ACCEPT', S.ENABLED)).toBeNull()
    expect(getTargetState('USER_ACCEPT', S.PAUSED)).toBeNull()
  })
})

describe('getTargetState — USER_ENABLE', () => {
  it('HIDDEN → ENABLED on manual enable', () => {
    expect(getTargetState('USER_ENABLE', S.HIDDEN)).toBe(S.ENABLED)
  })

  it('RECOMMENDED → ENABLED on manual enable', () => {
    expect(getTargetState('USER_ENABLE', S.RECOMMENDED)).toBe(S.ENABLED)
  })

  it('returns null if already ENABLED or beyond', () => {
    expect(getTargetState('USER_ENABLE', S.ENABLED)).toBeNull()
    expect(getTargetState('USER_ENABLE', S.CONFIGURED)).toBeNull()
    expect(getTargetState('USER_ENABLE', S.PAUSED)).toBeNull()
  })
})

describe('getTargetState — SYSTEM_ADVANCE', () => {
  it('ENABLED → CONFIGURED on configuredSignal', () => {
    expect(getTargetState('SYSTEM_ADVANCE', S.ENABLED)).toBe(S.CONFIGURED)
  })

  it('returns null if not ENABLED', () => {
    expect(getTargetState('SYSTEM_ADVANCE', S.RECOMMENDED)).toBeNull()
    expect(getTargetState('SYSTEM_ADVANCE', S.CONFIGURED)).toBeNull()
    expect(getTargetState('SYSTEM_ADVANCE', S.PAUSED)).toBeNull()
  })
})

describe('getTargetState — USER_PAUSE', () => {
  it('ENABLED → PAUSED', () => {
    expect(getTargetState('USER_PAUSE', S.ENABLED)).toBe(S.PAUSED)
  })

  it('CONFIGURED → PAUSED', () => {
    expect(getTargetState('USER_PAUSE', S.CONFIGURED)).toBe(S.PAUSED)
  })

  it('returns null for non-pauseable states', () => {
    expect(getTargetState('USER_PAUSE', S.HIDDEN)).toBeNull()
    expect(getTargetState('USER_PAUSE', S.RECOMMENDED)).toBeNull()
    expect(getTargetState('USER_PAUSE', S.PAUSED)).toBeNull()
  })
})

describe('getTargetState — USER_RESTORE', () => {
  it('PAUSED → ENABLED on restore', () => {
    expect(getTargetState('USER_RESTORE', S.PAUSED)).toBe(S.ENABLED)
  })

  it('returns null if not PAUSED', () => {
    expect(getTargetState('USER_RESTORE', S.ENABLED)).toBeNull()
    expect(getTargetState('USER_RESTORE', S.CONFIGURED)).toBeNull()
  })
})

describe('getTargetState — USER_DISMISS', () => {
  it('RECOMMENDED → HIDDEN on dismiss', () => {
    expect(getTargetState('USER_DISMISS', S.RECOMMENDED)).toBe(S.HIDDEN)
  })

  it('returns null if not RECOMMENDED', () => {
    expect(getTargetState('USER_DISMISS', S.HIDDEN)).toBeNull()
    expect(getTargetState('USER_DISMISS', S.ENABLED)).toBeNull()
  })
})

describe('getTargetState — SYSTEM_DEPRECATE', () => {
  const pauseableStates = [S.HIDDEN, S.RECOMMENDED, S.ENABLED, S.CONFIGURED, S.PAUSED]
  for (const state of pauseableStates) {
    it(`${state} → DEPRECATED on deprecation`, () => {
      expect(getTargetState('SYSTEM_DEPRECATE', state)).toBe(S.DEPRECATED)
    })
  }

  it('returns null when already DEPRECATED', () => {
    expect(getTargetState('SYSTEM_DEPRECATE', S.DEPRECATED)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isAlwaysOn
// ---------------------------------------------------------------------------

describe('isAlwaysOn', () => {
  it('returns true for an always-on capability (no boosters, threshold=0, not deferrable)', () => {
    expect(isAlwaysOn({ boosters: [], threshold: 0, deferrable: false })).toBe(true)
  })

  it('returns false for a conditional capability (has boosters)', () => {
    expect(isAlwaysOn({ boosters: [{ label: 'test', signal: () => 1 }], threshold: 0.5, deferrable: true })).toBe(false)
  })

  it('returns false for a deferrable capability with no boosters', () => {
    expect(isAlwaysOn({ boosters: [], threshold: 0, deferrable: true })).toBe(false)
  })

  it('returns false for a capability with non-zero threshold', () => {
    expect(isAlwaysOn({ boosters: [], threshold: 0.3, deferrable: false })).toBe(false)
  })
})
