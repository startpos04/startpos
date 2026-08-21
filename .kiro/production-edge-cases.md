# Production Module — Edge Cases Quick Reference

**Purpose**: Quick lookup guide for critical edge cases in batch preparation system.

**Related Documents**:
- Main specification: `production-module-spec.md`
- Enhancement summary: `production-module-enhancement-summary.md`

---

## 1. Cost Allocation for Finished Goods

### Question
How is production cost split across finished units, especially for COGS reporting?

### Answer

**Recipe-based Production**:
```typescript
costPerUnit = Math.round(totalMaterialCost / actualQuantity)
```

Each finished inventory record stores this `costPrice`. When sold, COGS = `costPrice × quantitySold`.

**Recipe-free Production**:
```typescript
costPerUnit = 0  // No material tracking
```

COGS will be 0 unless manually set. Businesses using recipe-free mode should:
- Either accept 0 COGS for simplicity
- Or manually set `costPrice` if profit margins are needed

### Code Location
- Implementation: `src/lib/production/production-engine.ts` → `completeProduction()`
- Usage: `src/lib/queries/create-pos-transaction.ts` → FIFO consumption

### Test Cases
```typescript
it('allocates material cost across actual output', () => {
  // Target: 100, Materials: ₱1000, Actual: 95
  // Expected: ₱1000 / 95 = ₱10.53 per unit
})

it('sets cost to 0 for recipe-free production', () => {
  // No recipe, just finished quantity
  // Expected: costPrice = 0
})
```

---

## 2. Target vs Actual Quantity Variance

### Question
What happens when actual output differs from target (spillage, waste, yield loss)?

### Scenarios

#### A. Normal Variance (5-10% loss)
```
Target: 100 units
Materials consumed: for 100 units (₱1,000)
Actual: 95 units

Result:
- 95 finished goods created
- Cost per unit: ₱1,000 / 95 = ₱10.53 (higher due to loss)
- 5-unit loss absorbed into cost
- No separate waste record
```

#### B. Significant Variance (>20% loss)
```
Target: 100 units
Actual: 70 units

Action:
- System warns user: "Actual output significantly below target"
- User confirms reason (spillage, equipment failure, etc.)
- Loss still absorbed into cost
- Optionally add note to production order
```

#### C. Catastrophic Failure (0% yield)
```
Target: 100 units
Materials consumed: for 100 units
Actual: 0 units (burnt, contaminated)

Action:
- Complete production with actualQuantity = 0
- No finished goods created
- Materials already consumed (recorded as loss)
- Note explains failure reason
```

### Implementation Rules

```typescript
// In completeProduction()
if (actualQuantity <= 0) {
  // No finished inventory
  productionOrder.actualQuantity = 0
  productionOrder.notes = `Total loss: ${reason}`
  // totalCost already recorded
}

if (actualQuantity < targetQuantity * 0.8) {
  // Warn user: significant variance
  showWarning({
    message: `Actual (${actualQuantity}) is ${percentageLoss}% below target (${targetQuantity})`,
    action: 'Continue',
    note: 'Loss will be absorbed into unit cost'
  })
}

costPerUnit = actualQuantity > 0 
  ? Math.round(totalMaterialCost / actualQuantity)
  : 0
```

### UI Flow
```
┌─────────────────────────────────────┐
│  Complete Production                │
├─────────────────────────────────────┤
│  Target: 100 pcs                    │
│  Actual Produced: [ 95 ]            │
│                                      │
│  ⚠️ 5% below target                 │
│  Loss will increase unit cost       │
│                                      │
│  Note (optional):                    │
│  [Minor spillage during packaging]  │
│                                      │
│  [Cancel]           [Complete]      │
└─────────────────────────────────────┘
```

