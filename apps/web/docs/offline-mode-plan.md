# Offline Mode: Single Cashier Restriction & Sequence Auditing

**Status**: ❌ **NOT IMPLEMENTED** - Planning Phase  
**Last Updated**: August 28, 2026  
**Note**: Basic offline mode works (OPFS collections, sync). This plan adds advanced features: single-cashier lock and sequence auditing.

---

## Problem Statement

When the POS system goes offline, we need to ensure:
1. **Single cashier restriction** - Only one account should be allowed to operate in offline mode to prevent sequence number conflicts
2. **Sequence number integrity** - Invoice and order numbers must remain sequential and unique even across online/offline transitions
3. **Multi-cashier audit** - Even when online, we need to track and audit if sequence numbering can work safely with multiple cashiers

## Current Architecture Analysis

### Existing Components

**Sequence Management:**
- `SequenceCounter` model: Tracks last number per branch/business/type/year/month/day
- `fetchStructuredId()`: Generates sequential IDs (SI-2024-000001, #000001, etc.)
- `sequenceCounterCollection`: OPFS collection with eager sync mode
- Sequences are branch-scoped and date-scoped

**Offline Support:**
- `dbTransaction()`: Detects offline via `navigator.onLine`
- TanStack DB OPFS collections for local-first data
- Automatic sync when connection restored
- `applyLocalTransaction()` for offline mutations

**Transaction Flow:**
- `createPosTransaction()`: Main checkout logic
- Linked to `cashierId` (User FK)
- `UsageCounter` for billing period tracking
- FIFO inventory deduction
- Multi-payment support

### Current Gaps

1. **No offline cashier lock** - Multiple devices could go offline simultaneously and generate conflicting sequences
2. **No sequence audit trail** - Cannot track who generated which sequence number
3. **No conflict detection** - No way to detect if two cashiers generated the same number offline
4. **No device identification** - Cannot distinguish between multiple devices/browsers

---

## Proposed Solution

### Phase 1: Database Schema Changes

#### 1.1 Extend SequenceCounter Model

Add offline mode tracking fields:

```prisma
model SequenceCounter {
  id         String       @id
  type       SequenceType
  year       Int
  month      Int
  day        Int
  lastNumber Int

  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  branchId   String
  branch     Branch   @relation(fields: [branchId], references: [id])

  // NEW: Offline mode tracking
  offlineCashierId String? // Set when device goes offline; tracks which cashier owns this sequence
  offlineDeviceId  String? // Device identifier to prevent multi-device conflicts
  isOfflineMode    Boolean @default(false) // True when sequence is in offline-only mode

  sequenceAudits SequenceAudit[] // NEW relation

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([businessId, branchId, type, year, month, day])
  @@index([offlineCashierId, isOfflineMode]) // NEW index
  @@map("sequence_counters")
}
```

#### 1.2 Create SequenceAudit Model

New model for complete audit trail:

```prisma
model SequenceAudit {
  id                String          @id @default(cuid())
  sequenceCounterId String
  sequenceCounter   SequenceCounter @relation(fields: [sequenceCounterId], references: [id], onDelete: Cascade)
  
  sequenceNumber   Int    // The actual number generated (e.g., 1, 2, 3)
  generatedNumber  String // The full formatted ID (e.g., "SI-2024-000001")
  
  cashierId        String
  cashier          User   @relation(fields: [cashierId], references: [id])
  
  deviceId         String? // Device identifier for multi-device tracking
  wasOffline       Boolean @default(false) // True if generated while offline
  
  transactionId    String? @unique // FK to the transaction that used this sequence
  orderId          String? // FK to the order that used this sequence (for ORDER type)
  
  businessId       String
  business         Business @relation(fields: [businessId], references: [id])
  branchId         String
  branch           Branch   @relation(fields: [branchId], references: [id])
  
  createdAt        DateTime @default(now())

  @@index([sequenceCounterId, createdAt])
  @@index([cashierId, wasOffline])
  @@index([businessId, branchId, wasOffline])
  @@index([deviceId, wasOffline])
  @@map("sequence_audits")
}
```

#### 1.3 Add User Relation

```prisma
model User {
  // ... existing fields ...
  
  sequenceAudits SequenceAudit[]
  
  // ... rest of model ...
}
```

---

### Phase 2: Device Identification

Create utility to generate and persist device ID:

**File:** `web/src/lib/device/device-identifier.ts`

```typescript
/**
 * Generates a unique device identifier and persists it in localStorage.
 * Used for offline mode tracking and sequence audit.
 */
export const DeviceIdentifier = {
  getDeviceId(): string {
    const key = 'pos_device_id'
    let deviceId = localStorage.getItem(key)
    
    if (!deviceId) {
      // Generate unique ID: timestamp + random + browser fingerprint
      const timestamp = Date.now().toString(36)
      const random = Math.random().toString(36).substring(2, 15)
      const fingerprint = this.getBrowserFingerprint()
      
      deviceId = `device_${timestamp}_${random}_${fingerprint}`
      localStorage.setItem(key, deviceId)
    }
    
    return deviceId
  },

  getBrowserFingerprint(): string {
    // Simple browser fingerprint (not for security, just for identification)
    const nav = navigator
    const screen = window.screen
    
    const components = [
      nav.userAgent,
      nav.language,
      screen.colorDepth,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
    ]
    
    // Simple hash
    const str = components.join('|')
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    
    return Math.abs(hash).toString(36).substring(0, 8)
  },

  clearDeviceId(): void {
    localStorage.removeItem('pos_device_id')
  }
}
```

---

### Phase 3: Offline Lock Engine

Create engine to manage offline cashier locks:

**File:** `web/src/lib/offline/offline-lock-engine.ts`

```typescript
import { sequenceCounterCollection } from '@/db/collections'
import { authStore } from '@/store/auth-store'
import { DeviceIdentifier } from '../device/device-identifier'
import type { SequenceType } from 'prisma/generated/prisma/enums'

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
        reason: 'No authenticated user'
      }
    }

    const deviceId = DeviceIdentifier.getDeviceId()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : 0

    const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day}`
    const counter = sequenceCounterCollection.get(counterId)

    if (!counter) {
      return {
        isLocked: false,
        canAcquire: true
      }
    }

    if (!counter.isOfflineMode) {
      return {
        isLocked: false,
        canAcquire: true
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
          lockedAt: new Date(counter.updatedAt)
        },
        canAcquire: true, // Already owned by this user
        reason: 'You have the offline lock'
      }
    }

    // Locked by different user or device
    return {
      isLocked: true,
      lockedBy: {
        cashierId: counter.offlineCashierId!,
        cashierName: 'Another cashier', // Would need to look up from userCollection
        deviceId: counter.offlineDeviceId!,
        lockedAt: new Date(counter.updatedAt)
      },
      canAcquire: false,
      reason: 'Offline mode is locked by another cashier'
    }
  },

  /**
   * Acquire offline lock for current user
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
    const day = type === 'ORDER' ? now.getDate() : 0

    const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day}`

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
        day,
        lastNumber: 0,
        businessId: user.business.id,
        branchId: user.branch.id,
        isOfflineMode: true,
        offlineCashierId: user.id,
        offlineDeviceId: deviceId,
        createdAt: now,
        updatedAt: now
      })
    }

    return { success: true }
  },

  /**
   * Release offline lock (when going back online)
   */
  releaseLock(type: SequenceType): void {
    const user = authStore.state.user
    if (!user) return

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : 0

    const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day}`

    if (sequenceCounterCollection.has(counterId)) {
      sequenceCounterCollection.update(counterId, draft => {
        draft.isOfflineMode = false
        draft.offlineCashierId = null
        draft.offlineDeviceId = null
        draft.updatedAt = now
      })
    }
  }
}
```

