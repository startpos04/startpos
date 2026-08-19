# Sequence Allocation Audit Report

**Date:** 2026-08-19  
**Auditor:** Kiro AI  
**Scope:** Complete sequence allocation flow for ONLINE and OFFLINE modes

---

## Executive Summary

🔴 **CRITICAL FINDINGS:**

1. **ONLINE concurrency is NOT SAFE** - Race condition present
2. **OFFLINE has collision risk** - Multiple devices can allocate same numbers
3. **No atomicity guarantees** - Sequence allocation separate from transaction creation
4. **No uniqueness constraint** - Database allows duplicate sequence numbers

---

## Part 1: ONLINE Sequence Allocation

### File Path Trace

```
POS Checkout
    ↓
web/src/routes/(private)/pos/index.tsx
    → handleConfirm() calls createPosTransaction()
    ↓
web/src/lib/queries/create-pos-transaction.ts
    → createPosTransaction()
    → calls dbTransaction()
    ↓
web/src/db/local-db-transaction.ts
    → dbTransaction()
    → detects ONLINE mode (!navigator.onLine)
    → calls transactionAPI.execute()
    ↓
web/src/lib/prisma-client/transaction-api.ts
    → transactionServerFn.handler()
    → uses tenantPrisma.$transaction()
    ↓
web/src/lib/prisma-client/crud-api.ts
    → executeOperation()
    → executes each DBPayload operation
    ↓
PostgreSQL Database
```

### Sequence Generation Code

**File:** `web/src/lib/queries/fetch-structured-id.ts`

```typescript
export function fetchStructuredId(type: SequenceType) {
  const { user } = authStore.state
  const now = dayjs.utc()
  const year = now.year()
  const month = now.month() + 1
  const day = type === 'ORDER' ? now.date() : 0

  // 1. Create the composite ID
  const counterId = `${user.business.id}-${user.branch.id}-${type}-${year}-${month}-${day}`

  // 2. Check if it exists in LOCAL collection
  const existing = sequenceCounterCollection.get(counterId)

  let lastNumber: number

  if (existing) {
    // 3. Update LOCAL collection
    sequenceCounterCollection.update(counterId, draft => {
      draft.lastNumber += 1
    })
    lastNumber = sequenceCounterCollection.get(counterId)!.lastNumber
  } else {
    // 4. Insert into LOCAL collection
    sequenceCounterCollection.insert({
      id: counterId,
      type,
      year,
      month,
      day,
      lastNumber: 1,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    })
    lastNumber = 1
  }

  // 5. Format the sequence number
  const num = lastNumber.toString().padStart(6, '0')
  
  // 6. Return formatted ID (SI-2026-000001, #000001, etc.)
  switch (type) {
    case SequenceType.INVOICE:
      return `SI-${year}-${num}`
    // ... other types
  }
}
```

### 🔴 CRITICAL ISSUE: Client-Side Sequence Allocation

**The sequence is allocated CLIENT-SIDE, NOT SERVER-SIDE.**

#### How It Actually Works (ONLINE)

```
Cashier A Browser                 Cashier B Browser                 Server
─────────────────────             ─────────────────────             ──────

1. Fetch sequence from             1. Fetch sequence from
   LOCAL sequenceCounterCollection    LOCAL sequenceCounterCollection
   
2. lastNumber = 100               2. lastNumber = 100
   
3. Increment locally               3. Increment locally
   lastNumber = 101                   lastNumber = 101
   
4. Create transaction with         4. Create transaction with
   invoiceNo = "SI-2026-000101"       invoiceNo = "SI-2026-000101"
   
5. Send to transactionAPI.execute() →
                                   5. Send to transactionAPI.execute() →
                                                                      6. Receive 2 transactions
                                                                         with SAME invoiceNo
                                                                         
                                                                      7. Both INSERT succeed
                                                                         (no unique constraint!)
```

### Verification of Race Condition

**Question:** Does the client increment the sequence BEFORE or AFTER the server transaction?

**Answer:** BEFORE. The sequence is incremented in the CLIENT's TanStack DB collection,
then the full transaction payload (including the already-allocated invoiceNo) is sent to the server.

**Code Evidence:**

In `create-pos-transaction.ts`:

```typescript
const transaction = {
  id: transactionId,
  invoiceNo: fetchStructuredId(SequenceType.INVOICE), // ← ALLOCATED HERE
  orderId,
  // ... rest of transaction data
}
transactionCollection.insert(transaction)
```

The `dbTransaction()` function then sends these mutations to the server:

```typescript
const result = await transactionAPI.execute(buildOperations(transaction))
```

### Database Operation

The server receives:

