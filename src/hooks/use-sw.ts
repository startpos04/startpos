import { Serwist } from '@serwist/window'
import { useEffect } from 'react'
import { toast } from 'sonner'

export const useSw = () => {
  useEffect(() => {
    // Completely disable service worker in development to prevent module resolution issues
    const isDev = import.meta.env.DEV
    if (isDev) {
      console.log('[SW] Service worker disabled in development mode')

      // Unregister any existing service worker from previous sessions
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            registration.unregister().then(() => {
              console.log('[SW] Unregistered existing service worker for development')
            })
          }
        })
      }

      return
    }

    if (!('serviceWorker' in navigator)) return

    // Captured once, at mount — distinguishes "this page had no SW yet"
    // (first-ever install/claim, nothing to reload for) from "this page
    // already had an active SW" (a genuine update is replacing it).
    const hadControllerAtStart = !!navigator.serviceWorker.controller

    const serwist = new Serwist('/sw.js', { scope: '/', type: 'module' })

    const register = async () => {
      try {
        await serwist.register()

        const registration = await navigator.serviceWorker.ready
        try {
          registration.active?.postMessage('start-lazy-precache')
        } catch (error) {
          console.error('Failed to trigger lazy precache:', error)
        }
      } catch (error) {
        console.error('Service worker registration failed:', error)
      }
    }

    const scheduleRegister = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => register(), { timeout: 3000 })
      } else {
        setTimeout(register, 1000)
      }
    }

    if (document.readyState === 'complete') {
      scheduleRegister()
    } else {
      window.addEventListener('load', scheduleRegister, { once: true })
    }

    const handleOnline = () => {
      navigator.serviceWorker.controller?.postMessage('retry-lazy-precache')
    }
    window.addEventListener('online', handleOnline)

    let refreshing = false
    const handleControllerChange = () => {
      if (refreshing) return

      // First-ever activation: nothing changed underneath the page — the
      // resources it already loaded are correct. No reload needed.
      if (!hadControllerAtStart) return

      refreshing = true

      // A real update: an already-active SW is being replaced. Never force
      // a reload here — that could interrupt an in-progress POS transaction.
      // Let the user choose when.
      toast('An update is available', {
        description: 'Refresh to get the latest version.',
        duration: Infinity,
        action: {
          label: 'Refresh now',
          onClick: () => window.location.reload(),
        },
      })
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    return () => {
      window.removeEventListener('load', scheduleRegister)
      window.removeEventListener('online', handleOnline)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])
}
