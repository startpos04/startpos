/**
 * overlay.test.tsx
 *
 * Unit tests for src/lib/overlay.tsx — the global modal/dialog manager.
 *
 * Strategy:
 *  - Mount a real <Overlay /> component with RTL so the class-component
 *    lifecycle runs properly and Overlay.instance is set.
 *  - Call showModal / delModal / clearModals / delChildModals through the
 *    exported helpers (same path production code uses).
 *  - Use a minimal SentinelDialog component as the injected Component so
 *    we can assert renders without any real dialog UI.
 *  - Each test gets a fresh mount (beforeEach cleanup + new render) to
 *    avoid Overlay.instance cross-contamination.
 *
 * Coverage targets (Task 21):
 *  ✅ showModal inserts a dialog into Overlay state (renders Component)
 *  ✅ showModal returns a non-empty string id
 *  ✅ showModal renders component with open=true
 *  ✅ delModal sets dialog open=false (component re-renders with open=false)
 *  ✅ clearModals sets all dialogs to open=false
 *  ✅ delChildModals closes dialogs after the given id, keeps earlier ones open
 *  ✅ showModal with same key replaces / re-opens existing dialog
 *  ✅ showModal when no Overlay instance returns "" and logs error
 *  ✅ Two successive showModal calls both appear in state
 *  ✅ Overlay.instance is null after unmount
 *  ✅ showModal activeKey path: skips instance when cached key is still valid
 *  ✅ showModal activeKey path: calls onYes and returns "" for valid key
 *
 * Run with: pnpm test overlay
 */

import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Overlay, {
  showModal,
  delModal,
  clearModals,
  delChildModals,
} from '@/lib/overlay'

// ---------------------------------------------------------------------------
// Sentinel dialog — renders its open/closed state in the DOM so assertions
// can use screen queries instead of inspecting internal React state.
// ---------------------------------------------------------------------------

function SentinelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <div data-testid='sentinel' data-open='true' /> : <div data-testid='sentinel' data-open='false' />
}

