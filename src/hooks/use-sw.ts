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
  }, [])
}
