/**
 * offline-lock-engine.ts — Web-layer offline sequence lock
 *
 * Manages the single-cashier restriction for offline mode.
 * When a device goes offline, only the cashier who acquired the lock can
 * generate sequence numbers (invoice IDs, order IDs, etc.) — preventing
 * duplicate sequences across concurrent offline devices.
 *
 * Rules:
 * - Only one cashier/device can hold the offline lock at a time
 * - Lock is acquired on the first offline transaction
 * - Lock is released when the device comes back online
 * - Admin can forcefully clear locks via branch settings
 *
 * Lives in web (not platform) because:
 * - It directly manages sequence counter state (POS-specific)
 * - The lock IDs are keyed by businessId/branchId (tenant-scoped)
 * - It's only meaningful in the context of the web POS flow
 */

import { sequenceCounterCollection } from '@platform/db/collections'
import { DeviceIdentifier } from '@platform/lib/device/device-identifier'
import type { SequenceType } from 'prisma/generated/prisma/enums'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tenant + user context required by the lock engine.
 * Obtain from useAuthenticatedUser<ServerUser>() in the calling component.
 */
export interface LockContext {
  userId: string
  userName: string
  businessId: string
  branchId: string
}

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

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export const OfflineLockEngine = {
  /**
   * Check if offline mode is currently locked by another cashier.
   */
  checkLockStatus(type: SequenceType, ctx: LockContext): OfflineLockStatus {
    const deviceId = DeviceIdentifier.getDeviceId()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : undefined

    const counterId = `${ctx.businessId}-${ctx.branchId}-${type}-${year}-${month}-${day ?? 0}`
    const counter = sequenceCounterCollection.get(counterId)

    if (!counter || !counter.isOfflineMode) {
      return { isLocked: false, canAcquire: true }
    }

    // Already owned by this user/device
    if (counter.offlineCashierId === ctx.userId && counter.offlineDeviceId === deviceId) {
      return {
        isLocked: true,
        lockedBy: { cashierId: ctx.userId, cashierName: ctx.userName, deviceId, lockedAt: new Date(counter.updatedAt) },
        canAcquire: true,
        reason: 'You have the offline lock',
      }
    }

    // Locked by someone else
    return {
      isLocked: true,
      lockedBy: {
        cashierId: counter.offlineCashierId || 'unknown',
        cashierName: 'Another cashier',
        deviceId: counter.offlineDeviceId || 'unknown',
        lockedAt: new Date(counter.updatedAt),
      },
      canAcquire: false,
      reason: 'Offline mode is locked by another cashier',
    }
  },

  /**
   * Acquire the offline lock for the current user/device.
   */
  acquireLock(type: SequenceType, ctx: LockContext): { success: boolean; reason?: string } {
    const lockStatus = this.checkLockStatus(type, ctx)

    if (lockStatus.isLocked && !lockStatus.canAcquire) {
      return { success: false, reason: lockStatus.reason || '' }
    }

    const deviceId = DeviceIdentifier.getDeviceId()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : undefined

    const counterId = `${ctx.businessId}-${ctx.branchId}-${type}-${year}-${month}-${day ?? 0}`

    if (sequenceCounterCollection.has(counterId)) {
      sequenceCounterCollection.update(counterId, draft => {
        draft.isOfflineMode = true
        draft.offlineCashierId = ctx.userId
        draft.offlineDeviceId = deviceId
        draft.updatedAt = now
      })
    } else {
      sequenceCounterCollection.insert({
        id: counterId,
        type,
        year,
        month,
        day: day ?? null,
        lastNumber: 0,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        isOfflineMode: true,
        offlineCashierId: ctx.userId,
        offlineDeviceId: deviceId,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { success: true }
  },

  /**
   * Release the offline lock for a specific sequence type.
   * Call when the device comes back online.
   */
  releaseLock(type: SequenceType, ctx: LockContext): void {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : undefined

    const counterId = `${ctx.businessId}-${ctx.branchId}-${type}-${year}-${month}-${day ?? 0}`

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
   * Release all locks across all sequence types.
   * Call on reconnect or admin force-clear.
   */
  releaseAllLocks(ctx: LockContext): void {
    const types: SequenceType[] = ['INVOICE', 'ORDER', 'PURCHASE', 'STOCK_TRANSFER', 'REFUND', 'COLLECTION_RECEIPT']
    for (const type of types) {
      this.releaseLock(type, ctx)
    }
  },
}
