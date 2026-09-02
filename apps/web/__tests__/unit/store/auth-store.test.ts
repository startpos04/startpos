/**
 * auth-store.test.ts
 *
 * Tests for the authStore (TanStack Store) and its helper functions.
 *
 * Coverage:
 *  - Initial state: isAuthenticated=false, user={}, isLoggingOut=false
 *  - setUser: sets isAuthenticated=true and user
 *  - setUser: does NOT overwrite if user.id already exists
 *  - resetAuth: resets to default state
 *  - setState: can directly update state
 *  - subscribe: fires on state change
 *  - localStorage sync (window environment only) — skipped in jsdom unless mocked
 *
 * Run with: pnpm test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '#tests/helpers/mock-user'
import { authStore, resetAuth, setUser } from '@/store/auth-store'

describe('authStore', () => {
  beforeEach(() => {
    resetAuth() // Reset to default before each test
  })

  afterEach(() => {
    resetAuth()
  })

  it('initial state: isAuthenticated=false, user={}, isLoggingOut=false', () => {
    const state = authStore.state
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoggingOut).toBe(false)
    expect(state.user).toEqual({})
  })

  it('setUser sets isAuthenticated=true and user data', () => {
    const mockUser = createMockUser({ name: 'Alice', email: 'alice@test.com' })
    setUser(mockUser)

    const state = authStore.state
    expect(state.isAuthenticated).toBe(true)
    expect(state.user.name).toBe('Alice')
    expect(state.user.email).toBe('alice@test.com')
  })

  it('setUser does NOT overwrite when user.id already exists', () => {
    const firstUser = createMockUser({ id: 'user-1', name: 'First' })
    setUser(firstUser)

    const secondUser = createMockUser({ id: 'user-2', name: 'Second' })
    setUser(secondUser)

    // State should still be firstUser (not overwritten)
    const state = authStore.state
    expect(state.user.id).toBe('user-1')
    expect(state.user.name).toBe('First')
  })

  it('resetAuth resets to default state', () => {
    const mockUser = createMockUser()
    setUser(mockUser)
    expect(authStore.state.isAuthenticated).toBe(true)

    resetAuth()

    const state = authStore.state
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toEqual({})
    expect(state.isLoggingOut).toBe(false)
  })

  it('setState can directly update isLoggingOut', () => {
    authStore.setState(state => ({ ...state, isLoggingOut: true }))
    expect(authStore.state.isLoggingOut).toBe(true)

    authStore.setState(state => ({ ...state, isLoggingOut: false }))
    expect(authStore.state.isLoggingOut).toBe(false)
  })

  it('subscribe fires when state changes', () => {
    const callback = vi.fn()
    authStore.subscribe(callback)

    const mockUser = createMockUser()
    setUser(mockUser)

    expect(callback).toHaveBeenCalled()
  })

  it('subscribe callback receives no arguments (reads from store.state)', () => {
    let capturedState: any = null
    authStore.subscribe(() => {
      capturedState = authStore.state
    })

    const mockUser = createMockUser()
    setUser(mockUser)

    expect(capturedState).toBeDefined()
    expect(capturedState.isAuthenticated).toBe(true)
  })

  it('setUser skips update when current user.id already exists (no overwrite)', () => {
    const firstUser = createMockUser({ id: 'user-1', name: 'First' })
    setUser(firstUser)

    const secondUser = createMockUser({ id: 'user-2', name: 'Second' })
    setUser(secondUser) // Should be ignored

    expect(authStore.state.user.id).toBe('user-1')
  })
})