### Test Cases
```typescript
it('absorbs variance into higher unit cost', () => {
  // Target 100, actual 95, cost ₱1000
  // Expected: ₱10.53/unit instead of ₱10.00/unit
})

it('handles zero output', () => {
  // Target 100, actual 0
  // Expected: no finished goods, materials consumed
})

it('warns on significant variance', () => {
  // Target 100, actual 70 (30% loss)
  // Expected: warning shown before completion
})
```

---

## 3. Concurrency Control for POS Sales

### Question
How to prevent race conditions when two POS terminals sell the last few units?

### Scenario
```
Finished Inventory: 5 units

Terminal A: Sells 3 units (12:00:00.000)
Terminal B: Sells 3 units (12:00:00.001)

Without protection:
- Both check: 5 available ✓
- Both deduct: -3 each
- Result: -1 units (negative inventory) ❌
```

### Solution

**CRITICAL FINDING**: TanStack DB's `dbTransaction()` uses Prisma's default isolation level (Read Committed for PostgreSQL), which **DOES NOT** prevent this race condition. Simply wrapping check-then-deduct in a transaction is **insufficient**.

**Analysis of Current System**:
- `dbTransaction()` → `transactionAPI.execute()` → `prisma.$transaction()`
- No isolation level specified → defaults to Read Committed
- Read Committed allows: Both transactions read "5 available" before either writes
- Result: Double-sale possible (negative inventory)

**Proof**: `sequence-api.ts` explicitly uses `Serializable` isolation because it needs atomicity:
```typescript
prisma.$transaction(async tx => { ... }, {
  isolationLevel: 'Serializable'
})
```

The general `transactionAPI` does NOT do this, so it's vulnerable.

---

**Level 1: Transaction Atomicity with Optimistic Locking** (REQUIRED for MVP)
```typescript
// Add version to Inventory schema (REQUIRED IN SPRINT 1)
model Inventory {
  version Int @default(1)
}

// Update with version check (REQUIRED IN SPRINT 3)
inventoryCollection.update(batch.id, draft => {
  if (draft.version !== expectedVersion) {
    throw new ConcurrencyError('Inventory changed by another transaction')
  }
  draft.quantity -= toConsume
  draft.version += 1
})
```

**Why This Works**:
1. Transaction A reads: `{ id: 1, quantity: 5, version: 1 }`
2. Transaction B reads: `{ id: 1, quantity: 5, version: 1 }`
3. Transaction A updates: `SET quantity = 2, version = 2 WHERE id = 1 AND version = 1` ✓
4. Transaction B tries: `SET quantity = 2, version = 2 WHERE id = 1 AND version = 1` ✗ (version is now 2)
5. Transaction B throws `ConcurrencyError`, triggers retry

**Level 2: Retry Logic** (REQUIRED for MVP)
```typescript
// Custom error for concurrency conflicts
class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConcurrencyError'
  }
}

async function createPOSTransactionWithRetry(cart, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await createPOSTransaction(cart)
    } catch (error) {
      // Retry ONLY on concurrency conflicts, NOT on genuine out-of-stock
      if (error instanceof ConcurrencyError && attempt < maxAttempts) {
        // Exponential backoff: 100ms, 200ms, 400ms
        await sleep(100 * Math.pow(2, attempt - 1))
        continue
      }
      throw error // Re-throw if: not concurrency error, or max attempts reached
    }
  }
}
```

**Level 3: Serializable Isolation** (Alternative - NOT recommended)

**Why NOT Serializable for General Transactions**:

We could modify `transactionAPI` to use `Serializable` isolation like `sequence-api.ts` does:
```typescript
prisma.$transaction(async tx => { ... }, {
  isolationLevel: 'Serializable'
})
```

**However**:
- Serializable has higher contention and more transaction aborts under load
- It would affect ALL transactions system-wide, not just production module
- Optimistic locking gives us fine-grained control over which rows need protection
- Retry logic can be scoped to specific error types

**Decision**: Use optimistic locking (version column) + retry logic for production module. Leave general transaction isolation unchanged.

### Implementation Priority