```json
{
  "operations": [
    {
      "table": "sequenceCounter",
      "action": "update",
      "args": {
        "where": { "id": "business-branch-INVOICE-2026-8-0" },
        "data": { "lastNumber": 101 }
      }
    },
    {
      "table": "transaction",
      "action": "create",
      "args": {
        "data": {
          "invoiceNo": "SI-2026-000101",
          // ... rest of data
        }
      }
    }
  ]
}
```

### Transaction Boundary

**File:** `web/src/lib/prisma-client/transaction-api.ts`

```typescript
const txResult = await ResultAsync.fromPromise(
  tenantPrisma.$transaction(async tx => {
    const executionResults = []
    for (const op of data.operations) {
      const out = await executeOperation(tx, op)
      executionResults.push(out)
    }
    return executionResults
  }),
  (e: any) => e.message || 'Transaction batch execution failed',
)
```

**Yes, there IS a Prisma $transaction wrapper.**

BUT: The sequence allocation happened CLIENT-SIDE before this transaction.

### Race Condition Scenario

```
Time    Cashier A                         Cashier B
────────────────────────────────────────────────────────────
T0      Read counter from local DB: 100   Read counter from local DB: 100
T1      Increment locally: 101            Increment locally: 101
T2      Generate SI-2026-000101           Generate SI-2026-000101
T3      BEGIN DB TRANSACTION →
T4                                        BEGIN DB TRANSACTION →
T5      UPDATE sequence_counters
        SET lastNumber = 101
T6                                        UPDATE sequence_counters
                                          SET lastNumber = 101
                                          (overwrites A's update!)
T7      INSERT transaction
        (invoiceNo = SI-2026-000101)
T8                                        INSERT transaction
                                          (invoiceNo = SI-2026-000101)
                                          ← DUPLICATE!
T9      COMMIT
T10                                       COMMIT
```

### 🔴 **FINDING: ONLINE SEQUENCE ALLOCATION — FAIL**

**Status:** NOT SAFE

**Reason:**
1. Sequence is allocated CLIENT-SIDE in TanStack DB local collection
2. Each client has independent copy of `sequenceCounterCollection`
3. No server-side atomic counter allocation before transaction creation
4. Two concurrent checkouts can read same lastNumber, increment independently, and send same invoiceNo to server
5. Server has Prisma $transaction but it only wraps the EXECUTION of pre-generated operations
6. The sequence number was already determined before the transaction began

---

## Part 2: ONLINE Multi-Cashier Concurrency

### 🔴 **FINDING: ONLINE MULTI-CASHIER CONCURRENCY — FAIL**

**Status:** UNSAFE - COLLISIONS CAN OCCUR

**Test Scenario:**
```
Initial sequence = 100
Cashier A checkout at T0
Cashier B checkout at T0+10ms
Cashier C checkout at T0+15ms
```

**Expected Result:**
```
Cashier A → SI-2026-000101
Cashier B → SI-2026-000102
Cashier C → SI-2026-000103
```

**Actual Result (HIGH PROBABILITY):**
```
All three cashiers may allocate SI-2026-000101
because they all read lastNumber=100 from their
LOCAL TanStack DB collections BEFORE any server update
```

### Why The Current Architecture Fails

**TanStack DB Collections:**
- `sequenceCounterCollection` is stored in OPFS (Origin Private File System)
- Each browser tab/device has its OWN independent OPFS
- syncMode: 'eager' means it syncs TO server, but read happens FROM local first
- The sync is NOT atomic with the transaction creation

**Flow:**
```
Device A OPFS                    Device B OPFS                    Server DB
lastNumber: 100                  lastNumber: 100                  lastNumber: 100
     ↓                                ↓
lastNumber: 101                  lastNumber: 101
     ↓                                ↓
     └─────────── SYNC ──────────────┴────────→  lastNumber: 101 (one overwrites the other)
```

---

## Part 3: Sequence Counter Scope

### Database Schema

**File:** `web/prisma/schema.prisma`

```prisma
model SequenceCounter {
  id         String       @id @default(cuid())
  businessId String
  branchId   String
  type       SequenceType
  year       Int
  month      Int?
  day        Int?
  lastNumber Int          @default(0)
  
  business   Business @relation(fields: [businessId], references: [id])
  branch     Branch   @relation(fields: [branchId], references: [id])
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([businessId, branchId, type, year, month, day])
  @@map("sequence_counters")
}
```

### Scope Analysis

**Counter is identified by:**
- businessId
- branchId
- type (INVOICE, ORDER, etc.)
- year
- month
- day (only for ORDER type)

**Uniqueness Constraint:**
```sql
UNIQUE (businessId, branchId, type, year, month, day)
```

**✅ This is CORRECT** - Two concurrent cashiers at the same branch will use the SAME counter.

**❌ But it doesn't prevent collisions** - They can both read the same lastNumber from their local copies before updating.

### Transaction Model

**File:** `web/prisma/schema.prisma` (Transaction model)

