/**
 * db-transaction-events.test.ts — Pattern B test
 *
 * Verifies that dbTransaction emits events to BusinessEventBus after a
 * successful DB commit, and does NOT emit on failure or offline mode.
 *
 * Pattern B: mocks collections, transactionAPI, and BusinessEventBus.
 * The test captures events emitted through the dynamic import by replacing
 * the BusinessEventBus singleton's emit spy.
 *
 * Coverage:
 *  - Successful online transaction + events → events emitted after commit
 *  - Successful online transaction + no events → emit never called
 *  - Failed transaction → events NOT emitted
 *  - Offline transaction → events NOT emitted (DB hasn't committed yet)
 *  - Multiple events emitted in order
 *  - Event emission failure does NOT propagate to the caller
 */

import { ok, err } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── mocks (must be before imports) ───────────────────────────────────────────

vi.mock('@/lib/prisma-client/transaction-api', () => ({
  transactionAPI: {
    execute: vi.fn(),
  },
}))

vi.mock('@tanstack/db', () => ({
  createTransaction: vi.fn(),
}))

// Mock BusinessEventBus so we can spy on emit without loading the whole module
vi.mock('@/lib/evolution/business-event-bus', () => ({
  BusinessEventBus: {
    emit: vi.fn().mockResolvedValue(undefined),
  },
}))

// ── imports after mocks ───────────────────────────────────────────────────────

const { transactionAPI } = await import('@/lib/prisma-client/transaction-api')
const { createTransaction } = await import('@tanstack/db')
const { BusinessEventBus } = await import('@/lib/evolution/business-event-bus')
const { dbTransaction } = await import('@/db/local-db-transaction')
import type { BusinessEvent } from '@/lib/evolution/business-event-bus'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(type: BusinessEvent['type'] = 'SUPPLIER_ADDED'): BusinessEvent {
  return {
    type,
    businessId: 'biz-001',
    occurredAt: new Date('2026-08-04T12:00:00Z'),
    actorId: 'user-001',
  }
}

/**
 * Builds a createTransaction mock that runs the mutationFn synchronously
 * with the given serverResults, and resolves isPersisted immediately.
 */
