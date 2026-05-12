import { useEffect, useState } from 'react'

export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const updateStatus = async () => {
      if (navigator.onLine) {
        try {
          // Perform a tiny fetch to a reliable endpoint (like a favicon or 1x1 pixel)
          // Add a cache-busting timestamp to prevent Service Worker interference
          const response = await fetch(`/favicon.ico?t=${Date.now()}`, {
            method: 'HEAD',
            mode: 'no-cors',
          })
          setIsOnline(response.ok || !!response)
        } catch {
          setIsOnline(false)
        }
      } else {
        setIsOnline(false)
      }
    }

    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)

    // Initial check
    updateStatus()

    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
    }
  }, [])

  return isOnline
}