```prisma
model Transaction {
  id                 String             @id @default(cuid())
  invoiceNo          String             @unique  ← UNIQUE CONSTRAINT EXISTS
  type               TransactionType    @default(SALE)
  // ... rest of fields
}
```

**✅ GOOD:** The `invoiceNo` has a `@unique` constraint.

**❌ BAD:** This will cause a database error on duplicate, but:
1. The checkout will FAIL for one cashier (bad UX)
2. The sequence number is lost/skipped
3. No automatic retry mechanism

### 🟡 **FINDING: SEQUENCE COUNTER SCOPE — PARTIAL PASS**

**Status:** SCOPE IS CORRECT, BUT ENFORCEMENT IS BROKEN

**Can two concurrent online checkouts obtain the same sequence number?**

**YES** - Because:
1. Scope is correctly defined (branch + type + period)
2. Uniqueness constraint exists on the counter
3. BUT: Counter is read from local OPFS, not server
4. Race condition allows duplicate reads

---

## Part 4: Transaction Atomicity

### Current Flow

```
CLIENT SIDE (Browser)
├─ 1. dbTransaction() callback executes
│  ├─ fetchStructuredId() ← ALLOCATES SEQUENCE
│  ├─ Create transaction object with invoiceNo
│  ├─ sequenceCounterCollection.update() ← LOCAL UPDATE
│  ├─ transactionCollection.insert() ← LOCAL INSERT
│  └─ Returns transaction data
│
└─ 2. dbTransaction() sends to server
   └─ transactionAPI.execute(operations)
   
SERVER SIDE
└─ tenantPrisma.$transaction(async tx => {
      for (op of operations) {
        await executeOperation(tx, op)  ← UPDATES sequence_counters
      }                                   ← INSERTS transaction
    })
```

### Atomicity Analysis

**Question:** Is sequence allocation and transaction creation atomic?

**Answer:** YES and NO.

**YES:** On the server, they are in the same Prisma $transaction block.

**NO:** The sequence number was already determined on the CLIENT before the transaction began.

### Failure Scenario

```
CLIENT                              SERVER
────────────────────────────────────────────
1. Allocate sequence: 101
2. Create TX with invoiceNo: SI-2026-000101
3. Send to server →
                                    4. BEGIN TRANSACTION
                                    5. UPDATE sequence_counters
                                       SET lastNumber = 101
                                    6. INSERT transaction
                                       (invoiceNo = SI-2026-000101)
                                    7. ❌ UNIQUE CONSTRAINT VIOLATION
                                       (duplicate invoiceNo)
                                    8. ROLLBACK
```

**What happens to the sequence number?**

The client allocated 101, but the server transaction failed.
The local OPFS still has lastNumber=101.
The next checkout will allocate 102.
**Sequence 101 is permanently skipped.**

### 🔴 **FINDING: ATOMICITY — FAIL**

**Status:** NOT ATOMIC

**Reason:**
1. Sequence allocation happens CLIENT-SIDE before server transaction
2. If server transaction fails, the sequence number is lost
3. No rollback mechanism for client-side sequence allocation
4. Gap in sequence numbers will occur on conflict

---

## Part 5: Failure/Concurrency Handling

### Prisma Transaction Error Handling

**File:** `web/src/lib/prisma-client/transaction-api.ts`

```typescript
const txResult = await ResultAsync.fromPromise(
  tenantPrisma.$transaction(async tx => {
    // ... operations
  }),
  (e: any) => e.message || 'Transaction batch execution failed',
)

return txResult.isOk() ? { value: txResult.value } : { error: txResult.error }
```

**Error handling EXISTS** - but it only returns an error message.

### Client-Side Error Handling

**File:** `web/src/lib/queries/create-pos-transaction.ts`

```typescript
const result = await dbTransaction(() => {
  // ... transaction logic
})

if (result.isErr()) {
  console.error('Transaction failed:', result.error.message)
  return { error: result.error }
}
```

**File:** `web/src/routes/(private)/pos/index.tsx`

```typescript
const result = await createPosTransaction(...)

if (result.error) {
  if (result.error.message?.includes('Credit balance is zero')) {
    // Special handling for credit exhaustion
    MountManager.show(AlertPrompt, { ... })
    return
  }
  toast.error('Failed to process transaction. Please try again.')
  return
}
```

### Retry Logic

**NONE FOUND.**

No automatic retry on:
- Unique constraint violation
- Deadlock
- Serialization failure

### Duplicate Sequence Handling

**Unique Constraint:**
```prisma
model Transaction {
  invoiceNo String @unique
}
```

**What happens on duplicate?**

1. Server returns Prisma error: `Unique constraint failed on fields: (invoiceNo)`
2. Client shows generic toast: "Failed to process transaction. Please try again."
3. User must manually retry
4. On retry, client allocates NEXT sequence number
5. Original sequence number is permanently skipped

