/**
 * Offline Lock Engine - Manages single-cashier restriction for offline mode
 *
 * Purpose: Prevents sequence number conflicts when multiple devices go offline
 *
 * Rules:
 * - Only one cashier/device can hold the offline lock at a time
 * - Lock is automatically acquired on first offline transaction
 * - Lock is released when device goes back online
 * - Admin can forcefully clear locks via branch settings
 */

import type { SequenceType } from 'prisma/generated/prisma/enums'
import { sequenceCounterCollection } from '@/db/collections'
import { authStore } from '@/lib/better-auth/auth-store'
import { DeviceIdentifier } from '../device/device-identifier'

export interface OfflineLockStatus {
  isLocked: boolean
  lockedBy?: {
    cashierId: string
    cashierName: string
    deviceId: string
    lockedAt: Date
  }
  canAcquire: boolean
  reason?: string
}

export const OfflineLockEngine = {
  /**
   * Check if offline mode is currently locked by another cashier
   */
  checkLockStatus(type: SequenceType): OfflineLockStatus {
    const user = authStore.state.user
    if (!user) {
      return {
        isLocked: false,
        canAcquire: false,
        reason: 'No authenticated user',
      }
    }

    const deviceId = DeviceIdentifier.getDeviceId()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : undefined

    const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day || 0}`
    const counter = sequenceCounterCollection.get(counterId)

    if (!counter) {
      return {
        isLocked: false,
        canAcquire: true,
      }
    }

    if (!counter.isOfflineMode) {
      return {
        isLocked: false,
        canAcquire: true,
      }
    }

    // Check if locked by current user/device
    if (counter.offlineCashierId === user.id && counter.offlineDeviceId === deviceId) {
      return {
        isLocked: true,
        lockedBy: {
          cashierId: user.id,
          cashierName: user.name,
          deviceId,
          lockedAt: new Date(counter.updatedAt),
        },
        canAcquire: true, // Already owned by this user
        reason: 'You have the offline lock',
      }
    }

    // Locked by different user or device
    return {
      isLocked: true,
      lockedBy: {
        cashierId: counter.offlineCashierId || 'unknown',
        cashierName: 'Another cashier', // Would need to look up from userCollection
        deviceId: counter.offlineDeviceId || 'unknown',
        lockedAt: new Date(counter.updatedAt),
      },
      canAcquire: false,
      reason: 'Offline mode is locked by another cashier',
    }
  },

  /**
   * Acquire offline lock for current user/device
   */
  acquireLock(type: SequenceType): { success: boolean; reason?: string } {
    const user = authStore.state.user
    if (!user) {
      return { success: false, reason: 'No authenticated user' }
    }

    const lockStatus = this.checkLockStatus(type)

    if (lockStatus.isLocked && !lockStatus.canAcquire) {
      return { success: false, reason: lockStatus.reason }
    }

    const deviceId = DeviceIdentifier.getDeviceId()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : undefined

    const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day || 0}`

    if (sequenceCounterCollection.has(counterId)) {
      sequenceCounterCollection.update(counterId, draft => {
        draft.isOfflineMode = true
        draft.offlineCashierId = user.id
        draft.offlineDeviceId = deviceId
        draft.updatedAt = now
      })
    } else {
      sequenceCounterCollection.insert({
        id: counterId,
        type,
        year,
        month,
        day: day || null,
        lastNumber: 0,
        businessId: user.business.id,
        branchId: user.branch.id,
        isOfflineMode: true,
        offlineCashierId: user.id,
        offlineDeviceId: deviceId,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { success: true }
  },

  /**
   * Release offline lock (called when device goes back online)
   */
  releaseLock(type: SequenceType): void {
    const user = authStore.state.user
    if (!user) return

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : undefined

    const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day || 0}`

    if (sequenceCounterCollection.has(counterId)) {
      sequenceCounterCollection.update(counterId, draft => {
        draft.isOfflineMode = false
        draft.offlineCashierId = null
        draft.offlineDeviceId = null
        draft.updatedAt = now
      })
    }
  },

  /**
   * Release all locks for all sequence types (admin function)
   */
  releaseAllLocks(): void {
    const user = authStore.state.user
    if (!user) return

    const types: SequenceType[] = ['INVOICE', 'ORDER', 'PURCHASE', 'STOCK_TRANSFER', 'REFUND', 'COLLECTION_RECEIPT']

    types.forEach(type => {
      this.releaseLock(type)
    })
  },
}