**Phase 1 MVP** (Must Have - Sprint 1 & 3):
- ✅ Add `version Int @default(1)` column to `Inventory` schema (Sprint 1 migration)
- ✅ Implement version check in `FinishedGoodsEngine.consumeFinishedGoods()` (Sprint 3)
- ✅ Implement `ConcurrencyError` class and retry wrapper `createPOSTransactionWithRetry()` (Sprint 3)
- ✅ Test concurrent sales scenario with real concurrent transactions (Sprint 3)

**Phase 2** (Nice to Have):
- Real-time inventory sync across terminals
- Database-level row locking optimization (`FOR UPDATE`)

**Note**: The original spec incorrectly labeled this as "Should Have / Phase 1.5". It is actually **REQUIRED for MVP correctness**. Read Committed isolation is insufficient to prevent double-sales.

### Test Cases
```typescript
it('prevents concurrent sales from creating negative inventory', async () => {
  // Given: 5 units available
  const inventory = { quantity: 5 }
  
  // When: Two simultaneous sales of 3 units each
  const sale1 = createPOSTransaction({ items: [{ qty: 3 }] })
  const sale2 = createPOSTransaction({ items: [{ qty: 3 }] })
  
  const results = await Promise.allSettled([sale1, sale2])
  
  // Then: One succeeds, one fails
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
  
  // And: Final inventory is correct (2 units)
  expect(getInventory().quantity).toBe(2)
})
```

---

## 4. Unit Conversion in Production

### Question
What happens when recipe units don't match inventory units?

### Scenario
```
Recipe: 0.5 kg Chicken per piece
Inventory: 2000 g Chicken available

Question: Can we produce 3 pieces?
```

### Solution
Use existing `UnitEngine.convert()` for all operations.

### Implementation

**Step 1: Calculate Requirements in Recipe Units**
```typescript
function calculateRequirements(variantId: string, quantity: number) {
  const recipe = getRecipe(variantId)
  
  return recipe.map(component => ({
    materialId: component.materialId,
    requiredQuantity: component.quantityUsed * quantity, // In recipe unit
    requiredUnit: component.unit // e.g., kg
  }))
}

// Example: 3 pieces × 0.5 kg = 1.5 kg required
```

**Step 2: Check Availability with Conversion**
```typescript
function checkAvailability(requirement: MaterialRequirement) {
  const inventoryBatches = getInventory(requirement.materialId)
  
  // Convert each batch to recipe unit
  const totalAvailable = inventoryBatches.reduce((sum, batch) => {
    const converted = UnitEngine.convert(
      batch.quantity,     // 2000
      batch.unit,         // g
      requirement.unit    // kg
    )
    return sum + converted // 2 kg
  }, 0)
  
  return totalAvailable >= requirement.requiredQuantity // 2 >= 1.5 ✓
}
```

**Step 3: Consume with Back-Conversion**
```typescript
function consumeMaterial(requirement: MaterialRequirement) {
  let remaining = requirement.requiredQuantity // 1.5 kg
  const batches = getInventory(requirement.materialId)
  
  for (const batch of batches) {
    if (remaining <= 0) break
    
    // Convert batch to recipe unit
    const batchInRecipeUnit = UnitEngine.convert(
      batch.quantity,    // 2000 g
      batch.unit,        // g
      requirement.unit   // kg
    ) // = 2 kg
    
    const toConsumeInRecipeUnit = Math.min(batchInRecipeUnit, remaining) // 1.5 kg
    
    // Convert back to batch unit for deduction
    const toConsumeInBatchUnit = UnitEngine.convert(
      toConsumeInRecipeUnit, // 1.5
      requirement.unit,      // kg
      batch.unit            // g
    ) // = 1500 g
    
    // Deduct in batch's native unit
    batch.quantity -= toConsumeInBatchUnit // 2000 - 1500 = 500 g
    
    remaining -= toConsumeInRecipeUnit // 0 kg
  }
}
```