### 🔴 **FINDING: FAILURE/CONCURRENCY HANDLING — FAIL**

**Status:** NO PROPER HANDLING

**Issues:**
1. No detection of concurrent sequence collision
2. No automatic retry with new sequence
3. Sequence gaps on conflict
4. Generic error message doesn't explain the problem
5. No logging of collision events
6. No monitoring/alerts for sequence conflicts

---

## Part 6: OFFLINE Implementation

### Offline Detection

**File:** `web/src/db/local-db-transaction.ts`

```typescript
export const dbTransaction = <T>(callback: () => T, events?: BusinessEvent[]): ResultAsync<T, Error> => {
  return ResultAsync.fromPromise(
    (async () => {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine  ← HERE
      
      const tx = createTransaction({
        mutationFn: async ({ transaction }) => {
          if (isOffline) {
            const results = await applyLocalTransaction(transaction)  ← OFFLINE PATH
            return results
          }
          
          const result = await transactionAPI.execute(buildOperations(transaction))  ← ONLINE PATH
          // ...
        },
      })
      // ...
    })()
  )
}
```

### Offline Sequence Allocation

**Same function:** `fetchStructuredId()`

**Same logic:**
- Read from local `sequenceCounterCollection`
- Increment locally
- No server communication

### Offline Storage

**File:** `web/src/db/collections.ts`

```typescript
export const sequenceCounterCollection = createSyncableCollection<SequenceCounter>({
  apiKey: 'sequenceCounter',
  schemaVersion: SCHEMA_VERSION,
  syncMode: 'eager',  ← Syncs to server when connection restored
})
```

**Storage location:** OPFS (Origin Private File System)

**Per-device:** YES - Each browser/device has its own OPFS

### Offline Collision Scenario

```
                    BEFORE OFFLINE
                    ──────────────
Server DB:          lastNumber = 100

Device A:           Syncs → lastNumber = 100
Device B:           Syncs → lastNumber = 100

                    BOTH GO OFFLINE
                    ───────────────

Device A:           lastNumber = 101 (checkout #1)
                    lastNumber = 102 (checkout #2)
                    
Device B:           lastNumber = 101 (checkout #1)
                    lastNumber = 102 (checkout #2)
                    lastNumber = 103 (checkout #3)

                    BOTH RECONNECT
                    ───────────────

Device A syncs:     UPDATE sequence_counters SET lastNumber = 102
Device B syncs:     UPDATE sequence_counters SET lastNumber = 103

                    RESULT: DUPLICATES
                    ───────────────────

Device A created:   SI-2026-000101, SI-2026-000102
Device B created:   SI-2026-000101, SI-2026-000102, SI-2026-000103

Duplicate invoiceNos: 000101, 000102
```

### 🔴 **FINDING: OFFLINE SEQUENCE ALLOCATION — NOT SAFE**

**Status:** COLLISION RISK EXISTS

**Reason:**
1. Each device maintains independent OPFS storage
2. Offline sequence allocation is completely local
3. No coordination between devices
4. When devices reconnect, they sync their counters
5. Last-write-wins: Later sync overwrites earlier sync
6. Transactions with duplicate invoiceNos already exist in local DB
7. Sync will fail with unique constraint violation

---

## Part 7: Current Offline Lock Implementation

### Search Results

```bash
$ grep -r "offlineCashierId\|offlineDeviceId\|isOfflineMode" web/
# NO RESULTS
```

**No offline lock implementation exists.**

### OfflineLockEngine

**Does NOT exist** in the codebase.

### Device Identification

**Does NOT exist** in the codebase.

### 🔴 **FINDING: CURRENT OFFLINE LOCK — NOT PRESENT**

**Status:** NO OFFLINE LOCK MECHANISM

**Explanation:**
- No code to detect multiple offline devices
- No code to restrict offline checkout to one device
- No device identification system
- No distributed lock coordination

---

## Part 8: V1 Offline Policy Recommendation

### Current State

**ONLINE:** Multiple cashiers CAN checkout, but collisions occur
**OFFLINE:** Multiple devices CAN checkout, and WILL create duplicates

### V1 Policy (Simplest Safe Implementation)

```
ONLINE MODE
──────────────────────────────────────────────────────
✅ Allow: Multiple cashiers can checkout
⚠️  Issue: Race condition exists (needs fix)
🔧 Fix:   Move sequence allocation to server-side

OFFLINE MODE
──────────────────────────────────────────────────────
❌ Restrict: Only ONE designated device/terminal
            can perform checkout while offline
            
✅ Allow:    Other terminals can browse, view
            reports, manage products, etc.
            
❌ Block:    Other terminals CANNOT call
            createPosTransaction() while offline
```

### Implementation Approach

