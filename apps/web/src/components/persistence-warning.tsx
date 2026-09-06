/**
 * persistence-warning.tsx — Shows a warning banner when offline persistence is unavailable
 */

import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getPersistenceStatus, getPersistenceStatusMessage, markPersistenceWarningShown, shouldShowPersistenceWarning } from '@platform/db/persistence-status'

export function PersistenceWarning() {
  const [showWarning, setShowWarning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // Check persistence status after component mounts
    const checkStatus = () => {
      if (shouldShowPersistenceWarning()) {
        setMessage(getPersistenceStatusMessage())
        setShowWarning(true)
        markPersistenceWarningShown()
      }
    }

    // Delay check slightly to ensure db module has initialized
    const timer = setTimeout(checkStatus, 1000)
    return () => clearTimeout(timer)
  }, [])

  if (!showWarning || !message) {
    return null
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 shadow-md">
      <div className="container mx-auto flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm flex-1">{message}</p>
        <button
          onClick={() => setShowWarning(false)}
          className="text-white hover:text-amber-100 font-semibold text-sm underline"
          type="button"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
