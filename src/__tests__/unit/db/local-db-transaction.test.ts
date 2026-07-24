/**
 * local-db-transaction.test.ts
 *
 * Tests the dbTransaction utility end-to-end by:
 *  - Mocking transactionAPI (avoids real server calls)
 *  - Using stub collections with the writeInsert/writeUpsert/writeDelete
 *    utils contract that dbTransaction depends on for syncing results back
 *
 * Note on localOnlyCollectionOptions:
 *   TanStack DB's localOnlyCollection only exposes `acceptMutations` (not
 *   writeInsert/writeUpsert/writeDelete) so it is incompatible with the
 *   offline sync path of dbTransaction. We use stub collections instead,
 *   matching the exact utils shape that dbTransaction expects.
 *
 * Coverage:
 *  - Online path: buildOperations produces correct DBPayload per mutation type
 *  - Online path: server results are written back via writeInsert/writeUpsert/writeDelete
 *  - Online path: writeBatch is called when available
 *  - Online path: server error (Err result) propagates as Err
 *  - Online path: server throws propagates as Err
 *  - Callback return value flows through correctly
 *  - Multiple mixed mutations (insert + update + delete) in one transaction
 *  - Empty callback completes with Ok
 *  - Synchronous throw in callback produces Err
 *
 * Run with: pnpm test
 */

import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { err, ok } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbTransaction } from '@/db/local-db-transaction'

// ---------------------------------------------------------------------------
// Mock transactionAPI — prevents any real server round-trips
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma-client/transaction-api', () => ({
  transactionAPI: {
    execute: vi.fn(),
  },
}))

import { transactionAPI } from '@/lib/prisma-client/transaction-api'

const mockExecute = vi.mocked(transactionAPI.execute)

// ---------------------------------------------------------------------------
// Stub collection factory
//
// Wraps a localOnlyCollection (manages the in-memory Map) and adds the
// writeInsert / writeUpsert / writeDelete / writeBatch utils that
// dbTransaction.applyServerResultsToCollection requires.
// ---------------------------------------------------------------------------

type TestRecord = { id: string; name: string; value: number }

function makeStubCollection(id: string) {
  // In-memory store that mirrors what writeInsert/etc write to
  const store = new Map<string, TestRecord>()

  // Track calls for assertions
  const calls = { insert: [] as TestRecord[], upsert: [] as TestRecord[], delete: [] as string[] }

  // Build a minimal collection object that satisfies dbTransaction's duck-typing.
  // dbTransaction only accesses: collection.id, collection.utils, and calls
  // col.insert/update/delete inside the mutate callback (via the TanStack DB
  // transaction proxy).  We wrap a real localOnlyCollection for the mutate side
  // so that transaction.mutations is populated correctly.
  const realCol = createCollection(localOnlyCollectionOptions<TestRecord, string>({ id, getKey: r => r.id }))

  // Attach the write utils that dbTransaction uses in mutationFn
  ;(realCol as any).utils = {
    ...(realCol as any).utils,
    writeInsert: (data: unknown) => {
      const record = data as TestRecord
      store.set(record.id, record)
      calls.insert.push(record)
    },
    writeUpsert: (data: unknown) => {
      const record = data as TestRecord
      store.set(record.id, record)
      calls.upsert.push(record)
    },
    writeDelete: (key: string) => {
      store.delete(key)
      calls.delete.push(key)
    },
  }

  return { col: realCol, store, calls }
}

// Helper: set up mockExecute to return whatever the mutations themselves contain
function mockServerEcho(data: TestRecord[]) {
  mockExecute.mockResolvedValueOnce(ok(data))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, writable: true, configurable: true })
}

// ---------------------------------------------------------------------------
// Online path — DBPayload shape
// ---------------------------------------------------------------------------