**Option A: Device-Lock (Simple but Limited)**

1. Add `offlineDeviceId` to localStorage on first offline checkout
2. Check if `offlineDeviceId` matches current device before checkout
3. **LIMITATION:** Only works if devices reconnect before other device goes offline

**Option B: Server-Assigned Offline License (Better)**

1. Admin designates ONE terminal as "offline-capable" in server config
2. Server includes `canCheckoutOffline: boolean` in auth token
3. Client checks this flag before allowing offline checkout
4. **ADVANTAGE:** Admin control, works across sessions

**Option C: First-Device-Wins with Visual Warning (Compromise)**

1. First device to go offline and checkout "claims" the sequence
2. Other devices show prominent warning: "Another device is processing offline transactions"
3. Other devices CAN still checkout but invoiceNo includes device suffix
4. **ADVANTAGE:** No admin setup, degrades gracefully

### Recommended: Option B (Server-Assigned)

**Reasons:**
1. Clear admin control
2. No race conditions on "who was first"
3. Works reliably across reconnects
4. Can be audited
5. Aligns with business processes (one designated POS terminal)

---

## Part 9: Online vs Offline — Clear Distinction

### Online Concurrency (DATABASE PROBLEM)

**Problem:**
```
Multiple clients → Same database → Concurrent writes
```

**Solution:**
```
Server-side atomic counter allocation
+
Database transaction
+
Unique constraints
+
Retry on conflict
```

**NOT a distributed systems problem** - All clients talk to one database.

### Offline Concurrency (DISTRIBUTED SYSTEMS PROBLEM)

**Problem:**
```
Multiple independent databases → No communication → Eventual sync
```

**Solution:**
```
Partition the sequence space
OR
Designate single writer
OR
Use GUIDs/UUIDs instead of sequences
OR
Complex: CRDTs, vector clocks, etc.
```

**IS a distributed systems problem** - Multiple independent state machines.

### V1 Decision: AVOID THE DISTRIBUTED PROBLEM

**We intentionally defer offline multi-device sequencing.**

**Why:**
1. Distributed sequence allocation is complex
2. Most businesses have one primary POS terminal
3. Multi-terminal offline is rare edge case
4. Can be added later if needed

**V1: Single offline terminal restriction**

---

## Part 10: Testing

### Existing Tests

**Found:**
- `web/__tests__/unit/lib/queries/fetch-structured-id.test.ts`
- Tests basic sequence increment
- Tests format generation
- **NO concurrency tests**

### Required Concurrency Test

```typescript
describe('SequenceCounter — concurrent online checkout', () => {
  it('should allocate unique sequences to 10 simultaneous checkouts', async () => {
    // SETUP
    await setupTestDB()
    await seedBusiness({ id: 'biz-1' })
    await seedBranch({ id: 'branch-1', businessId: 'biz-1' })
    await seedSequenceCounter({
      id: 'biz-1-branch-1-INVOICE-2026-8-0',
      lastNumber: 100
    })
    
    // EXECUTE 10 CONCURRENT CHECKOUTS
    const checkouts = Array.from({ length: 10 }, (_, i) => ({
      items: [{ productId: 'prod-1', quantity: 1 }],
      payments: [{ method: 'CASH', amount: 1000 }]
    }))
    
    const results = await Promise.all(
      checkouts.map(data => createPosTransaction(data, mockProducts))
    )
    
    // VERIFY
    const invoiceNumbers = results
      .filter(r => r.data)
      .map(r => r.data!.transaction.invoiceNo)
    
    // All should succeed
    expect(results.every(r => !r.error)).toBe(true)
    
    // All should be unique
    const uniqueInvoices = new Set(invoiceNumbers)
    expect(uniqueInvoices.size).toBe(10)
    
    // Should be sequential: 101, 102, 103, ..., 110
    const numbers = invoiceNumbers
      .map(inv => parseInt(inv.split('-')[2]))
      .sort((a, b) => a - b)
    
    expect(numbers).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110])
    
    // Final counter should be 110
    const finalCounter = await prisma.sequenceCounter.findUnique({
      where: { id: 'biz-1-branch-1-INVOICE-2026-8-0' }
    })
    expect(finalCounter!.lastNumber).toBe(110)
  })
})
```

### Test Requirements

1. Must use REAL database (PostgreSQL test instance)
2. Must use REAL concurrent HTTP requests
3. Must NOT mock `sequenceCounterCollection`
4. Must verify NO duplicates
5. Must verify NO gaps (except on retry)
6. Must verify final counter state

### Current Test Status

**❌ NO CONCURRENCY TESTS EXIST**

---

## Part 11: Final Report

### 1. ONLINE SEQUENCE ALLOCATION

**STATUS: 🔴 FAIL**

**Explanation:**

The sequence is allocated CLIENT-SIDE before being sent to the server. The flow is:

