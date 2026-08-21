# CRITICAL: Concurrency Control Requirement for Production Module

**Priority**: BLOCKER — Must be resolved before Sprint 3 (POS Integration)  
**Date**: 2026-08-20  
**Issue**: Original spec incorrectly deferred concurrency control to "Phase 1.5"  
**Resolution**: Optimistic locking is REQUIRED for MVP correctness

---

## Problem Statement

The Production Module handles finished goods inventory that will be sold through the POS system. When two POS terminals attempt to sell the last few units of a batch-prepared product simultaneously, a race condition can occur:

```
Initial State: 5 units available

Terminal A (12:00:00.000):                Terminal B (12:00:00.001):
1. Read inventory: 5 available            1. Read inventory: 5 available
2. Check: 5 >= 3 needed ✓                 2. Check: 5 >= 3 needed ✓
3. Deduct: 5 - 3 = 2                      3. Deduct: 5 - 3 = 2
4. Write: quantity = 2                    4. Write: quantity = 2

Final State: 2 units (WRONG - should be -1 or one transaction should fail)
Result: 6 units sold from 5 available inventory → NEGATIVE INVENTORY BUG
```

---

## Root Cause Analysis

### What the Original Spec Said

> "Level 1 (Transaction Atomicity) provides basic protection via TanStack DB's transaction isolation."

### What Actually Happens

1. **TanStack DB** → calls `transactionAPI.execute()`
2. **transactionAPI** → calls `prisma.$transaction()`
3. **Prisma default** → uses **Read Committed** isolation level
4. **Read Committed** → allows dirty reads between transactions

### Read Committed Behavior

```typescript
// Both transactions execute this code:
await dbTransaction(() => {
  const available = getFinishedInventory(variantId) // Both read 5
  
  if (available < needed) { // Both pass check
    throw new Error('Out of stock')
  }
  
  deductInventory(needed) // Both deduct
})
```

**Result**: Both transactions read the same value (5) before either commits. Both pass the availability check. Both write their deductions. Final inventory is incorrect.

---

## Evidence

### From the Codebase

**File**: `src/lib/prisma-client/transaction-api.ts`

```typescript
const txResult = await ResultAsync.fromPromise(
  tenantPrisma.$transaction(async tx => {
    // ... operations ...
  }),
  // NO isolation level specified → uses Prisma default (Read Committed)
)
```

**File**: `src/lib/prisma-client/sequence-api.ts` (for comparison)

```typescript
const result = await tenantPrisma.$transaction(
  async tx => { ... },
  {
    isolationLevel: 'Serializable', // ← EXPLICITLY SET for sequence allocation
    timeout: 5000,
  },
)
```

**Why sequence-api uses Serializable**: Because it needs to prevent the exact same race condition when allocating sequential invoice numbers.

---

## Solution: Optimistic Locking

### Required Changes

#### 1. Sprint 1: Add version column to Inventory schema

```prisma
model Inventory {
  // ... existing fields ...
  
  // Optimistic locking for concurrency control
  version Int @default(1)
  
  // ... rest of fields ...
}
```

#### 2. Sprint 3: Implement version checking in FinishedGoodsEngine

```typescript
export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConcurrencyError'
  }
}

// In consumeFinishedGoods():
for (const batch of finishedBatches) {
  const expectedVersion = batch.version
  
  inventoryCollection.update(batch.id, draft => {
    // CRITICAL: This check prevents double-sales
    if (draft.version !== expectedVersion) {
      throw new ConcurrencyError(
        `Inventory ${batch.id} was modified by another transaction`
      )
    }
    draft.quantity -= toConsume
    draft.version += 1 // Increment for next transaction
  })
}
```

#### 3. Sprint 3: Implement retry wrapper

```typescript
async function createPOSTransactionWithRetry(
  data: CreatePOSTransactionParams,
  maxAttempts = 3
): Promise<Result<Transaction, Error>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await createPOSTransaction(data)
    } catch (error) {
      // Retry ONLY on concurrency conflicts
      if (error instanceof ConcurrencyError && attempt < maxAttempts) {
        await sleep(100 * Math.pow(2, attempt - 1)) // Exponential backoff
        console.log(`Concurrency conflict, retry ${attempt}/${maxAttempts}`)
        continue
      }
      throw error // Re-throw if not concurrency error or max attempts reached
    }
  }
}
```

### How This Fixes the Race Condition

