# Sequence Allocation V1.1 Plan

## Overview

This document outlines future implementation work for sequence types that are defined in the schema but not yet used in the codebase. Phase 1 server-side atomic sequence allocation has been implemented for all **actively used** sequence types.

## Current Implementation Status (Phase 1 Complete)

### ✅ Implemented Sequence Types

All of the following sequence types have server-side atomic allocation with retry logic, offline terminal restrictions, and audit logging for failures:

1. **INVOICE** - POS checkout transactions
   - File: `web/src/lib/queries/create-pos-transaction.ts`
   - Status: ✅ Server-side allocation with retry
   - Offline: ✅ Restricted to designated terminal
   - Audit: ✅ Failed allocations logged to `auditLogCollection`

2. **ORDER** - POS customer orders
   - File: `web/src/lib/queries/create-pos-order.ts`
   - Status: ✅ Server-side allocation with retry
   - Offline: ✅ Restricted to designated terminal
   - Audit: ✅ Failed allocations logged to `auditLogCollection`

3. **REFUND** - POS refund transactions
   - File: `web/src/lib/queries/create-pos-refund.ts`
   - Status: ✅ Server-side allocation with retry
   - Offline: ✅ Restricted to designated terminal
   - Audit: ✅ Failed allocations logged to `auditLogCollection`

4. **PURCHASE** - Purchase orders and inventory receipts
   - Files:
     - `web/src/lib/queries/create-purchase.ts` (quick-receive path)
     - `web/src/lib/queries/create-purchase-request.ts` (approval workflow)
     - `web/src/lib/queries/restock-ingredient.ts` (ingredient restock)
   - Status: ✅ Server-side allocation with retry
   - Offline: ✅ Restricted to designated terminal
   - Audit: ✅ Failed allocations logged to `auditLogCollection`

### ❌ Not Yet Implemented Sequence Types

The following sequence types are defined in `prisma/schema.prisma` (lines 1284-1291) but are **not yet used** in the codebase:

1. **STOCK_TRANSFER**
   - Schema definition: `STOCK_TRANSFER`
   - Current usage: None (no code references found)
   - V1.1 plan: Implement when stock transfer feature is added

2. **COLLECTION_RECEIPT**
   - Schema definition: `COLLECTION_RECEIPT`
   - Current usage: None (no code references found)
   - V1.1 plan: Implement when collection receipt feature is added

## V1.1 Implementation Plan

### When to Implement

Implement server-side atomic allocation for STOCK_TRANSFER and COLLECTION_RECEIPT when:

1. Feature code is added that uses these sequence types
2. Business requirements are finalized for these features
3. UI/workflow is designed for these operations

### Implementation Pattern

When implementing, follow the same pattern used for INVOICE/ORDER/REFUND/PURCHASE:

```typescript
// 1. Import sequenceAPI
import { sequenceAPI } from '@/lib/prisma-client/sequence-api'
import { fetchStructuredId } from './fetch-structured-id'

// 2. Pre-allocate sequence BEFORE dbTransaction
export const createStockTransfer = async (data: TransferInput) => {
  const { user } = authStore.state
  
  // Server-side allocation with offline guard
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  let transferNo: string

  if (isOffline) {
    // Only designated terminal can create transfers offline
    if (!user.canCheckoutOffline) {
      console.error('[createStockTransfer] Offline transfer blocked')
      return {
        error: new Error(
          'Offline stock transfer is not available. Only the designated offline terminal can create transfers while offline.'
        ),
      }
    }
    transferNo = fetchStructuredId(SequenceType.STOCK_TRANSFER)
  } else {
    // Online: server-side atomic allocation
    const result = await sequenceAPI.allocateWithRetry(SequenceType.STOCK_TRANSFER)
    if (result.isErr()) {
      return { error: new Error(`Failed to allocate transfer number: ${result.error}`) }
    }
    transferNo = result.value.invoiceNo
  }

  // 3. Use pre-allocated sequence in transaction
  const result = await dbTransaction(() => {
    // ... create transfer with transferNo
  })
  
  // 4. Log audit entry if transaction fails
  if (result.isErr()) {
    auditLogCollection.insert({
      id: crypto.randomUUID(),
      businessId: user.business.id,
      actorId: user.id,
      action: AuditAction.SEQUENCE_ALLOCATION_FAILED,
      targetType: AuditTargetType.SequenceCounter,
      targetId: transferNo,
      before: null,
      after: {
        sequenceType: SequenceType.STOCK_TRANSFER,
        transferNo,
        errorMessage: result.error.message,
        timestamp: new Date().toISOString(),
      },
      ipAddress: null,
      createdAt: new Date(),
    })
    return { error: result.error }
  }
}
```

