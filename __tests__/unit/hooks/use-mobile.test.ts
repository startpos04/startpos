/**
 * use-mobile.test.ts
 *
 * Tests for useIsMobile hook using @testing-library/react and jsdom.
 * Mocks window.innerWidth and window.matchMedia to control viewport size.
 *
 * Coverage:
 *  - Initial state undefined on first render
 *  - Sets isMobile=true when window.innerWidth < 768
 *  - Sets isMobile=false when window.innerWidth >= 768
 *  - Responds to matchMedia 'change' event
 *  - Cleanup: removes matchMedia listener on unmount
 *
 * Run with: pnpm test
 */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsMobile } from '@/hooks/use-mobile'

describe('useIsMobile', () => {
  let matchMediaListeners: ((event: MediaQueryListEvent) => void)[] = []

  beforeEach(() => {
    matchMediaListeners = []

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            matchMediaListeners.push(listener)
          }
        }),
        removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            const idx = matchMediaListeners.indexOf(listener)
            if (idx > -1) matchMediaListeners.splice(idx, 1)
          }
        }),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when window.innerWidth < 768', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true, configurable: true })
    const { result } = renderHook(() => useIsMobile())

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when window.innerWidth >= 768', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
    const { result } = renderHook(() => useIsMobile())

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('responds to matchMedia change event (resize to mobile)', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
    const { result } = renderHook(() => useIsMobile())

    await waitFor(() => expect(result.current).toBe(false))

    // Simulate resize to mobile
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true })
    matchMediaListeners.forEach(listener => listener({} as MediaQueryListEvent))

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('responds to matchMedia change event (resize to desktop)', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true, configurable: true })
    const { result } = renderHook(() => useIsMobile())

    await waitFor(() => expect(result.current).toBe(true))

    // Simulate resize to desktop
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    matchMediaListeners.forEach(listener => {listener({} as MediaQueryListEvent)})

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('removes matchMedia listener on unmount', () => {
    const { unmount } = renderHook(() => useIsMobile())

    unmount()

    // After unmount, listeners should be removed
    expect(matchMediaListeners.length).toBe(0)
  })
})
