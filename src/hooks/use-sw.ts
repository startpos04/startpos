import { Serwist } from '@serwist/window'
import { useEffect } from 'react'

export const useSw = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const serwist = new Serwist('/sw.js', {
      scope: '/',
      type: 'module',
    })

    const register = async () => {
      try {
        await serwist.register()
      } catch (error) {
        console.error('Service worker registration failed:', error)
      }
    }

    register()

    // Force clients to pick up a new SW version as soon as it activates,
    // instead of silently running on stale cached assets until manual refresh.
    let refreshing = false
    const handleControllerChange = () => {
      if (refreshing) return
      refreshing = true
      // TODO: swap this for a toast/banner ("Update available — refresh")
      // if you want the user to control the timing instead of an auto-reload.
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])
}
