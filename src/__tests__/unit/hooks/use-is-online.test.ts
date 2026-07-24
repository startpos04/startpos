/**
 * use-is-online.test.ts
 *
 * Tests for the useIsOnline hook using @testing-library/react and jsdom.
 * Mocks global fetch and navigator.onLine to control online/offline scenarios.
 *
 * Coverage:
 *  - Initial state reflects navigator.onLine
 *  - Responds to 'online' event by checking fetch
 *  - Responds to 'offline' event by setting false
 *  - fetch success → isOnline=true
 *  - fetch failure → isOnline=false
 *  - Cleanup: removes event listeners on unmount
 *
 * Run with: pnpm test
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsOnline } from '@/hooks/use-is-online'

describe('useIsOnline', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Default: online, fetch succeeds
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initial state is true when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    const { result } = renderHook(() => useIsOnline())
    expect(result.current).toBe(true)
  })

  it('initial state is false when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
    const { result } = renderHook(() => useIsOnline())
    expect(result.current).toBe(false)
  })

  it('sets isOnline=true when fetch succeeds on mount', async () => {
    fetchSpy.mockResolvedValue({ ok: true } as Response)
    const { result } = renderHook(() => useIsOnline())

    // Initial fetch runs in useEffect
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('sets isOnline=false when fetch fails on mount', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useIsOnline())

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('responds to "online" event by checking fetch', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
    const { result } = renderHook(() => useIsOnline())

    // Start offline
    expect(result.current).toBe(false)

    // Simulate 'online' event
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    fetchSpy.mockResolvedValue({ ok: true } as Response)
    window.dispatchEvent(new Event('online'))

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('responds to "offline" event by setting false', async () => {
    const { result } = renderHook(() => useIsOnline())

    // Start online
    await waitFor(() => expect(result.current).toBe(true))

    // Simulate 'offline' event
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
    window.dispatchEvent(new Event('offline'))

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('removes event listeners on unmount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useIsOnline())
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function))
  })
})