### Unit Type Safety
```typescript
// UnitEngine throws on type mismatch
try {
  UnitEngine.convert(5, kgUnit, literUnit)
} catch (error) {
  // Error: "Unit mismatch: Kilogram (WEIGHT) → Liter (VOLUME)"
}
```

### Precision Handling
```typescript
// Use UnitEngine.precision() to avoid floating-point errors
const result = UnitEngine.precision(
  0.1 + 0.2 // JavaScript: 0.30000000000000004
) // = 0.3
```

### Test Cases
```typescript
it('converts recipe units to inventory units', () => {
  // Recipe: 0.5 kg, Inventory: 2000 g
  // Expected: 0.5 kg = 500 g deduction
})

it('handles multi-unit inventory', () => {
  // Recipe: 1.5 kg
  // Inventory: [1000g batch, 800g batch]
  // Expected: Consume 1000g + 500g
})

it('throws on unit type mismatch', () => {
  // Recipe: kg (WEIGHT), Inventory: L (VOLUME)
  // Expected: Error thrown
})
```

### Common Conversions
```
Weight:
- 1 kg = 1000 g
- 1 g = 1000 mg

Volume:
- 1 L = 1000 mL
- 1 gal = 3.785 L

Count:
- 1 dozen = 12 pcs
- 1 box = varies (configured per business)
```

---

## 5. Multi-Item Transaction Failure Behavior

### Question
What happens when one item in a cart is out of stock?

### Scenario
```
Cart:
- Regular Soda: 2 bottles (in stock)
- Batch-Prepared Fried Chicken: 5 pieces (only 3 available)
- Regular Chips: 1 bag (in stock)

Cashier clicks "Checkout"
```

### Decision: Fail Entire Transaction

**Rationale**:
1. Customer expects to purchase all items together
2. Partial fulfillment creates payment reconciliation issues
3. Simpler error handling
4. Consistent with existing system behavior (atomic transactions)

### Implementation

**Pre-validation Pattern**:
```typescript
await dbTransaction(() => {
  // STEP 1: Validate ALL items first
  for (const item of cartItems) {
    const variant = getVariant(item.variantId)
    
    if (variant.isBatchPrepared) {
      const available = getFinishedInventory(item.variantId)
      
      if (available < item.quantity) {
        throw new OutOfStockError({
          variantId: item.variantId,
          name: variant.name,
          available,
          required: item.quantity
        })
      }
    } else {
      // Check regular inventory
      const available = getRegularInventory(item.variantId)
      
      if (available < item.quantity) {
        throw new OutOfStockError({
          variantId: item.variantId,
          name: variant.name,
          available,
          required: item.quantity
        })
      }
    }
  }
  
  // STEP 2: All validated ✓ — proceed with deductions
  for (const item of cartItems) {
    consumeInventory(item)
  }
  
  // STEP 3: Create transaction record, payments, etc.
})
```

### Error Display

**Detailed Error Message**:
```typescript
class OutOfStockError extends Error {
  constructor(public items: Array<{
    name: string
    available: number
    required: number
  }>) {
    const itemList = items
      .map(i => `${i.name}: ${i.available} available, ${i.required} required`)
      .join('\n')
    
    super(`Cannot complete sale. Out of stock:\n${itemList}`)
  }
}
```

**UI Dialog**:
```
┌───────────────────────────────────────┐
│  ⚠️ Cannot Complete Sale              │
├───────────────────────────────────────┤
│                                        │
│  The following items are out of stock:│
│                                        │
│  • Fried Chicken                      │
│    Required: 5 pcs                    │
│    Available: 3 pcs                   │
│                                        │
│  Please:                               │
│  - Reduce quantity to 3 or less       │
│  - Remove item from cart              │
│  - Prepare more inventory             │
│                                        │
│  [Remove Item]  [Edit Cart]  [Cancel] │
└───────────────────────────────────────┘
```

### Alternative: Partial Fulfillment (Future)

