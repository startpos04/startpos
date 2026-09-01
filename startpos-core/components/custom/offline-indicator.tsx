/**
 * offline-indicator.tsx — Generic offline mode banner for data viewing pages
 *
 * Displays a banner at the top of pages when offline to inform users they're
 * viewing cached data with limited filtering capabilities.
 *
 * Usage:
 *   <OfflineIndicator />
 *   <OfflineIndicator message="Custom offline message" />
 */

import { AlertCircle, WifiOff } from 'lucide-react'
import { Card } from '@startpos-core/components/ui/card'
import { useIsOnline } from '@startpos-core/hooks/use-is-online'

interface OfflineIndicatorProps {
  /**
   * Custom message to display. Defaults to generic offline data viewing message.
   */
  message?: string
}

export function OfflineIndicator({ message }: OfflineIndicatorProps) {
  const isOnline = useIsOnline()

  // Don't render anything when online
  if (isOnline) return null

  const defaultMessage = 'You are viewing cached data. Some filters and features may be unavailable until connection is restored.'

  return (
    <Card className='border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-700 p-3'>
      <div className='flex items-start gap-3'>
        <WifiOff className='size-5 mt-0.5 text-yellow-600 dark:text-yellow-400' />
        <div className='flex-1 space-y-1'>
          <div className='flex items-center gap-2'>
            <span className='font-semibold text-sm text-yellow-900 dark:text-yellow-100'>Offline Mode</span>
            <AlertCircle className='size-4 text-yellow-600 dark:text-yellow-400' />
          </div>
          <p className='text-xs text-yellow-800 dark:text-yellow-200'>{message ?? defaultMessage}</p>
        </div>
      </div>
    </Card>
  )
}
