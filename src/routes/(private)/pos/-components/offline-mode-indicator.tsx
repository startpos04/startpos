/**
 * offline-mode-indicator.tsx — Phase 2 offline checkout status indicator
 *
 * Displays at the top of the POS page when the device is offline, showing:
 *   - Green badge: User CAN checkout offline (designated terminal)
 *   - Red badge: User CANNOT checkout offline (not designated)
 *
 * This component provides clear visual feedback about offline capabilities
 * before users attempt to process transactions, preventing confusion when
 * checkout is blocked.
 */

import { useStore } from '@tanstack/react-store'
import { AlertCircle, CheckCircle, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { authStore } from '@/lib/better-auth/auth-store'

export function OfflineModeIndicator() {
  const [isOffline, setIsOffline] = useState(false)
  const user = useStore(authStore, state => state.user)

  useEffect(() => {
    // Check initial online status
    setIsOffline(!navigator.onLine)

    // Listen for online/offline events
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Don't render anything when online
  if (!isOffline) return null

  const canCheckoutOffline = user.canCheckoutOffline

  return (
    <Card
      className={`border-2 p-4 ${
        canCheckoutOffline
          ? 'bg-green-50 border-green-500 dark:bg-green-950 dark:border-green-700'
          : 'bg-red-50 border-red-500 dark:bg-red-950 dark:border-red-700'
      }`}
    >
      <div className='flex items-start gap-3'>
        <WifiOff className={`size-5 mt-0.5 ${canCheckoutOffline ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
        <div className='flex-1 space-y-1.5'>
          <div className='flex items-center gap-2'>
            <span className='font-semibold text-sm'>Offline Mode</span>
            <Badge
              variant={canCheckoutOffline ? 'default' : 'destructive'}
              className={`text-[10px] uppercase font-bold h-5 ${
                canCheckoutOffline ? 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800' : ''
              }`}
            >
              {canCheckoutOffline ? (
                <>
                  <CheckCircle className='size-3 mr-1' />
                  Checkout Enabled
                </>
              ) : (
                <>
                  <AlertCircle className='size-3 mr-1' />
                  Checkout Disabled
                </>
              )}
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground'>
            {canCheckoutOffline ? (
              <>
                You are the designated offline terminal for this branch. You can process transactions while offline. Transactions will sync when connection is
                restored.
              </>
            ) : (
              <>
                Your device is not designated as the offline terminal. Checkout is disabled to prevent sequence number conflicts. Please reconnect to the
                internet or contact your administrator to enable offline checkout for this device.
              </>
            )}
          </p>
        </div>
      </div>
    </Card>
  )
}
