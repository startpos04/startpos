/**
 * local-auth.test.ts
 *
 * Tests for local-auth.ts — the conditional localAuthCollection initialisation.
 *
 * Strategy:
 *  - local-auth.ts conditionally creates the collection only when
 *    `typeof window !== 'undefined'`. We test both branches by controlling
 *    the global window object.
 *  - The OPFS persistence module is mocked so no real database is opened.
 *  - @tanstack/browser-db-sqlite-persistence is mocked to capture the
 *    options passed to persistedCollectionOptions.
 *  - @tanstack/db createCollection is mocked to return a stub.
 *
 * Coverage:
 *  - Node path: localAuthCollection is an empty object {} when window absent
 *  - Browser path: createCollection is called when window is present
 *  - Browser path: persistedCollectionOptions called with id="localAuth"
 *  - Browser path: schemaVersion=1 passed to persistedCollectionOptions
 *  - Browser path: getKey returns auth.id
 *
 * Run with: pnpm test local-auth
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock: @/db/index — prevent OPFS initialisation
// ---------------------------------------------------------------------------

vi.mock('@/db/index', () => ({
  persistence: { __mock: true },
  createSyncableCollection: vi.fn(() => ({ _stub: true })),
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/browser-db-sqlite-persistence
// ---------------------------------------------------------------------------

const mockPersistedOptions = vi.fn((opts: any) => ({ ...opts, __persisted: true }))

vi.mock('@tanstack/browser-db-sqlite-persistence', () => ({
  persistedCollectionOptions: mockPersistedOptions,
}))

// ---------------------------------------------------------------------------
// Mock: @tanstack/db — capture createCollection calls
// ---------------------------------------------------------------------------

const mockCreateCollection = vi.fn((opts: any) => ({ id: opts.id ?? 'localAuth', __collection: true }))

vi.mock('@tanstack/db', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/db')>()
  return {
    ...actual,
    createCollection: mockCreateCollection,
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let savedWindow: typeof globalThis.window

function removeWindow() {
  savedWindow = globalThis.window
  // @ts-expect-error intentional
  delete globalThis.window
}

function restoreWindow() {
  Object.defineProperty(globalThis, 'window', {
    value: savedWindow,
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('local-auth — Node path (no window)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCreateCollection.mockClear()
    mockPersistedOptions.mockClear()
    removeWindow()
  })

  it('localAuthCollection is an empty object when window is absent', async () => {
    const { localAuthCollection } = await import('@/db/local-auth')
    expect(localAuthCollection).toEqual({})
  })

  it('createCollection is NOT called when window is absent', async () => {
    await import('@/db/local-auth')
    expect(mockCreateCollection).not.toHaveBeenCalled()
  })

  afterEach(() => {
    restoreWindow()
  })
})

describe('local-auth — Browser path (window present)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCreateCollection.mockClear()
    mockPersistedOptions.mockClear()
    // Ensure window is present (jsdom provides it by default)
    if (typeof globalThis.window === 'undefined') restoreWindow()
  })

  it('createCollection is called when window is present', async () => {
    await import('@/db/local-auth')
    expect(mockCreateCollection).toHaveBeenCalledOnce()
  })

  it('persistedCollectionOptions called with id="localAuth"', async () => {
    await import('@/db/local-auth')
    expect(mockPersistedOptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'localAuth' }),
    )
  })

  it('persistedCollectionOptions called with schemaVersion=1', async () => {
    await import('@/db/local-auth')
    expect(mockPersistedOptions).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: 1 }),
    )
  })

  it('getKey function returns auth.id', async () => {
    await import('@/db/local-auth')
    const opts = mockPersistedOptions.mock.calls[0]![0] as any
    const fakeAuth = { id: 'auth-123', email: 'test@test.com' }
    expect(opts.getKey(fakeAuth)).toBe('auth-123')
  })

  it('localAuthCollection is the return value of createCollection', async () => {
    const { localAuthCollection } = await import('@/db/local-auth')
    expect((localAuthCollection as any).__collection).toBe(true)
  })
})