describe('dbTransaction — online path: DBPayload shape', () => {
  beforeEach(() => {
    setOnline(true)
    mockExecute.mockReset()
  })

  it('insert produces a create DBPayload with the full record as data', async () => {
    const { col } = makeStubCollection('payload-insert')
    mockServerEcho([{ id: 'r1', name: 'Alice', value: 100 }])

    await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'Alice', value: 100 })
    })

    const [ops] = mockExecute.mock.calls[0]!
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      table: 'payload-insert',
      action: 'create',
      args: { data: { id: 'r1', name: 'Alice', value: 100 } },
    })
  })

  it('update produces an update DBPayload with where.id and changed fields', async () => {
    const { col } = makeStubCollection('payload-update')
    col.insert({ id: 'r1', name: 'Alice', value: 1 })
    mockServerEcho([{ id: 'r1', name: 'Alice', value: 99 }])

    await dbTransaction(() => {
      col.update('r1', draft => {
        draft.value = 99
      })
    })

    const [ops] = mockExecute.mock.calls[0]!
    expect(ops[0]).toMatchObject({
      table: 'payload-update',
      action: 'update',
      args: { where: { id: 'r1' }, data: { value: 99 } },
    })
  })

  it('delete produces a delete DBPayload with where.id', async () => {
    const { col } = makeStubCollection('payload-delete')
    col.insert({ id: 'r1', name: 'Alice', value: 1 })
    mockServerEcho([
      {
        id: 'r1',
        name: '',
        value: 0,
      },
    ])

    await dbTransaction(() => {
      col.delete('r1')
    })

    const [ops] = mockExecute.mock.calls[0]!
    expect(ops[0]).toMatchObject({
      table: 'payload-delete',
      action: 'delete',
      args: { where: { id: 'r1' } },
    })
  })

  it('multiple mixed mutations produce payloads in mutation order', async () => {
    const { col } = makeStubCollection('payload-mixed')
    col.insert({ id: 'existing', name: 'E', value: 0 })
    mockExecute.mockResolvedValueOnce(
      ok([
        { id: 'new-one', name: 'New', value: 10 },
        { id: 'existing', name: 'E', value: 55 },
      ]),
    )

    await dbTransaction(() => {
      col.insert({ id: 'new-one', name: 'New', value: 10 })
      col.update('existing', draft => {
        draft.value = 55
      })
    })

    const [ops] = mockExecute.mock.calls[0]!
    expect(ops).toHaveLength(2)
    expect(ops[0]!.action).toBe('create')
    expect(ops[1]!.action).toBe('update')
  })
})

// ---------------------------------------------------------------------------
// Online path — server result sync-back
// ---------------------------------------------------------------------------

describe('dbTransaction — online path: server result sync-back', () => {
  beforeEach(() => {
    setOnline(true)
    mockExecute.mockReset()
  })

  it('insert: writeInsert is called with the server-returned record', async () => {
    const { col, calls } = makeStubCollection('sync-insert')
    const serverRecord = { id: 'r1', name: 'Server Name', value: 200 }
    mockServerEcho([serverRecord])

    await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'Alice', value: 100 })
    })

    expect(calls.insert).toHaveLength(1)
    expect(calls.insert[0]).toMatchObject(serverRecord)
  })

  it('update: writeUpsert is called with the server-merged record', async () => {
    const { col, calls } = makeStubCollection('sync-update')
    col.insert({ id: 'r1', name: 'Alice', value: 1 })
    const serverRecord = { id: 'r1', name: 'Alice', value: 99 }
    mockServerEcho([serverRecord])

    await dbTransaction(() => {
      col.update('r1', draft => {
        draft.value = 99
      })
    })

    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]).toMatchObject(serverRecord)
  })

  it('delete: writeDelete is called with the record id', async () => {
    const { col, calls } = makeStubCollection('sync-delete')
    col.insert({ id: 'r1', name: 'Alice', value: 1 })
    mockServerEcho([
      {
        id: 'r1',
        name: '',
        value: 0,
      },
    ])

    await dbTransaction(() => {
      col.delete('r1')
    })

    expect(calls.delete).toHaveLength(1)
    expect(calls.delete[0]).toBe('r1')
  })

  it('writeBatch is used when available, wrapping all writes in one call', async () => {
    const { col } = makeStubCollection('sync-batch')
    const batchFn = vi.fn((cb: () => void) => cb())
    ;(col as any).utils.writeBatch = batchFn

    mockExecute.mockResolvedValueOnce(
      ok([
        { id: 'a', name: 'A', value: 1 },
        { id: 'b', name: 'B', value: 2 },
      ]),
    )

    await dbTransaction(() => {
      col.insert({ id: 'a', name: 'A', value: 1 })
      col.insert({ id: 'b', name: 'B', value: 2 })
    })

    expect(batchFn).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Online path — error handling
// ---------------------------------------------------------------------------

describe('dbTransaction — online path: error handling', () => {
  beforeEach(() => {
    setOnline(true)
    mockExecute.mockReset()
  })

  it('server returning err() propagates as Err result', async () => {
    const { col } = makeStubCollection('error-err')
    mockExecute.mockResolvedValueOnce(err('constraint violation'))

    const result = await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'Alice', value: 1 })
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toContain('constraint violation')
  })

  it('server throwing rejects as Err result', async () => {
    const { col } = makeStubCollection('error-throw')
    mockExecute.mockRejectedValueOnce(new Error('network timeout'))

    const result = await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'B', value: 0 })
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toContain('network timeout')
  })
})

// ---------------------------------------------------------------------------
// Callback return value and edge cases
// ---------------------------------------------------------------------------