function SentinelB({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <div data-testid='sentinel-b' data-open='true' /> : <div data-testid='sentinel-b' data-open='false' />
}

function SentinelC({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <div data-testid='sentinel-c' data-open='true' /> : <div data-testid='sentinel-c' data-open='false' />
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountOverlay() {
  return render(<Overlay />)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Ensure instance is cleared between tests
  Overlay.instance = null
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  Overlay.instance = null
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Instance lifecycle
// ---------------------------------------------------------------------------

describe('Overlay — instance lifecycle', () => {
  it('sets Overlay.instance when mounted', () => {
    mountOverlay()
    expect(Overlay.instance).not.toBeNull()
  })

  it('clears Overlay.instance when unmounted', () => {
    const { unmount } = mountOverlay()
    expect(Overlay.instance).not.toBeNull()
    unmount()
    expect(Overlay.instance).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// showModal — basic insert
// ---------------------------------------------------------------------------

describe('showModal — basic insert', () => {
  it('returns a non-empty string id', async () => {
    mountOverlay()
    const id = await showModal(SentinelDialog as any)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('renders the component with open=true', async () => {
    mountOverlay()
    await act(async () => { await showModal(SentinelDialog as any) })
    await waitFor(() => {
      const el = screen.getByTestId('sentinel')
      expect(el.getAttribute('data-open')).toBe('true')
    })
  })

  it('two successive showModal calls both render their components', async () => {
    mountOverlay()
    await act(async () => { await showModal(SentinelDialog as any) })
    await act(async () => { await showModal(SentinelB as any) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('sentinel-b').getAttribute('data-open')).toBe('true')
    })
  })

  it('passes extra props through to the component', async () => {
    function PropsDialog({ open, title }: { open: boolean; onClose: () => void; title: string }) {
      return open ? <div data-testid='props-dialog'>{title}</div> : null
    }
    mountOverlay()
    await act(async () => { await showModal(PropsDialog as any, { title: 'Hello World' } as any) })
    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// showModal — key-based upsert
// ---------------------------------------------------------------------------

describe('showModal — key-based upsert', () => {
  it('re-uses existing dialog when same key is provided', async () => {
    mountOverlay()
    await act(async () => {
      await showModal(SentinelDialog as any, { key: 'my-key' } as any)
    })
    // Close it first
    await act(async () => { delModal(Overlay.instance!.state.dialogs[0]!.id) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('false')
    })
    // Re-open with same key — should reuse the slot and flip open=true
    await act(async () => {
      await showModal(SentinelDialog as any, { key: 'my-key' } as any)
    })
    await waitFor(() => {
      // Only one sentinel in DOM (slot reused, not duplicated)
      expect(screen.getAllByTestId('sentinel').length).toBe(1)
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
    })
  })
})

// ---------------------------------------------------------------------------
// delModal
// ---------------------------------------------------------------------------

describe('delModal', () => {
  it('sets dialog open=false when called with the returned id', async () => {
    mountOverlay()
    let id = ''
    await act(async () => { id = await showModal(SentinelDialog as any) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
    })
    act(() => { delModal(id) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('false')
    })
  })

  it('does nothing when given an unknown id', async () => {
    mountOverlay()
    await act(async () => { await showModal(SentinelDialog as any) })
    // Should not throw
    act(() => { delModal('non-existent-id') })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
    })
  })
})

// ---------------------------------------------------------------------------
// clearModals
// ---------------------------------------------------------------------------

describe('clearModals', () => {
  it('sets all open dialogs to open=false', async () => {
    mountOverlay()
    await act(async () => { await showModal(SentinelDialog as any) })
    await act(async () => { await showModal(SentinelB as any) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('sentinel-b').getAttribute('data-open')).toBe('true')
    })
    act(() => { clearModals() })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('false')
      expect(screen.getByTestId('sentinel-b').getAttribute('data-open')).toBe('false')
    })
  })
})

// ---------------------------------------------------------------------------
// delChildModals
// ---------------------------------------------------------------------------

describe('delChildModals', () => {
  it('closes dialogs opened after the given id, keeps earlier ones open', async () => {
    mountOverlay()
    let idA = '', idB = '', idC = ''
    await act(async () => { idA = await showModal(SentinelDialog as any) })
    await act(async () => { idB = await showModal(SentinelB as any) })
    await act(async () => { idC = await showModal(SentinelC as any) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('sentinel-b').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('sentinel-c').getAttribute('data-open')).toBe('true')
    })
    // Delete children of A → B and C should close, A stays open
    act(() => { delChildModals(idA) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('sentinel-b').getAttribute('data-open')).toBe('false')
      expect(screen.getByTestId('sentinel-c').getAttribute('data-open')).toBe('false')
    })
  })

  it('closes nothing when id is the last dialog', async () => {
    mountOverlay()
    let idA = '', idB = ''
    await act(async () => { idA = await showModal(SentinelDialog as any) })
    await act(async () => { idB = await showModal(SentinelB as any) })
    act(() => { delChildModals(idB) })
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
      expect(screen.getByTestId('sentinel-b').getAttribute('data-open')).toBe('true')
    })
  })
})

// ---------------------------------------------------------------------------
// showModal — no instance guard
// ---------------------------------------------------------------------------

describe('showModal — no Overlay instance', () => {
  it('returns "" and logs an error when Overlay is not mounted', async () => {
    // Ensure no instance
    Overlay.instance = null
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await showModal(SentinelDialog as any)
    expect(result).toBe('')
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overlay instance not found'))
    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// showModal — activeKey path
// ---------------------------------------------------------------------------

describe('showModal — activeKey', () => {
  it('calls onYes and returns "" when cached key is still valid (not expired)', async () => {
    mountOverlay()
    const onYes = vi.fn().mockResolvedValue(undefined)
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    localStorage.setItem('test-key', JSON.stringify({ value: futureDate }))

    const result = await showModal(SentinelDialog as any, {
      activeKey: 'test-key',
      onYes,
    } as any)

    expect(result).toBe('')
    expect(onYes).toHaveBeenCalled()
  })

  it('opens normally when cached key is expired', async () => {
    mountOverlay()
    const onYes = vi.fn()
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    localStorage.setItem('test-key', JSON.stringify({ value: pastDate }))

    const id = await act(async () =>
      showModal(SentinelDialog as any, {
        activeKey: 'test-key',
        onYes,
      } as any),
    )

    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
    })
    expect(onYes).not.toHaveBeenCalled()
  })

  it('opens normally when no cached key exists', async () => {
    mountOverlay()
    const id = await act(async () =>
      showModal(SentinelDialog as any, {
        activeKey: 'missing-key',
        onYes: vi.fn(),
      } as any),
    )
    await waitFor(() => {
      expect(screen.getByTestId('sentinel').getAttribute('data-open')).toBe('true')
    })
  })
})