```
Terminal A:                               Terminal B:
1. Read: { id: 1, qty: 5, version: 1 }   1. Read: { id: 1, qty: 5, version: 1 }
2. Check: 5 >= 3 ✓                        2. Check: 5 >= 3 ✓
3. Update WHERE version = 1:              3. Update WHERE version = 1:
   SET qty = 2, version = 2 ✓                (version is now 2, update fails)
4. Commit                                 4. ConcurrencyError thrown
                                          5. Retry:
                                          6. Read: { id: 1, qty: 2, version: 2 }
                                          7. Check: 2 >= 3 ✗
                                          8. throw OutOfStockError

Final State: 2 units (CORRECT)
Result: First sale succeeds, second fails with out-of-stock error
```

---

## Why NOT Use Serializable Isolation?

We could modify `transactionAPI` to always use `Serializable`:

```typescript
prisma.$transaction(async tx => { ... }, {
  isolationLevel: 'Serializable'
})
```

**Why we don't**:
1. **Performance**: Serializable has higher transaction abort rate under contention
2. **Global impact**: Would affect ALL transactions, not just production module
3. **Granular control**: Optimistic locking protects only the rows that need it
4. **Error handling**: Can distinguish concurrency conflicts from business logic errors

**Decision**: Use optimistic locking for production module. Leave general transaction isolation as-is.

---

## Test Requirement

**File**: `__tests__/integration/production/concurrent-sales.integration.test.ts`

```typescript
describe('Concurrent POS Sales - Production Module', () => {
  it('prevents double-sales when two terminals sell last units simultaneously', async () => {
    // GIVEN: 5 units of batch-prepared finished goods
    const variant = await createBatchPreparedProduct()
    await createFinishedInventory(variant.id, { quantity: 5, version: 1 })
    
    // WHEN: Two terminals simultaneously attempt to sell 3 units each
    // CRITICAL: These must be real concurrent transactions, not sequential awaits
    const sale1 = createPOSTransaction({ items: [{ variantId: variant.id, qty: 3 }] })
    const sale2 = createPOSTransaction({ items: [{ variantId: variant.id, qty: 3 }] })
    
    const results = await Promise.allSettled([sale1, sale2])
    
    // THEN: Exactly one succeeds, one fails
    const succeeded = results.filter(r => r.status === 'fulfilled')
    const failed = results.filter(r => r.status === 'rejected')
    
    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    
    // AND: Final inventory is correct (2 units, not negative)
    const finalInventory = await getFinishedInventory(variant.id)
    expect(finalInventory.quantity).toBe(2)
    expect(finalInventory.version).toBe(2)
  })
  
  it('succeeds on retry after concurrency conflict', async () => {
    // Test that retry logic works when version conflict occurs
    // Mock first attempt to throw ConcurrencyError, second to succeed
  })
  
  it('does NOT retry on genuine out-of-stock errors', async () => {
    // GIVEN: Only 2 units available
    // WHEN: Attempt to sell 5 units
    // THEN: Should fail immediately without retry
  })
})
```

---

## Acceptance Criteria

Before Sprint 3 POS Integration can be marked complete:

- [ ] `version Int @default(1)` column exists in `Inventory` table
- [ ] `ConcurrencyError` class defined
- [ ] Version checking implemented in `FinishedGoodsEngine.consumeFinishedGoods()`
- [ ] `createPOSTransactionWithRetry()` wrapper implemented with exponential backoff
- [ ] Retry logic distinguishes `ConcurrencyError` from `OutOfStockError`
- [ ] Concurrent sales test passes with REAL concurrent transactions (not mocked/sequential)
- [ ] Test verifies final inventory is never negative
- [ ] Test verifies exactly one transaction succeeds when both request more than available

---

## Migration Note

If Sprint 1 schema migration already ran WITHOUT the `version` column, create a follow-up migration:

```prisma
-- Add version column with default value
ALTER TABLE inventory ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Existing rows will get version = 1
-- New production will start incrementing from there
```

This is safe because:
- Existing inventory (raw materials) doesn't use the version check
- Only finished goods inventory (created by production module) uses version checking
- Production module hasn't launched yet, so no finished goods exist

---

## References

- **Detailed Analysis**: `production-edge-cases.md` §3 (Concurrency Control for POS Sales)
- **Main Specification**: `production-module-spec.md` Phase 1.2 (Inventory Model), Phase 2.2 (Finished Goods Consumption), Sprint 1 & 3
- **Prisma Docs**: https://www.prisma.io/docs/concepts/components/prisma-client/transactions#transaction-isolation-level
- **Sequence Allocation Example**: `src/lib/prisma-client/sequence-api.ts` (uses Serializable for similar race condition)

---

**Status**: RESOLVED — Specification updated, implementation requirements clarified  
**Next Action**: Begin Sprint 1 with `version` column in schema migration
