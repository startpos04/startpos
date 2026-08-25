# Sequence Allocation Implementation

This folder contains documentation for the server-side atomic sequence allocation system implemented to fix concurrency issues and ensure BIR compliance.

## Overview

The sequence allocation system ensures that invoice, order, refund, and purchase numbers are generated atomically on the server, preventing duplicate numbers even under high concurrency. This is critical for Philippine BIR compliance and audit trail integrity.

## Implementation Status

**Status**: ✅ Complete and Production-Ready  
**Date Completed**: August 20, 2026  
**Version**: 2.0

## Documents

### [SEQUENCE_ALLOCATION_V1.1_PLAN.md](./SEQUENCE_ALLOCATION_V1.1_PLAN.md)
Complete implementation documentation including:
- Current implementation status for all sequence types
- Phase 1, 2, 3 completion details
- Audit logging system
- Future implementation pattern for STOCK_TRANSFER and COLLECTION_RECEIPT
- Testing and verification details

## What Was Implemented

### Phase 1: Server-Side Atomic Allocation
- ✅ Created `sequence-api.ts` with retry logic and exponential backoff
- ✅ Implemented for INVOICE, ORDER, REFUND, PURCHASE sequences
- ✅ Serializable isolation level for transaction safety
- ✅ Handles serialization conflicts automatically

### Phase 2: Offline Terminal Restrictions  
- ✅ Added `offlineTerminalId` to Branch schema
- ✅ Auth system includes `canCheckoutOffline` flag
- ✅ Only designated terminal can allocate sequences offline
- ✅ Admin UI for designating offline terminals
- ✅ Visual indicators in POS interface

### Phase 3: Testing & Monitoring
- ✅ Integration tests for concurrency scenarios
- ✅ Metrics tracking and logging
- ✅ BIR permit limit enforcement tests
- ✅ Performance monitoring

### Audit Logging (Bonus)
- ✅ Resilient local-first audit logging via `auditLogCollection`
- ✅ Tracks all failed sequence allocations
- ✅ Explains sequence number gaps for BIR audits
- ✅ Automatic retry when connection restored

## Files Modified

### Core Implementation
- `web/src/lib/prisma-client/sequence-api.ts` - Main sequence allocation API
- `web/src/lib/queries/create-pos-transaction.ts` - INVOICE + ORDER sequences
- `web/src/lib/queries/create-pos-order.ts` - ORDER sequences
- `web/src/lib/queries/create-pos-refund.ts` - REFUND sequences
- `web/src/lib/queries/create-purchase.ts` - PURCHASE sequences (quick-receive)
- `web/src/lib/queries/create-purchase-request.ts` - PURCHASE sequences (approval)
- `web/src/lib/queries/restock-ingredient.ts` - PURCHASE sequences (restock)

### Schema & Collections
- `web/prisma/schema.prisma` - Added `offlineTerminalId` field
- `web/src/db/collections.ts` - Added `auditLogCollection`
- `web/src/lib/audit/types.ts` - Added `SEQUENCE_ALLOCATION_FAILED` action

### Auth & UI
- `web/src/lib/better-auth/auth-server.ts` - Added `canCheckoutOffline` flag
- `web/src/lib/server-fn/fetch-branch-users.ts` - Fetch branch members
- `web/src/lib/server-fn/update-offline-terminal.ts` - Set offline terminal
- `web/src/routes/(private)/(dashboard)/settings/-branches/index.tsx` - Admin UI
- `web/src/routes/(private)/pos/-components/offline-mode-indicator.tsx` - Status indicator

### Testing
- `web/__tests__/integration/queries/sequence-allocation-concurrency.integration.test.ts` - Comprehensive concurrency tests

## Key Features

### 1. Atomic Allocation
Sequences are allocated in a single database transaction with Serializable isolation, preventing race conditions.

### 2. Automatic Retry
Serialization conflicts are automatically retried with exponential backoff (50ms → 100ms → 200ms).

### 3. Offline Mode
Only one designated terminal per branch can allocate sequences while offline, preventing collisions when multiple devices lose connectivity.

### 4. BIR Compliance
- Sequence gaps are expected and tracked
- Audit log explains every gap
- 10-year retention support
- PTU number and permit tracking

### 5. Performance
- In-memory metrics tracking
- Conflict statistics monitoring
- Duration tracking for optimization
- Minimal overhead (<10ms typical)

## Usage Example

```typescript
// Online mode - server-side allocation
const result = await sequenceAPI.allocateWithRetry(SequenceType.INVOICE)
if (result.isErr()) {
  return { error: new Error(`Failed: ${result.error}`) }
}
const invoiceNo = result.value.invoiceNo

// Offline mode - local allocation (designated terminal only)
if (!user.canCheckoutOffline) {
  return { error: new Error('Offline checkout not allowed') }
}
const invoiceNo = fetchStructuredId(SequenceType.INVOICE)
```

## Future Work (V1.1)

### Not Yet Implemented
- **STOCK_TRANSFER** - Sequence type exists but no feature code yet
- **COLLECTION_RECEIPT** - Sequence type exists but no feature code yet

These will be implemented using the same pattern when the features are built.

## Testing

Run integration tests:
```bash
npm run test:integration -- sequence-allocation-concurrency
```

## Monitoring

Check sequence allocation metrics:
```typescript
import { sequenceAPI } from '@/lib/prisma-client/sequence-api'

// Get all metrics
const metrics = sequenceAPI.getSequenceAllocationMetrics()

// Get conflict statistics
const stats = sequenceAPI.getConflictStatistics()
```

## Troubleshooting

### Sequence Gaps
Gaps are normal and expected. Check audit logs:
```typescript
const failedAllocations = [...auditLogCollection.values()]
  .filter(log => log.action === 'SEQUENCE_ALLOCATION_FAILED')
```

### Offline Checkout Blocked
Verify user is designated offline terminal in Settings → Branches.

### High Conflict Rate
Check concurrent load - consider scaling or optimizing transaction duration.

## References

- BIR Revenue Regulations No. 18-2012 (E-receipts and Invoices)
- Prisma Transaction Isolation: https://www.prisma.io/docs/concepts/components/prisma-client/transactions
- OPFS Local-First Pattern: Internal architecture docs

---

**Maintained By**: Development Team  
**Last Updated**: August 20, 2026  
**Status**: ✅ Production Ready