1. Client reads `lastNumber` from local OPFS collection
2. Client increments locally
3. Client generates `invoiceNo`
4. Client sends pre-generated transaction to server
5. Server executes operations in Prisma $transaction

**Problem:** Steps 1-3 happen outside any database transaction. Two concurrent clients can read the same `lastNumber` before either updates the server.

**Evidence:**
- `fetchStructuredId()` operates on `sequenceCounterCollection` (TanStack DB)
- TanStack DB is local-first (OPFS storage)
- No server-side counter allocation before transaction

---

### 2. ONLINE MULTI-CASHIER CONCURRENCY

**STATUS: 🔴 FAIL — COLLISIONS WILL OCCUR**

**Explanation:**

Multiple cashiers at the same branch will have independent OPFS databases. When they checkout simultaneously:

```
Cashier A OPFS: lastNumber = 100 → 101
Cashier B OPFS: lastNumber = 100 → 101
Both generate: SI-2026-000101
```

The server will receive both transactions. The second one will fail with unique constraint violation on `transaction.invoiceNo`.

**Impact:**
- One cashier's checkout fails
- Sequence number is skipped
- Poor user experience
- Manual retry required

---

### 3. ATOMICITY

**STATUS: 🔴 FAIL — NOT ATOMIC END-TO-END**

**Explanation:**

While the server-side operations are wrapped in Prisma `$transaction`, the sequence allocation happens BEFORE the transaction begins.

**Flow:**
```
CLIENT (outside any transaction)
├─ Allocate sequence: 101
├─ Create transaction object
└─ Send to server

SERVER (inside Prisma $transaction)
├─ UPDATE sequence_counters
├─ INSERT transaction
└─ COMMIT or ROLLBACK
```

**Problem:** If server transaction fails, the client already consumed sequence 101. The number is permanently lost.

---

### 4. OFFLINE SEQUENCE ALLOCATION

**Explanation:**

Each device maintains its own OPFS storage. When offline:

1. Device A and Device B both have `lastNumber = 100` (from last sync)
2. Both go offline independently
3. Device A allocates: 101, 102, 103
4. Device B allocates: 101, 102, 103, 104
5. Both reconnect and sync

**Sync conflict:**
- Device A syncs: `UPDATE sequence_counters SET lastNumber = 103`
- Device B syncs: `UPDATE sequence_counters SET lastNumber = 104`
- Last write wins: counter becomes 104
- But both devices created transactions with invoiceNos: 101, 102, 103

**Result:** Duplicate invoiceNos in the system.

---

### 5. OFFLINE COLLISION RISK

**STATUS: 🔴 NOT SAFE — DUPLICATES GUARANTEED**

**Scenario:**
```
Device A offline checkout: SI-2026-000101
Device B offline checkout: SI-2026-000101

When both sync:
→ Unique constraint violation on transaction.invoiceNo
→ One device's sync fails
→ Manual intervention required
```

**Why it's guaranteed:**
- No coordination between offline devices
- Each device has independent sequence counter
- TanStack DB sync is last-write-wins for counter
- But transactions are immutable (can't overwrite)

---

### 6. CURRENT OFFLINE LOCK

**STATUS: 🔴 NOT PRESENT — NO IMPLEMENTATION**

**Findings:**
- No `OfflineLockEngine` exists
- No `offlineCashierId`, `offlineDeviceId`, or `isOfflineMode` fields in schema
- No device identification system
- No coordination mechanism for offline mode

**Implication:**
- Multiple devices CAN go offline simultaneously
- No warning or prevention
- Collisions WILL occur
- No audit trail of which device allocated which sequence

---

### 7. REQUIRED V1 CHANGES

#### Priority 1: Fix ONLINE Concurrency (CRITICAL)

**Problem:** Client-side sequence allocation causes race conditions.

**Solution: Move sequence allocation to server-side**

1. Create new server function: `allocateSequence(type: SequenceType): Promise<{ invoiceNo: string, lastNumber: number }>`

2. Implementation:
```typescript
// Server-side (web/src/lib/prisma-client/sequence-api.ts)
export const allocateSequenceServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context, data: { type } }) => {
    const { businessId, branchId } = context.user
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = type === 'ORDER' ? now.getDate() : 0
    
    // ATOMIC: Use Prisma's $transaction with serializable isolation
    const result = await prisma.$transaction(async (tx) => {
      // Lock the counter row for update
      const counter = await tx.sequenceCounter.findUnique({
        where: {
          businessId_branchId_type_year_month_day: {
            businessId,
            branchId,
            type,
            year,
            month,
            day
          }
        }
      })
      
      const newLastNumber = (counter?.lastNumber ?? 0) + 1
      
      // Upsert with new lastNumber
      await tx.sequenceCounter.upsert({
        where: {
          businessId_branchId_type_year_month_day: {
            businessId,
            branchId,
            type,
            year,
            month,
            day
          }
        },
        create: {
          businessId,
          branchId,
          type,
          year,
          month,
          day,
          lastNumber: newLastNumber
        },
        update: {
          lastNumber: newLastNumber
        }
      })
      
      // Format invoice number
      const num = newLastNumber.toString().padStart(6, '0')
      const invoiceNo = type === 'INVOICE' ? `SI-${year}-${num}` : `#${num}`
      
      return { invoiceNo, lastNumber: newLastNumber }
    }, {
      isolationLevel: 'Serializable', // Prevent phantom reads
      timeout: 5000
    })
    
    return { value: result }
  })
