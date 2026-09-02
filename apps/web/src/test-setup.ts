/**
 * test-setup.ts
 *
 * Global test setup for Vitest + jsdom.
 * Imported via vitest.config.ts `setupFiles`.
 */

import '@testing-library/jest-dom/vitest'

// ---------------------------------------------------------------------------
// jsdom polyfills
// ---------------------------------------------------------------------------

// Radix UI Select (and other components) call scrollIntoView during mount.
// jsdom doesn't implement it, so we stub it globally.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.scrollTo = () => {}

  // cmdk (used by SelectInput/Command) requires ResizeObserver
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  // SidebarProvider uses window.matchMedia via useIsMobile
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}