### Key Requirements for V1.1

1. **Server-side allocation** - Use `sequenceAPI.allocateWithRetry()` for online mode
2. **Offline restriction** - Check `user.canCheckoutOffline` before allowing offline operations
3. **Error handling** - Return descriptive errors when allocation fails
4. **Audit logging** - Log failed allocations to `auditLogCollection` for BIR compliance
5. **Transaction safety** - Allocate sequence BEFORE `dbTransaction()` starts
6. **Serialization isolation** - All allocations use Prisma's Serializable isolation level
7. **Retry logic** - Built-in exponential backoff for serialization conflicts (handled by `allocateWithRetry`)

### Testing Requirements

When implementing V1.1 features, add integration tests similar to:
- `web/__tests__/integration/queries/sequence-allocation-concurrency.integration.test.ts`

Test coverage should include:
1. Concurrent allocations produce unique numbers (no duplicates)
2. Serialization conflicts are detected and retried
3. BIR permit limits are enforced atomically
4. Offline terminal restrictions are enforced
5. Different sequence types remain independent

## Database Schema Reference

```prisma
enum SequenceType {
  INVOICE           // ✅ Implemented
  ORDER             // ✅ Implemented
  REFUND            // ✅ Implemented
  PURCHASE          // ✅ Implemented
  STOCK_TRANSFER    // ❌ Not yet implemented
  COLLECTION_RECEIPT // ❌ Not yet implemented
}
```

## Related Documentation

- **Phase 1 Implementation**: Server-side atomic allocation for INVOICE/ORDER/REFUND/PURCHASE (completed)
- **Phase 2 Implementation**: Offline terminal restrictions (completed)
- **Phase 3 Implementation**: Integration tests and monitoring (completed)
- **Audit Logging**: Failed allocations tracked in `auditLogCollection` (completed)
- **Sequence API**: `web/src/lib/prisma-client/sequence-api.ts`
- **Audit Types**: `web/src/lib/audit/types.ts`
- **Collections**: `web/src/db/collections.ts`
- **Schema Definition**: `web/prisma/schema.prisma` (lines 1284-1291)

## Audit Logging

All sequence allocation failures are automatically logged to the `auditLogCollection` for:
- **BIR compliance** - Explains sequence number gaps during audits
- **Debugging** - Helps identify patterns in failures
- **Resilience** - Writes to local OPFS, syncs automatically when online

Audit log structure:
```typescript
{
  action: "SEQUENCE_ALLOCATION_FAILED",
  targetType: "SequenceCounter",
  targetId: "SI-2026-000002", // The burned sequence number
  after: {
    sequenceType: "INVOICE",
    invoiceNo: "SI-2026-000002",
    errorMessage: "Insufficient stock for...",
    timestamp: "2026-08-20T00:37:29.175Z"
  }
}
```

## Decision Log

### Why Not Implement STOCK_TRANSFER and COLLECTION_RECEIPT Now?

**Decision**: Defer implementation until features are actually built.

**Rationale**:
- No code currently uses these sequence types
- Business requirements not finalized
- Would be premature optimization without real usage patterns
- Pattern is well-established and can be applied when needed

**Alternative Considered**: Implement all sequence types preemptively
- Rejected: Creates unused code and potential maintenance burden
- Better to implement just-in-time when feature requirements are clear

---

**Document Version**: 2.0  
**Last Updated**: 2026-08-20  
**Status**: Phase 1 Complete + Audit Logging - V1.1 Pending Feature Development