**Phase 2+ Feature** (not initial implementation):
```typescript
// Split transaction automatically
const { fulfilled, backorder } = splitCartByAvailability(cart)

// Transaction 1: In-stock items
await createTransaction(fulfilled)

// Transaction 2: Backorder for later
await createBackorder(backorder)

// Notify customer
showMessage('Partial order completed. 2 items backordered.')
```

This is more complex and requires:
- Backorder management system
- Payment splitting logic
- Customer notification system
- Inventory reservation for backorders

**Recommendation**: Start with fail-entire-transaction, add partial fulfillment in Phase 2 if business needs it.

### Test Cases
```typescript
describe('Multi-item cart out-of-stock behavior', () => {
  it('fails entire transaction when one item out of stock', async () => {
    const cart = [
      { variantId: 'soda', quantity: 2 },          // In stock
      { variantId: 'fried-chicken', quantity: 5 }, // Only 3 available
      { variantId: 'chips', quantity: 1 },         // In stock
    ]
    
    const result = await createPOSTransaction(cart)
    
    // Transaction fails
    expect(result.isErr()).toBe(true)
    expect(result.error.message).toContain('Fried Chicken')
    expect(result.error.message).toContain('3 available, 5 required')
    
    // NO inventory deducted for ANY item
    expect(getInventory('soda').quantity).toBe(10) // unchanged
    expect(getInventory('fried-chicken').quantity).toBe(3) // unchanged
    expect(getInventory('chips').quantity).toBe(5) // unchanged
  })
  
  it('succeeds when all items have sufficient stock', async () => {
    const cart = [
      { variantId: 'soda', quantity: 2 },
      { variantId: 'fried-chicken', quantity: 3 }, // 3 available
      { variantId: 'chips', quantity: 1 },
    ]
    
    const result = await createPOSTransaction(cart)
    
    expect(result.isOk()).toBe(true)
    expect(getInventory('fried-chicken').quantity).toBe(0) // all consumed
  })
})
```

---

## Summary Table

| Edge Case | Impact | Solution | Priority | MVP Status |
|-----------|--------|----------|----------|------------|
| **1. Cost Allocation** | COGS reporting | Formula: `totalCost / actualQty` | High | ✅ Required |
| **2. Yield Variance** | Financial accuracy | Absorb loss into unit cost | High | ✅ Required |
| **3. Concurrency** | Data corruption (negative inventory) | Version column + retry logic | **CRITICAL** | ✅ Required (Sprint 1 & 3) |
| **4. Unit Conversion** | Production failure | Use `UnitEngine.convert()` | High | ✅ Required |
| **5. Multi-item OOS** | UX confusion | Fail entire transaction | High | ✅ Required |

---

## Implementation Priority

### Must Have (MVP)
- ✅ Cost allocation formula
- ✅ Yield variance handling  
- ✅ **Optimistic locking with version column (Sprint 1)** ← **CORRECTED**
- ✅ **Retry logic for concurrency (Sprint 3)** ← **CORRECTED**
- ✅ Unit conversion (exists)
- ✅ Multi-item failure behavior

### Should Have (Phase 1.5)
- UI warnings for significant variance
- Production cost manual override for recipe-free

### Nice to Have (Phase 2+)
- Real-time inventory sync
- Partial fulfillment option
- Advanced production analytics

---

## Critical Correction

**Original spec incorrectly stated**: "Transaction atomicity provides basic protection" (deferred optimistic locking to Phase 1.5).

**Actual finding**: `dbTransaction()` uses Read Committed isolation (Prisma default), which **does NOT prevent** concurrent transactions from both reading "5 available" before either writes. 

**Result**: Optimistic locking is **REQUIRED for MVP correctness**, not optional. Sprint 1 must include `version` column, Sprint 3 must implement version checks.

---

**Last Updated**: 2026-08-20  
**Status**: Ready for Implementation  
**Related PRs**: TBD