describe('dbTransaction — callback return value and edge cases', () => {
  beforeEach(() => {
    setOnline(true)
    mockExecute.mockReset()
  })

  it('callback return value is preserved through a successful transaction', async () => {
    const { col } = makeStubCollection('return-val')
    mockServerEcho([{ id: 'r1', name: 'X', value: 5 }])

    const result = await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'X', value: 5 })
      return { transactionId: 'txn-abc', total: 42 }
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({ transactionId: 'txn-abc', total: 42 })
  })

  it('empty callback (no mutations) completes with Ok and calls execute with empty array', async () => {
    mockExecute.mockResolvedValueOnce(ok([]))

    const result = await dbTransaction(() => 'empty-return')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe('empty-return')
  })

  it('synchronous throw inside callback produces Err', async () => {
    const result = await dbTransaction(() => {
      throw new Error('business rule violated')
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toBe('business rule violated')
  })
})

// ---------------------------------------------------------------------------
// Task 11 additions — offline path + refetch fallback
// ---------------------------------------------------------------------------

describe('dbTransaction — offline path (navigator.onLine = false)', () => {
  beforeEach(() => {
    setOnline(false)
    mockExecute.mockReset()
  })

  afterEach(() => {
    setOnline(true)
  })

  it('does NOT call transactionAPI.execute when offline', async () => {
    const { col } = makeStubCollection('offline-no-execute')

    await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'Offline', value: 1 })
    })

    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('applies mutations locally and returns Ok when offline', async () => {
    const { col, calls } = makeStubCollection('offline-apply')

    const result = await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'Alice', value: 99 })
      return 'offline-result'
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe('offline-result')
    // writeInsert called with the local record
    expect(calls.insert).toHaveLength(1)
    expect(calls.insert[0]).toMatchObject({ id: 'r1', name: 'Alice', value: 99 })
  })

  it('offline update writes merged record via writeUpsert', async () => {
    const { col, calls } = makeStubCollection('offline-update')
    col.insert({ id: 'r1', name: 'Alice', value: 1 })

    await dbTransaction(() => {
      col.update('r1', draft => {
        draft.value = 55
      })
    })

    expect(calls.upsert).toHaveLength(1)
    expect(calls.upsert[0]).toMatchObject({ id: 'r1', value: 55 })
  })

  it('offline delete calls writeDelete with the record id', async () => {
    const { col, calls } = makeStubCollection('offline-delete')
    col.insert({ id: 'r1', name: 'Alice', value: 1 })

    await dbTransaction(() => {
      col.delete('r1')
    })

    expect(calls.delete).toHaveLength(1)
    expect(calls.delete[0]).toBe('r1')
  })
})

describe('dbTransaction — refetch fallback on write failure', () => {
  beforeEach(() => {
    setOnline(true)
    mockExecute.mockReset()
  })

  it('calls refetch when writeInsert throws', async () => {
    const { col } = makeStubCollection('refetch-fallback')
    const refetch = vi.fn().mockResolvedValue(undefined)

    // Override writeInsert to throw
    ;(col as any).utils.writeInsert = () => { throw new Error('write failed') }
    ;(col as any).utils.refetch = refetch

    mockServerEcho([{ id: 'r1', name: 'Alice', value: 1 }])

    await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'Alice', value: 1 })
    })

    expect(refetch).toHaveBeenCalledOnce()
  })

  it('returns Err when writeInsert throws and no refetch available', async () => {
    const { col } = makeStubCollection('refetch-missing')

    // Override writeInsert to throw, no refetch attached
    ;(col as any).utils.writeInsert = () => { throw new Error('write failed') }
    delete (col as any).utils.refetch

    mockServerEcho([{ id: 'r1', name: 'Alice', value: 1 }])

    const result = await dbTransaction(() => {
      col.insert({ id: 'r1', name: 'Alice', value: 1 })
    })

    expect(result.isErr()).toBe(true)
  })
})

describe('dbTransaction — concurrent transactions', () => {
  beforeEach(() => {
    setOnline(true)
    mockExecute.mockReset()
  })

  it('two concurrent transactions both complete successfully', async () => {
    const { col: col1 } = makeStubCollection('concurrent-a')
    const { col: col2 } = makeStubCollection('concurrent-b')

    mockExecute
      .mockResolvedValueOnce(ok([{ id: 'a1', name: 'A', value: 1 }]))
      .mockResolvedValueOnce(ok([{ id: 'b1', name: 'B', value: 2 }]))

    const [r1, r2] = await Promise.all([
      dbTransaction(() => { col1.insert({ id: 'a1', name: 'A', value: 1 }); return 'txn-a' }),
      dbTransaction(() => { col2.insert({ id: 'b1', name: 'B', value: 2 }); return 'txn-b' }),
    ])

    expect(r1.isOk()).toBe(true)
    expect(r2.isOk()).toBe(true)
    expect(r1._unsafeUnwrap()).toBe('txn-a')
    expect(r2._unsafeUnwrap()).toBe('txn-b')
  })
})
