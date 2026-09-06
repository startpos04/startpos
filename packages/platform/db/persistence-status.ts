/**
 * persistence-status.ts — Track and notify about persistence availability
 */

export type PersistenceStatus = 'available' | 'unavailable' | 'unknown'

let status: PersistenceStatus = 'unknown'
let notificationShown = false

export function setPersistenceStatus(newStatus: PersistenceStatus) {
  status = newStatus
}

export function getPersistenceStatus(): PersistenceStatus {
  return status
}

export function isPersistenceAvailable(): boolean {
  return status === 'available'
}

export function shouldShowPersistenceWarning(): boolean {
  return status === 'unavailable' && !notificationShown
}

export function markPersistenceWarningShown() {
  notificationShown = true
}

/**
 * Get a user-friendly message about persistence status
 */
export function getPersistenceStatusMessage(): string | null {
  if (status === 'unavailable') {
    return 'Offline storage is unavailable. Your data will not persist across page refreshes. For full offline support, please use a modern browser with HTTPS.'
  }
  return null
}