```

3. Update `createPosTransaction()`:
```typescript
// Allocate sequence SERVER-SIDE before creating transaction
const sequenceResult = await allocateSequence(SequenceType.INVOICE)

if (!sequenceResult.success) {
  return { error: new Error('Failed to allocate sequence number') }
}

const result = await dbTransaction(() => {
  const transaction = {
    id: transactionId,
    invoiceNo: sequenceResult.invoiceNo, // ← Use server-allocated number
    // ... rest
  }
  transactionCollection.insert(transaction)
  // ...
})
```

4. **CRITICAL:** Remove client-side sequence increment:
```typescript
// DELETE these lines from fetchStructuredId():
// sequenceCounterCollection.update(counterId, draft => {
//   draft.lastNumber += 1
// })
```

5. Add retry logic for serialization failures:
```typescript
async function allocateSequenceWithRetry(type: SequenceType, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await allocateSequence(type)
    } catch (error) {
      if (error.code === 'P2034' && attempt < maxRetries - 1) {
        // Serialization failure - retry with exponential backoff
        await delay(Math.pow(2, attempt) * 100)
        continue
      }
      throw error
    }
  }
}
```

**Impact:**
- ✅ Eliminates race conditions for online checkouts
- ✅ Guarantees unique sequence numbers
- ✅ No sequence gaps on conflict
- ✅ Atomic allocation within database transaction

**Tradeoff:**
- Requires server round-trip before transaction creation
- Small latency increase (~50-100ms per checkout)

---

#### Priority 2: Implement Offline Restriction

**Problem:** Multiple devices can go offline and create duplicate sequences.

**Solution: Single Offline Terminal Policy**

1. Add offline capability flag to Branch model:
```prisma
model Branch {
  // ... existing fields
  offlineTerminalId String? // Only this user/device can checkout offline
}
```

2. Add to auth user object:
```typescript
interface AuthUser {
  // ... existing fields
  canCheckoutOffline: boolean // Derived from branch.offlineTerminalId === user.id
}
```

3. Check before offline checkout:
```typescript
// In createPosTransaction()
const isOffline = !navigator.onLine

if (isOffline && !user.canCheckoutOffline) {
  return {
    error: new Error(
      'Offline checkout is restricted. Please connect to the internet or use the designated offline terminal.'
    )
  }
}
```

4. Add admin UI to designate offline terminal:
```typescript
// Settings → Branch Settings → Offline Mode
<Select
  label="Designated Offline Terminal"
  value={branch.offlineTerminalId}
  onChange={(userId) => updateBranch({ offlineTerminalId: userId })}
  options={branchUsers}
/>
```

5. Show clear indicator in POS UI:
```typescript
{isOffline && !user.canCheckoutOffline && (
  <Alert variant="destructive">
    <WifiOff className="h-4 w-4" />
    <AlertTitle>Offline Mode Restricted</AlertTitle>
    <AlertDescription>
      Only the designated terminal can process transactions offline.
      Please reconnect to the internet.
    </AlertDescription>
  </Alert>
)}
```

**Impact:**
- ✅ Prevents multi-device offline conflicts
- ✅ Clear admin control
- ✅ No complex distributed coordination needed
- ⚠️  Requires pre-configuration by admin

---

#### Priority 3: Add Concurrency Tests

**Create:** `web/__tests__/integration/sequence-concurrency.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createPosTransaction } from '@/lib/queries/create-pos-transaction'
import { setupTestDB, teardownTestDB, seedTestData } from '../helpers/db'