---

### Phase 4: Enhanced Sequence Generation with Audit

Update `fetchStructuredId()` to include audit logging:

**File:** `web/src/lib/queries/fetch-structured-id-with-audit.ts`

```typescript
import { SequenceType } from 'prisma/generated/prisma/enums'
import { sequenceCounterCollection } from '@/db/collections'
import dayjs from '@/lib/dayjs'
import { authStore } from '@/store/auth-store'
import { DeviceIdentifier } from '../device/device-identifier'
import { OfflineLockEngine } from '../offline/offline-lock-engine'

// Import the new audit collection (to be created)
// import { sequenceAuditCollection } from '@/db/collections'

export interface SequenceGenerationResult {
  success: boolean
  structuredId?: string
  sequenceNumber?: number
  error?: string
}

export function fetchStructuredIdWithAudit(
  type: SequenceType,
  transactionId?: string,
  orderId?: string
): SequenceGenerationResult {
  const { user } = authStore.state
  if (!user) {
    return { success: false, error: 'No authenticated user' }
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  // Check offline lock if offline
  if (isOffline) {
    const lockStatus = OfflineLockEngine.checkLockStatus(type)
    
    if (lockStatus.isLocked && !lockStatus.canAcquire) {
      return {
        success: false,
        error: `Offline mode is locked by ${lockStatus.lockedBy?.cashierName}. Only one cashier can operate offline.`
      }
    }

    // Acquire lock if not already owned
    if (!lockStatus.isLocked) {
      const acquired = OfflineLockEngine.acquireLock(type)
      if (!acquired.success) {
        return { success: false, error: acquired.reason }
      }
    }
  }

  const now = dayjs.utc()
  const year = now.year()
  const month = now.month() + 1
  const day = type === 'ORDER' ? now.date() : 0

  const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day}`
  const existing = sequenceCounterCollection.get(counterId)

  let lastNumber: number

  if (existing) {
    sequenceCounterCollection.update(counterId, draft => {
      draft.lastNumber += 1
      draft.updatedAt = new Date()
    })
    lastNumber = sequenceCounterCollection.get(counterId)!.lastNumber
  } else {
    const deviceId = DeviceIdentifier.getDeviceId()
    sequenceCounterCollection.insert({
      id: counterId,
      type,
      year,
      month,
      day,
      lastNumber: 1,
      businessId: user.business.id,
      branchId: user.branch.id,
      isOfflineMode: isOffline,
      offlineCashierId: isOffline ? user.id : null,
      offlineDeviceId: isOffline ? deviceId : null,
      updatedAt: new Date(),
      createdAt: new Date(),
    })
    lastNumber = 1
  }

  const num = lastNumber.toString().padStart(6, '0')

  // Check BIR permit limit
  if (type === SequenceType.INVOICE && user.branch.maxInvoiceNo) {
    if (lastNumber > user.branch.maxInvoiceNo) {
      return {
        success: false,
        error: `BIR Permit Limit Reached: ${lastNumber} > ${user.branch.maxInvoiceNo}`
      }
    }
  }

  // Generate structured ID
  let structuredId: string
  switch (type) {
    case SequenceType.INVOICE:
      structuredId = `SI-${year}-${num}`
      break
    case SequenceType.REFUND:
      structuredId = `RF-${year}-${num}`
      break
    case SequenceType.ORDER:
      structuredId = `#${num}`
      break
    case SequenceType.STOCK_TRANSFER:
      structuredId = `ST-${year}-${num}`
      break
    case SequenceType.PURCHASE:
      structuredId = `PO-${year}-${num}`
      break
    case SequenceType.COLLECTION_RECEIPT:
      structuredId = `CR-${year}-${num}`
      break
    default:
      structuredId = `${type}-${num}`
  }

  // Create audit entry (when collection is available)
  // sequenceAuditCollection.insert({
  //   id: crypto.randomUUID(),
  //   sequenceCounterId: counterId,
  //   sequenceNumber: lastNumber,
  //   generatedNumber: structuredId,
  //   cashierId: user.id,
  //   deviceId: DeviceIdentifier.getDeviceId(),
  //   wasOffline: isOffline,
  //   transactionId: transactionId || null,
  //   orderId: orderId || null,
  //   businessId: user.business.id,
  //   branchId: user.branch.id,
  //   createdAt: new Date()
  // })

  return {
    success: true,
    structuredId,
    sequenceNumber: lastNumber
  }
}
```

---

### Phase 5: UI Components

#### 5.1 Offline Mode Indicator

**File:** `web/src/components/offline/offline-mode-indicator.tsx`

```typescript
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WifiOff, Lock } from 'lucide-react'
import { OfflineLockEngine } from '@/lib/offline/offline-lock-engine'
import { SequenceType } from 'prisma/generated/prisma/enums'