function wireCreateTransaction(serverResults: unknown[] = [{ id: 'row-001' }]) {
  vi.mocked(createTransaction).mockImplementation(({ mutationFn }: { mutationFn: (opts: unknown) => Promise<unknown> }) => {
    const mutations = [
      {
        type: 'insert',
        modified: { id: 'row-001' },
        original: null,
        changes: null,
        collection: {
          id: 'supplier',
          utils: { writeInsert: vi.fn() },
        },
      },
    ]

    let persistedResolve!: () => void
    const isPersisted = {
      promise: new Promise<void>((resolve) => {
        persistedResolve = resolve
      }),
    }

    return {
      mutations,
      isPersisted,
      mutate: (cb: () => void) => {
        cb()
        // Run mutationFn and resolve isPersisted after
        mutationFn({ transaction: { mutations } })
          .then(() => persistedResolve())
          .catch(() => persistedResolve())
      },
    }
  })

  vi.mocked(transactionAPI.execute).mockResolvedValue(ok(serverResults))
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Restore online state
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('dbTransaction — event emission', () => {
  it('emits events after a successful online commit', async () => {
    wireCreateTransaction()
    const event = makeEvent('SUPPLIER_ADDED')

    const result = await dbTransaction(() => 'done', [event])

    expect(result.isOk()).toBe(true)

    // Give the fire-and-forget emission a tick to run
    await vi.waitFor(() => {
      expect(vi.mocked(BusinessEventBus.emit)).toHaveBeenCalledWith(event)
    })
  })

  it('does NOT call emit when no events are provided', async () => {
    wireCreateTransaction()

    await dbTransaction(() => 'done')

    await new Promise((r) => setTimeout(r, 10))
    expect(vi.mocked(BusinessEventBus.emit)).not.toHaveBeenCalled()
  })

  it('does NOT call emit when events array is empty', async () => {
    wireCreateTransaction()

    await dbTransaction(() => 'done', [])

    await new Promise((r) => setTimeout(r, 10))
    expect(vi.mocked(BusinessEventBus.emit)).not.toHaveBeenCalled()
  })

  it('emits multiple events in order', async () => {
    wireCreateTransaction()
    const e1 = makeEvent('SUPPLIER_ADDED')
    const e2 = makeEvent('EMPLOYEE_INVITED')

    await dbTransaction(() => 'done', [e1, e2])

    await vi.waitFor(() => {
      expect(vi.mocked(BusinessEventBus.emit)).toHaveBeenCalledTimes(2)
    })

    const calls = vi.mocked(BusinessEventBus.emit).mock.calls
    expect(calls[0]?.[0]).toEqual(e1)
    expect(calls[1]?.[0]).toEqual(e2)
  })

  it('does NOT emit when the DB commit fails', async () => {
    // Wire transactionAPI to return an error
    vi.mocked(createTransaction).mockImplementation(({ mutationFn }: { mutationFn: (opts: unknown) => Promise<unknown> }) => {
      const mutations = [{
        type: 'insert',
        modified: { id: 'row-001' },
        original: null,
        changes: null,
        collection: { id: 'supplier', utils: { writeInsert: vi.fn() } },
      }]

      let persistedResolve!: () => void
      let persistedReject!: (e: unknown) => void
      const isPersisted = {
        promise: new Promise<void>((res, rej) => {
          persistedResolve = res
          persistedReject = rej
        }),
      }

      return {
        mutations,
        isPersisted,
        mutate: (cb: () => void) => {
          cb()
          mutationFn({ transaction: { mutations } })
            .then(() => persistedResolve())
            .catch((e: unknown) => persistedReject(e))
        },
      }
    })

    vi.mocked(transactionAPI.execute).mockResolvedValue(err('DB write failed'))

    const event = makeEvent('SUPPLIER_ADDED')
    const result = await dbTransaction(() => 'done', [event])

    // Transaction should fail
    expect(result.isErr()).toBe(true)

    await new Promise((r) => setTimeout(r, 10))
    expect(vi.mocked(BusinessEventBus.emit)).not.toHaveBeenCalled()
  })

  it('event emission errors do NOT propagate to the caller', async () => {
    wireCreateTransaction()

    // Make emit throw
    vi.mocked(BusinessEventBus.emit).mockRejectedValueOnce(new Error('bus error'))

    const event = makeEvent('SUPPLIER_ADDED')
    const result = await dbTransaction(() => 'result-value', [event])

    // Transaction should still succeed
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe('result-value')
  })
})

describe('dbTransaction — offline mode', () => {
  it('does NOT emit events when offline', async () => {
    // Simulate offline
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true })

    vi.mocked(createTransaction).mockImplementation(({ mutationFn }: { mutationFn: (opts: unknown) => Promise<unknown> }) => {
      const mutations = [{
        type: 'insert',
        modified: { id: 'row-001' },
        original: null,
        changes: null,
        collection: { id: 'supplier', utils: { writeInsert: vi.fn() } },
      }]

      let persistedResolve!: () => void
      const isPersisted = { promise: new Promise<void>((r) => { persistedResolve = r }) }

      return {
        mutations,
        isPersisted,
        mutate: (cb: () => void) => {
          cb()
          mutationFn({ transaction: { mutations } })
            .then(() => persistedResolve())
            .catch(() => persistedResolve())
        },
      }
    })

    const event = makeEvent('SUPPLIER_ADDED')
    const result = await dbTransaction(() => 'done', [event])

    expect(result.isOk()).toBe(true)

    await new Promise((r) => setTimeout(r, 10))
    // No emit — DB hasn't committed yet (offline local-only apply)
    expect(vi.mocked(BusinessEventBus.emit)).not.toHaveBeenCalled()
  })
})