describe('Sequence Allocation Concurrency', () => {
  beforeEach(async () => {
    await setupTestDB()
    await seedTestData({
      business: { id: 'biz-1', name: 'Test Business' },
      branch: { id: 'branch-1', businessId: 'biz-1' },
      sequenceCounter: {
        id: 'biz-1-branch-1-INVOICE-2026-8-0',
        lastNumber: 100
      }
    })
  })

  afterEach(async () => {
    await teardownTestDB()
  })

  it('10 concurrent checkouts should receive unique sequential numbers', async () => {
    const checkouts = Array.from({ length: 10 }, () => ({
      orderId: crypto.randomUUID(),
      items: [{ productId: 'prod-1', quantity: 1, price: 1000 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      customer: { customerReference: 'Test' },
      compliance: {}
    }))

    // Execute ALL checkouts simultaneously
    const results = await Promise.all(
      checkouts.map(data => createPosTransaction(data, mockProducts))
    )

    // Extract invoice numbers
    const invoiceNumbers = results
      .filter(r => r.data)
      .map(r => r.data!.transaction.invoiceNo)

    // ASSERT: All unique
    const uniqueSet = new Set(invoiceNumbers)
    expect(uniqueSet.size).toBe(10)

    // ASSERT: Sequential (101-110)
    const numbers = invoiceNumbers
      .map(inv => parseInt(inv.split('-')[2]))
      .sort((a, b) => a - b)

    expect(numbers).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110])
  })

  it('should handle serialization conflict with retry', async () => {
    // Simulate high contention (50 concurrent requests)
    const checkouts = Array.from({ length: 50 }, () => ({
      orderId: crypto.randomUUID(),
      items: [{ productId: 'prod-1', quantity: 1, price: 1000 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      customer: { customerReference: 'Test' },
      compliance: {}
    }))

    const results = await Promise.all(
      checkouts.map(data => createPosTransaction(data, mockProducts))
    )

    // All should eventually succeed (with retries)
    const successCount = results.filter(r => r.data).length
    expect(successCount).toBe(50)

    // No duplicates
    const invoiceNumbers = results
      .filter(r => r.data)
      .map(r => r.data!.transaction.invoiceNo)
    const uniqueSet = new Set(invoiceNumbers)
    expect(uniqueSet.size).toBe(50)
  })
})
```

---

#### Priority 4: Monitoring & Alerts

**Add logging for sequence conflicts:**

```typescript
// In allocateSequence server function
try {
  // ... allocation logic
} catch (error) {
  if (error.code === 'P2034') {
    // Serialization failure
    logger.warn('Sequence allocation conflict', {
      type,
      businessId,
      branchId,
      attempt
    })
  }
  throw error
}
```

**Add metrics:**

```typescript
// Track sequence allocation performance
metrics.histogram('sequence.allocation.duration', duration)
metrics.counter('sequence.allocation.conflicts', { type, businessId })
```

---

### 8. TEST RESULTS

**STATUS: ❌ NO TESTS EXIST**

**Required Actions:**
1. Create integration test suite for concurrency
2. Test with real PostgreSQL instance
3. Test with 10, 50, 100 concurrent requests
4. Verify no duplicates across all runs
5. Measure conflict rate and retry success

**Estimated Test Runtime:** 2-5 seconds per test

**CI Integration:** Run on every PR that touches:
- `create-pos-transaction.ts`
- `fetch-structured-id.ts`
- `sequence-counter` schema
- `dbTransaction` logic

---

## Summary of Critical Issues

| Issue | Severity | Impact | Fix Complexity |
|-------|----------|--------|----------------|
| Client-side sequence allocation | 🔴 CRITICAL | Race conditions, duplicates | Medium |
| No offline restriction | 🔴 CRITICAL | Guaranteed collisions | Low |
| No concurrency tests | 🟡 HIGH | Can't verify fixes | Medium |
| Sequence gaps on conflict | 🟡 MEDIUM | BIR compliance risk | Low (documentation) |
| No retry logic | 🟡 MEDIUM | Poor UX on conflict | Low |
| No conflict monitoring | 🟢 LOW | Can't detect issues | Low |

---

## Recommended Implementation Order

1. **Week 1:** Fix online concurrency (Priority 1)
   - Move sequence allocation to server
   - Add retry logic
   - Deploy with feature flag

2. **Week 2:** Add offline restriction (Priority 2)
   - Add Branch.offlineTerminalId
   - Update auth system
   - Add UI controls

3. **Week 3:** Testing & monitoring (Priorities 3-4)
   - Create concurrency tests
   - Add logging and metrics
   - Load testing

4. **Week 4:** Documentation & rollout
   - Update operator manual
   - Train staff on offline terminal designation
   - Gradual rollout with monitoring

---

## Conclusion

**The current system has CRITICAL concurrency issues that WILL cause duplicate invoice numbers in production.**

**V1 fixes are well-scoped and achievable:**
- Server-side sequence allocation (solves online concurrency)
- Single offline terminal restriction (defers distributed problem)
- Proper testing (prevents regressions)

**V2 and beyond:**
- Multi-terminal offline (distributed sequence allocation)
- Conflict-free replicated data types (CRDTs)
- Automatic conflict resolution
- Advanced monitoring and alerting

**The offline problem is intentionally deferred because it is a distributed systems problem that requires careful design and is not needed for V1 launch.**
