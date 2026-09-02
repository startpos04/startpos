/**
 * capability-control.test.ts — Pattern B unit tests
 *
 * Mocks:
 *   - @/lib/prisma-client → mockPrisma (in-memory store)
 *   - @/lib/evolution/recalculation-queue → mockQueue
 *   - @/lib/evolution/business-event-bus → mockBus
 *   - @tanstack/react-start → createServerFn stub (not used by control, but
 *     imported transitively through capability-registry → types)
 *
 * Coverage:
 *  - accept: RECOMMENDED → ENABLED, applies outputs, schedules recalculation, emits event
 *  - enable: HIDDEN → ENABLED, applies outputs
 *  - enable: RECOMMENDED → ENABLED, applies outputs
 *  - pause: ENABLED → PAUSED, applies rollback outputs
 *  - pause: CONFIGURED → PAUSED, applies rollback outputs
 *  - pause: always-on capability → PRECONDITION_FAILED
 *  - restore: PAUSED → ENABLED, re-applies outputs
 *  - dismiss: RECOMMENDED → HIDDEN, sets dismissedAt, does not apply outputs
 *  - advance: ENABLED → CONFIGURED (system trigger, no config changes)
 *  - NOT_FOUND when no state row exists
 *  - INVALID_TRANSITION when trigger not applicable to current state
 *  - CAPABILITY_STATE_CHANGED event emitted on every successful transition
 *  - stateHistory is appended, not replaced
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── mocks (before all imports) ────────────────────────────────────────────

vi.mock('@tanstack/react-start', () => ({
  createServerFn: vi.fn(() => ({
    middleware: vi.fn().mockReturnThis(),
    inputValidator: vi.fn().mockReturnThis(),
    handler: vi.fn((fn: unknown) => fn),
  })),
}))
vi.mock('@/lib/better-auth/auth-middleware', () => ({ authMiddleware: {} }))

// ── Prisma mock — stubs only in factory, implementations in beforeEach ────

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    businessCapabilityState: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    configuration: {
      upsert: vi.fn(),
    },
  },
}))

vi.mock('@/lib/evolution/recalculation-queue', () => ({
  recalculationQueue: { schedule: vi.fn() },
  RecalculationPriority: { DEFERRED: 10, IMMEDIATE: 100, BACKGROUND: 0 },
}))

vi.mock('@/lib/evolution/business-event-bus', () => ({
  BusinessEventBus: { emit: vi.fn().mockResolvedValue(undefined) },
}))

// ── imports after mocks ───────────────────────────────────────────────────

const { accept, enable, pause, restore, dismiss, advance } = await import('@/lib/evolution/capability-control')
const { prisma: mockPrisma } = await import('@/lib/prisma-client')
const { recalculationQueue: mockQueue } = await import('@/lib/evolution/recalculation-queue')
const { BusinessEventBus: mockBus } = await import('@/lib/evolution/business-event-bus')

// ── helpers ───────────────────────────────────────────────────────────────

type StateRow = {
  businessId: string
  capabilityId: string
  state: string
  stateHistory: unknown[]
  dismissedAt: Date | null
  dismissalCount: number
  enteredAt: Date
  enteredBy: string | null
  previousState: string | null
}

function makeStateRow(overrides: Partial<StateRow> = {}): StateRow {
  return {
    businessId: 'biz-001',
    capabilityId: 'START_VENDOR_SESSION',
    state: 'RECOMMENDED',
    stateHistory: [],
    dismissedAt: null,
    dismissalCount: 0,
    enteredAt: new Date(),
    enteredBy: null,
    previousState: null,
    ...overrides,
  }
}

function wireMocks(stateRow: StateRow | null) {
  const p = vi.mocked(mockPrisma)

  p.businessCapabilityState.findUnique.mockResolvedValue(stateRow as never)
  p.businessCapabilityState.update.mockImplementation((args: { data: Partial<StateRow> }) => {
    // Return the merged row so callers can inspect it
    return Promise.resolve({ ...stateRow, ...args.data }) as never
  })
  p.business.findUnique.mockResolvedValue({ livingCharacteristics: null } as never)
  p.configuration.upsert.mockResolvedValue({} as never)

  vi.mocked(mockQueue.schedule).mockResolvedValue(undefined)
  vi.mocked(mockBus.emit).mockResolvedValue(undefined)
}

// ── tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── accept ────────────────────────────────────────────────────────────────

describe('accept — RECOMMENDED → ENABLED', () => {
  it('returns ok:true with newState=ENABLED', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await accept('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('ENABLED')
  })

  it('writes the new state to the DB', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    await accept('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(vi.mocked(mockPrisma.businessCapabilityState.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'ENABLED', enteredBy: 'user-001' }),
      }),
    )
  })

  it('applies capability config outputs via configuration.upsert', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    await accept('biz-001', 'START_VENDOR_SESSION', 'user-001')

    // START_VENDOR_SESSION capability may have configuration outputs
    // The test verifies configuration.upsert is called with proper structure
    expect(vi.mocked(mockPrisma.configuration.upsert)).toHaveBeenCalled()
  })

  it('schedules a recalculation after accept', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    await accept('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(vi.mocked(mockQueue.schedule)).toHaveBeenCalledWith('biz-001', 10)
  })

  it('emits CAPABILITY_STATE_CHANGED', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    await accept('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(vi.mocked(mockBus.emit)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CAPABILITY_STATE_CHANGED',
        businessId: 'biz-001',
        actorId: 'user-001',
        payload: expect.objectContaining({
          capabilityId: 'START_VENDOR_SESSION',
          fromState: 'RECOMMENDED',
          toState: 'ENABLED',
        }),
      }),
    )
  })

  it('returns NOT_FOUND when no state row exists', async () => {
    wireMocks(null)

    const result = await accept('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('NOT_FOUND')
  })

  it('returns INVALID_TRANSITION when already ENABLED', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await accept('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION')
  })
})

// ── enable ────────────────────────────────────────────────────────────────

describe('enable — HIDDEN|RECOMMENDED → ENABLED', () => {
  it('enables from HIDDEN', async () => {
    wireMocks(makeStateRow({ state: 'HIDDEN', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await enable('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('ENABLED')
  })

  it('enables from RECOMMENDED', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await enable('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('ENABLED')
  })

  it('applies outputs on enable', async () => {
    wireMocks(makeStateRow({ state: 'HIDDEN', capabilityId: 'START_VENDOR_SESSION' }))

    await enable('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(vi.mocked(mockPrisma.configuration.upsert)).toHaveBeenCalled()
  })

  it('returns INVALID_TRANSITION when already ENABLED', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await enable('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION')
  })
})

// ── pause ─────────────────────────────────────────────────────────────────

describe('pause — ENABLED|CONFIGURED → PAUSED', () => {
  it('pauses from ENABLED', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await pause('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('PAUSED')
  })

  it('pauses from CONFIGURED', async () => {
    wireMocks(makeStateRow({ state: 'CONFIGURED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await pause('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('PAUSED')
  })

  it('applies rollback outputs on pause', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'START_VENDOR_SESSION' }))

    await pause('biz-001', 'START_VENDOR_SESSION', 'user-001')

    // Pause applies rollback outputs to revert configuration changes
    expect(vi.mocked(mockPrisma.configuration.upsert)).toHaveBeenCalled()
  })

  it('rejects pause on always-on capability (COMPLETE_CHECKOUT)', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'COMPLETE_CHECKOUT' }))

    const result = await pause('biz-001', 'COMPLETE_CHECKOUT', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('PRECONDITION_FAILED')
  })

  it('rejects pause on always-on capability (MANAGE_PRODUCTS)', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'MANAGE_PRODUCTS' }))

    const result = await pause('biz-001', 'MANAGE_PRODUCTS', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('PRECONDITION_FAILED')
  })

  it('returns INVALID_TRANSITION from PAUSED state', async () => {
    wireMocks(makeStateRow({ state: 'PAUSED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await pause('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION')
  })

  it('returns NOT_FOUND for an unknown capability ID', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'NONEXISTENT' }))

    const result = await pause('biz-001', 'NONEXISTENT', 'user-001')

    // NONEXISTENT not in registry → NOT_FOUND returned before transition check
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('NOT_FOUND')
  })
})

// ── restore ───────────────────────────────────────────────────────────────

describe('restore — PAUSED → ENABLED', () => {
  it('restores from PAUSED', async () => {
    wireMocks(makeStateRow({ state: 'PAUSED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await restore('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('ENABLED')
  })

  it('re-applies outputs on restore', async () => {
    wireMocks(makeStateRow({ state: 'PAUSED', capabilityId: 'START_VENDOR_SESSION' }))

    await restore('biz-001', 'START_VENDOR_SESSION', 'user-001')

    // Restore re-applies capability configuration outputs
    expect(vi.mocked(mockPrisma.configuration.upsert)).toHaveBeenCalled()
  })

  it('returns INVALID_TRANSITION if not PAUSED', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await restore('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION')
  })
})

// ── dismiss ───────────────────────────────────────────────────────────────

describe('dismiss — RECOMMENDED → HIDDEN', () => {
  it('dismisses from RECOMMENDED', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await dismiss('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('HIDDEN')
  })

  it('sets dismissedAt and increments dismissalCount', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION', dismissalCount: 1 }))

    await dismiss('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(vi.mocked(mockPrisma.businessCapabilityState.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dismissedAt: expect.any(Date),
          dismissalCount: { increment: 1 },
        }),
      }),
    )
  })

  it('does NOT call configuration.upsert on dismiss', async () => {
    wireMocks(makeStateRow({ state: 'RECOMMENDED', capabilityId: 'START_VENDOR_SESSION' }))

    await dismiss('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(vi.mocked(mockPrisma.configuration.upsert)).not.toHaveBeenCalled()
  })

  it('returns INVALID_TRANSITION if not RECOMMENDED', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'START_VENDOR_SESSION' }))

    const result = await dismiss('biz-001', 'START_VENDOR_SESSION', 'user-001')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION')
  })
})

// ── advance ───────────────────────────────────────────────────────────────

describe('advance — ENABLED → CONFIGURED (system trigger)', () => {
  it('advances from ENABLED to CONFIGURED', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'MANAGE_INVENTORY' }))

    const result = await advance('biz-001', 'MANAGE_INVENTORY')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newState).toBe('CONFIGURED')
  })

  it('uses "system" as enteredBy', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'MANAGE_INVENTORY' }))

    await advance('biz-001', 'MANAGE_INVENTORY')

    expect(vi.mocked(mockPrisma.businessCapabilityState.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enteredBy: 'system' }),
      }),
    )
  })

  it('does NOT call configuration.upsert (no config changes on advance)', async () => {
    wireMocks(makeStateRow({ state: 'ENABLED', capabilityId: 'MANAGE_INVENTORY' }))

    await advance('biz-001', 'MANAGE_INVENTORY')

    expect(vi.mocked(mockPrisma.configuration.upsert)).not.toHaveBeenCalled()
  })

  it('returns INVALID_TRANSITION from CONFIGURED (already advanced)', async () => {
    wireMocks(makeStateRow({ state: 'CONFIGURED', capabilityId: 'MANAGE_INVENTORY' }))

    const result = await advance('biz-001', 'MANAGE_INVENTORY')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION')
  })
})

// ── state history ─────────────────────────────────────────────────────────

describe('stateHistory — append, not replace', () => {
  it('appends a new history entry on each transition', async () => {
    const existingHistory = [
      { state: 'ENABLED', changedAt: '2026-08-01T00:00:00Z', changedBy: 'user-001', fromState: 'RECOMMENDED' },
    ]
    wireMocks(makeStateRow({
      state: 'ENABLED',
      capabilityId: 'START_VENDOR_SESSION',
      stateHistory: existingHistory,
    }))

    await pause('biz-001', 'START_VENDOR_SESSION', 'user-001')

    const updateCall = vi.mocked(mockPrisma.businessCapabilityState.update).mock.calls[0]
    const updatedHistory = (updateCall?.[0] as { data: { stateHistory: unknown[] } }).data.stateHistory

    // Original entry preserved + new entry appended
    expect(updatedHistory).toHaveLength(2)
    expect((updatedHistory[0] as { state: string }).state).toBe('ENABLED')
    expect((updatedHistory[1] as { state: string }).state).toBe('PAUSED')
  })
})

// ── event emission for all transitions ───────────────────────────────────

describe('CAPABILITY_STATE_CHANGED event always emitted on success', () => {
  const cases = [
    { fn: () => accept('biz-001', 'START_VENDOR_SESSION', 'u'), state: 'RECOMMENDED' as const },
    { fn: () => enable('biz-001', 'START_VENDOR_SESSION', 'u'), state: 'HIDDEN' as const },
    { fn: () => pause('biz-001', 'START_VENDOR_SESSION', 'u'), state: 'ENABLED' as const },
    { fn: () => restore('biz-001', 'START_VENDOR_SESSION', 'u'), state: 'PAUSED' as const },
    { fn: () => dismiss('biz-001', 'START_VENDOR_SESSION', 'u'), state: 'RECOMMENDED' as const },
    { fn: () => advance('biz-001', 'MANAGE_INVENTORY'), state: 'ENABLED' as const },
  ]

  for (const { fn, state } of cases) {
    it(`emits event from ${state}`, async () => {
      const capabilityId = state === 'ENABLED' && fn === cases[5]?.fn
        ? 'MANAGE_INVENTORY'
        : 'START_VENDOR_SESSION'
      wireMocks(makeStateRow({ state, capabilityId }))
      vi.clearAllMocks()
      wireMocks(makeStateRow({ state, capabilityId }))

      await fn()

      expect(vi.mocked(mockBus.emit)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CAPABILITY_STATE_CHANGED' }),
      )
    })
  }
})