export function OfflineModeIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [lockStatus, setLockStatus] = useState(
    OfflineLockEngine.checkLockStatus(SequenceType.INVOICE)
  )

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      // Release locks when back online
      OfflineLockEngine.releaseLock(SequenceType.INVOICE)
      OfflineLockEngine.releaseLock(SequenceType.ORDER)
    }

    const handleOffline = () => {
      setIsOffline(true)
      setLockStatus(OfflineLockEngine.checkLockStatus(SequenceType.INVOICE))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      <Badge variant="destructive" className="flex items-center gap-2">
        <WifiOff className="h-4 w-4" />
        Offline Mode
      </Badge>

      {lockStatus.isLocked && !lockStatus.canAcquire && (
        <Alert variant="destructive">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            {lockStatus.reason}
            <br />
            <span className="text-xs">
              Locked by: {lockStatus.lockedBy?.cashierName}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {lockStatus.canAcquire && lockStatus.isLocked && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            You have the offline lock. You're the only cashier who can process transactions.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
```

#### 5.2 Sequence Audit Report Page

**File:** `web/src/routes/(private)/reports/sequence-audit.tsx`

```typescript
// Create a report page showing:
// - All sequence audits with filters
// - Gaps in sequence numbers
// - Multi-cashier conflicts
// - Offline vs online generation statistics
// - Per-cashier sequence usage
```

---

### Phase 6: Integration Points

#### 6.1 Update createPosTransaction

Modify to use new audit system:

```typescript
// In create-pos-transaction.ts
// Replace fetchStructuredId() calls with fetchStructuredIdWithAudit()

const invoiceResult = fetchStructuredIdWithAudit(
  SequenceType.INVOICE,
  transactionId
)

if (!invoiceResult.success) {
  throw new Error(invoiceResult.error)
}

const transaction = {
  id: transactionId,
  invoiceNo: invoiceResult.structuredId!,
  // ... rest of transaction data
}
```

#### 6.2 Add to POS Page

```typescript
// In pos/index.tsx
import { OfflineModeIndicator } from '@/components/offline/offline-mode-indicator'

// Add to render
return (
  <>
    <OfflineModeIndicator />
    {/* existing POS UI */}
  </>
)
```

---

## Implementation Checklist

### Database
- [ ] Create migration for SequenceCounter changes
- [ ] Create migration for SequenceAudit model
- [ ] Update User model with sequenceAudits relation
- [ ] Add SequenceAudit to collections.ts (eager sync mode)

### Core Logic
- [ ] Create DeviceIdentifier utility
- [ ] Create OfflineLockEngine
- [ ] Create fetchStructuredIdWithAudit
- [ ] Update createPosTransaction to use new function
- [ ] Update createPosOrder to use new function

### UI Components
- [ ] Create OfflineModeIndicator component
- [ ] Add indicator to POS page
- [ ] Create sequence audit report page
- [ ] Add conflict detection alerts

### Testing
- [ ] Test single device offline mode
- [ ] Test multi-device offline conflict prevention
- [ ] Test online → offline → online transition
- [ ] Test sequence number continuity
- [ ] Test audit trail accuracy
- [ ] Test BIR permit limit with offline mode

### Documentation
- [ ] Update POS documentation
- [ ] Document offline mode restrictions
- [ ] Document audit report usage
- [ ] Add troubleshooting guide for offline conflicts

---

## Benefits

1. **Data Integrity**: Prevents duplicate sequence numbers across offline sessions
2. **Single Cashier Enforcement**: Only one device can go offline at a time
3. **Complete Audit Trail**: Every sequence number generation is logged with cashier and device
4. **Conflict Detection**: Can identify and report sequence conflicts
5. **Multi-Cashier Analysis**: Can analyze if multiple cashiers can safely work online
6. **BIR Compliance**: Maintains sequential invoicing even in offline scenarios

---

## Future Enhancements

1. **Automatic Lock Release**: Add timeout for stale offline locks (e.g., 24 hours)
2. **Lock Transfer**: Allow admin to forcefully transfer offline lock
3. **Conflict Resolution UI**: Interface to resolve sequence conflicts
4. **Advanced Analytics**: Report on cashier performance and sequence usage patterns
5. **Multi-Branch Coordination**: Extend to handle multi-branch offline scenarios
6. **WebSocket Real-time Lock Status**: Show live lock status across devices

---

## Migration Strategy

1. **Phase 1**: Deploy schema changes (non-breaking)
2. **Phase 2**: Deploy core logic with feature flag OFF
3. **Phase 3**: Enable for pilot branch, monitor for 1 week
4. **Phase 4**: Gradual rollout to all branches
5. **Phase 5**: Make mandatory after 2 weeks of successful operation

---

## Risk Mitigation

**Risk**: Offline lock prevents legitimate user from working
**Mitigation**: Admin dashboard to view and clear locks

**Risk**: Device ID changes (browser cache clear)
**Mitigation**: Implement secondary identification (user session + branch)

**Risk**: Clock skew causes date-based sequence issues
**Mitigation**: Server-side date validation on sync

**Risk**: Audit table grows too large
**Mitigation**: Archive old audits quarterly, keep 1 year online
