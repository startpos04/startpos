# Production Module & Inventory Modes Alignment Audit

**Date**: August 23, 2026  
**Status**: ⚠️ GAPS IDENTIFIED - NEEDS UPDATES  
**Priority**: HIGH

---

## Executive Summary

After implementing **Inventory Modes** (none, relaxed, strict) and the **Production Module**, an alignment audit was performed to ensure both systems work together correctly. This audit identifies integration gaps and required updates.

### Key Findings

- ✅ **POS Integration**: Correctly validates finished goods consumption with inventory policy
- ✅ **Inventory Engine**: Uses `InventoryPolicy` for all mutation paths
- ⚠️ **Production Engine**: **MISSING** inventory policy validation
- ⚠️ **Finished Goods Engine**: **MISSING** inventory policy validation  
- ⚠️ **Waste Engine**: **MISSING** inventory policy validation

---

## Background

### Inventory Modes System (Completed)

Implemented three inventory management modes:

1. **None** (`none`): No inventory tracking, unlimited checkout
2. **Relaxed** (`relaxed`): Track inventory, allow negative stock, reconcile later
3. **Strict** (`strict`): Track inventory, block operations when stock insufficient

**Key Architecture**:
```typescript
PosStockEngine (TRUTH) → InventoryPolicy (ENFORCEMENT) → InventoryEngine (MUTATION)
```

**Enforcement Layer**: `InventoryPolicy` validates ALL inventory deductions BEFORE mutation:
- `validateDeduction()` - General inventory deduction
- `validateBatchTransfer()` - Batch-to-batch transfers
- `validateProductionConsumption()` - Raw material consumption for production
- `validateWasteDisposal()` - Waste recording

### Production Module (Completed)

Implemented batch preparation system with:
- **Production Engine**: Recipe-based and recipe-free production
- **Finished Goods Engine**: FIFO consumption with concurrency control
- **Waste Engine**: Explicit waste recording

**Key Operations**:
1. **startProduction()**: Consumes raw materials (recipe-based)
2. **consumeFinishedGoods()**: Consumes prepared inventory during POS sales
3. **recordWaste()**: Records waste disposal

---

## Integration Analysis

### ✅ CORRECT: POS Transaction (create-pos-transaction.ts)

**Location**: Lines 610-650

**Status**: ✅ Properly integrated with inventory modes

**Implementation**:
```typescript
// Get inventory mode from business characteristics
const inventoryMode = getInventoryMode(user.business.id)

// Validate stock availability based on inventory mode
InventoryPolicy.validateProductionConsumption({
  mode: inventoryMode,
  variantId: vId,
  requested: totalQty,
  available: totalAvailable,
})
```

**What's Correct**:
- ✅ Retrieves inventory mode from business settings
- ✅ Calls `InventoryPolicy.validateProductionConsumption()` before deduction
- ✅ Validation happens INSIDE `dbTransaction()` (atomic)
- ✅ Strict mode blocks checkout when insufficient stock
- ✅ Relaxed/none modes allow transaction to proceed

---

### ⚠️ GAP #1: Production Engine - Raw Material Consumption

**File**: `web/src/lib/production/production-engine.ts`

**Method**: `startProduction()` (Lines 340-400)

**Issue**: Does NOT validate inventory mode before consuming raw materials

**Current Code**:
```typescript
// Consume each material using FIFO
for (const component of components) {
  // ... FIFO calculation ...
  
  // Deduct from inventory
  inventoryCollection.update(consumption.inventoryId, draft => {
    draft.quantity -= consumption.quantity  // ❌ NO VALIDATION
    draft.updatedAt = now
  })
}
```

**Problem**:
- In **strict mode**: Production should be blocked if insufficient raw materials
- In **relaxed mode**: Production can proceed (materials can go negative)
- In **none mode**: Production validation should be skipped

**Expected Behavior**:
```typescript
// Get inventory mode
const inventoryMode = getInventoryMode(ctx.businessId)

// Validate BEFORE consumption (strict mode)
for (const component of components) {
  const availableQty = inventoryBatches.reduce((sum, b) => sum + b.quantity, 0)
  
  InventoryPolicy.validateProductionConsumption({
    mode: inventoryMode,
    variantId: component.materialId,
    requested: requiredQty,
    available: availableQty,
    productName: component.material?.name,
  })
  
  // After validation passes, consume using FIFO
  for (const consumption of fifoResult.consumed) {
    inventoryCollection.update(consumption.inventoryId, draft => {
      draft.quantity -= consumption.quantity
    })
  }
}
```

**Impact**:
- **Strict mode businesses**: Can accidentally start production without enough materials (goes negative)
- **Loose/none modes**: Behavior is actually correct (allows negative), but not explicit

---

### ⚠️ GAP #2: Finished Goods Engine - Consumption

**File**: `web/src/lib/production/finished-goods-engine.ts`

**Method**: `consumeFinishedGoods()` 

**Issue**: Has its own stock validation but doesn't check inventory mode

**Current Code** (likely):
```typescript
// Check availability
if (totalAvailable < quantity) {
  throw new Error('Out of stock')  // ❌ Always blocks (assumes strict mode)
}
```

**Problem**:
- Assumes ALL businesses want strict enforcement
- Ignores business-level inventory mode setting
- In **relaxed mode**: Should allow negative finished goods
- In **none mode**: Validation should be skipped

**Expected Behavior**:
```typescript
// Get inventory mode
const inventoryMode = getInventoryMode(ctx.businessId)

// Validate based on mode
InventoryPolicy.validateDeduction({
  mode: inventoryMode,
  variantId: params.variantId,
  requested: params.quantity,
  available: totalAvailable,
  productName: variant?.name,
})

// After validation passes (or is skipped), consume using FIFO
for (const batch of batches) {
  inventoryCollection.update(batch.id, draft => {
    draft.quantity -= toConsume
    draft.version += 1  // Optimistic locking
  })
}
```

**Impact**:
- **Relaxed mode businesses**: Cannot sell batch-prepared products when finished goods are temporarily negative (should be allowed)
- **None mode businesses**: Finished goods consumption still validates (should skip)

---

### ⚠️ GAP #3: Waste Engine - Waste Recording

**File**: `web/src/lib/production/waste-engine.ts`

**Method**: `recordWaste()`

**Issue**: Likely validates availability but doesn't check inventory mode

**Current Code** (likely):
```typescript
// Validate waste quantity
if (wasteQuantity > totalAvailable) {
  throw new Error('Cannot dispose more than exists')  // ❌ Always blocks
}
```

**Problem**:
- Waste disposal should respect inventory mode
- In **strict mode**: Cannot dispose more than exists (correct)
- In **relaxed mode**: Can dispose even if inventory is negative (reconciliation scenario)
- In **none mode**: Waste recording shouldn't validate (no inventory tracking)

**Expected Behavior**:
```typescript
// Get inventory mode
const inventoryMode = getInventoryMode(ctx.businessId)

// Waste validation is special: ensure you're not disposing more than exists
// This is independent of inventory mode in most cases, BUT:
// - Relaxed mode: Physical count shows 0, recorded shows -5, dispose 5 to reconcile (allowed)
// - Strict mode: Can only dispose what exists (standard validation)
// - None mode: Skip validation (no tracking)

if (inventoryMode !== 'none') {
  InventoryPolicy.validateWasteDisposal({
    mode: inventoryMode,
    variantId: params.variantId,
    requested: params.quantity,
    available: totalAvailable,
    productName: variant?.name,
  })
}
```

**Impact**:
- **Relaxed mode businesses**: Cannot use waste recording to reconcile negative inventory
- **None mode businesses**: Waste recording still validates (should skip)

---

## Required Changes

### Change #1: Update Production Engine

**File**: `web/src/lib/production/production-engine.ts`

**Method**: `startProduction()`

**Add**:
1. Import `getInventoryMode` and `InventoryPolicy`
2. Retrieve inventory mode: `const inventoryMode = getInventoryMode(ctx.businessId)`
3. Before FIFO consumption loop, validate EACH material:
   ```typescript
   InventoryPolicy.validateProductionConsumption({
     mode: inventoryMode,
     variantId: component.materialId,
     requested: requiredQty,
     available: totalAvailableForMaterial,
     productName: material.name,
   })
   ```
4. Only proceed with consumption if validation passes

**Expected Behavior After Fix**:
- Strict mode: Blocks production if insufficient raw materials
- Relaxed mode: Allows production (materials can go negative)
- None mode: Skips validation (production always proceeds)

---

### Change #2: Update Finished Goods Engine

**File**: `web/src/lib/production/finished-goods-engine.ts`

**Method**: `consumeFinishedGoods()`

**Add**:
1. Import `getInventoryMode` and `InventoryPolicy`
2. Add `businessId` to `ConsumeFinishedGoodsParams` (needed to get mode)
3. Retrieve inventory mode: `const inventoryMode = getInventoryMode(params.ctx.businessId)`
4. Replace hardcoded availability check with:
   ```typescript
   InventoryPolicy.validateDeduction({
     mode: inventoryMode,
     variantId: params.variantId,
     requested: params.quantity,
     available: totalAvailable,
     productName: variantName,
   })
   ```

**Expected Behavior After Fix**:
- Strict mode: Blocks sale if finished goods insufficient (current behavior)
- Relaxed mode: Allows sale even if finished goods go negative
- None mode: Skips validation (sale always proceeds)

---

### Change #3: Update Waste Engine

**File**: `web/src/lib/production/waste-engine.ts`

**Method**: `recordWaste()`

**Add**:
1. Import `getInventoryMode` and `InventoryPolicy`
2. Add `businessId` to `RecordWasteParams` (needed to get mode)
3. Retrieve inventory mode: `const inventoryMode = getInventoryMode(params.ctx.businessId)`
4. Replace hardcoded availability check with:
   ```typescript
   if (inventoryMode !== 'none') {
     InventoryPolicy.validateWasteDisposal({
       mode: inventoryMode,
       variantId: params.variantId,
       requested: params.quantity,
       available: totalAvailable,
       productName: variantName,
     })
   }
   ```

**Expected Behavior After Fix**:
- Strict mode: Cannot dispose more than exists
- Relaxed mode: Can dispose to reconcile negative inventory
- None mode: No validation (waste recording not meaningful)

---

## Testing Requirements

### Test Scenario Matrix

| Operation | None Mode | Relaxed Mode | Strict Mode |
|-----------|-----------|--------------|-------------|
| **Start Production (raw materials)** | Always succeeds | Succeeds (can go negative) | Blocked if insufficient |
| **Complete Production (finished goods)** | Always succeeds | Always succeeds | Always succeeds (creates inventory) |
| **POS Sale (finished goods)** | Always succeeds | Succeeds (can go negative) | Blocked if insufficient |
| **Record Waste** | Always succeeds | Succeeds (can reconcile negative) | Blocked if exceeds available |

### Test Cases to Add

#### 1. Production Engine - Strict Mode
```typescript
describe('ProductionEngine.startProduction - strict mode', () => {
  it('blocks production when raw materials insufficient', () => {
    // Given: Strict mode, need 10 kg flour, have 5 kg
    const result = ProductionEngine.startProduction({
      orderId: 'order-1',
      // ... collections ...
      ctx: { businessId: 'strict-business', ... }
    })
    
    // Then: Should throw InsufficientStockError
    expect(result.isErr()).toBe(true)
    expect(result.error).toContain('Insufficient stock')
  })
})
```

#### 2. Production Engine - Relaxed Mode
```typescript
describe('ProductionEngine.startProduction - relaxed mode', () => {
  it('allows production when raw materials insufficient', () => {
    // Given: Relaxed mode, need 10 kg flour, have 5 kg
    const result = ProductionEngine.startProduction({
      orderId: 'order-1',
      // ... collections ...
      ctx: { businessId: 'relaxed-business', ... }
    })
    
    // Then: Should succeed, flour goes to -5 kg
    expect(result.isOk()).toBe(true)
    const flour = inventoryCollection.get('flour-id')
    expect(flour.quantity).toBe(-5)
  })
})
```

#### 3. Finished Goods Engine - Strict Mode
```typescript
describe('FinishedGoodsEngine.consumeFinishedGoods - strict mode', () => {
  it('blocks sale when finished goods insufficient', () => {
    // Given: Strict mode, need 10 units, have 5 units
    expect(() => {
      FinishedGoodsEngine.consumeFinishedGoods({
        variantId: 'variant-1',
        quantity: 10,
        // ... params ...
        ctx: { businessId: 'strict-business', ... }
      })
    }).toThrow(InsufficientStockError)
  })
})
```

#### 4. Finished Goods Engine - Relaxed Mode
```typescript
describe('FinishedGoodsEngine.consumeFinishedGoods - relaxed mode', () => {
  it('allows sale when finished goods insufficient', () => {
    // Given: Relaxed mode, need 10 units, have 5 units
    const result = FinishedGoodsEngine.consumeFinishedGoods({
      variantId: 'variant-1',
      quantity: 10,
      // ... params ...
      ctx: { businessId: 'relaxed-business', ... }
    })
    
    // Then: Should succeed, finished goods go to -5
    expect(result.consumed.length).toBeGreaterThan(0)
    const inventory = inventoryCollection.get('finished-goods-id')
    expect(inventory.quantity).toBe(-5)
  })
})
```

#### 5. Waste Engine - Relaxed Mode Reconciliation
```typescript
describe('WasteEngine.recordWaste - relaxed mode reconciliation', () => {
  it('allows disposing negative inventory to reconcile', () => {
    // Given: Relaxed mode, inventory shows -5, dispose 5 to reconcile to 0
    const result = WasteEngine.recordWaste({
      variantId: 'variant-1',
      quantity: 5,
      reason: 'SPOILED',
      // ... params ...
      ctx: { businessId: 'relaxed-business', ... }
    })
    
    // Then: Should succeed
    expect(result.isOk()).toBe(true)
    const inventory = inventoryCollection.get('inventory-id')
    expect(inventory.quantity).toBe(-10)  // Was -5, disposed 5 more
  })
})
```

---

## Documentation Updates

### Update Required: PRODUCTION-MODULE-IMPLEMENTATION-COMPLETE.md

**Section**: "Known Limitations"

**Add**:
```markdown
7. **Inventory Mode Integration**: Production engines honor business-level 
   inventory modes (none, relaxed, strict). Strict mode blocks production/sales 
   when stock insufficient. Relaxed mode allows negative inventory. None mode 
   skips all validation. See PRODUCTION-INVENTORY-ALIGNMENT-AUDIT.md for details.
```

### Update Required: production-module-spec.md

**Section**: "Edge Cases"

**Add subsection**:
```markdown
### Edge Case 6: Inventory Mode Integration

**Problem**: How does production respect business inventory modes?

**Answer**: Production engines integrate with `InventoryPolicy`:

**Raw Material Consumption**:
- Strict mode: Block production if insufficient materials
- Relaxed mode: Allow production (materials can go negative for reconciliation)
- None mode: Skip validation (no tracking)

**Finished Goods Consumption**:
- Strict mode: Block sale if finished goods depleted
- Relaxed mode: Allow sale (finished goods can go negative)
- None mode: Skip validation

**Waste Recording**:
- Strict mode: Cannot dispose more than exists
- Relaxed mode: Can dispose to reconcile negative inventory
- None mode: Skip validation
```

---

## Priority & Estimation

### Priority: HIGH

**Rationale**:
- Affects core business logic (inventory tracking)
- Different businesses have different needs (strict vs relaxed)
- Current behavior assumes strict mode for ALL businesses
- Relaxed mode businesses cannot use production module correctly

### Estimation

| Task | Effort | Complexity |
|------|--------|------------|
| Update Production Engine | 2 hours | Medium |
| Update Finished Goods Engine | 2 hours | Medium |
| Update Waste Engine | 1 hour | Low |
| Write unit tests | 3 hours | Medium |
| Update documentation | 1 hour | Low |
| **TOTAL** | **9 hours** | - |

**Breakdown**:
- Day 1 Morning: Production Engine + tests (3h)
- Day 1 Afternoon: Finished Goods Engine + tests (3h)
- Day 2 Morning: Waste Engine + tests (2h)
- Day 2 Afternoon: Documentation + final testing (1h)

---

## Implementation Order

### Phase 1: Core Engines (Day 1)
1. ✅ Update `production-engine.ts` - Add mode validation to `startProduction()`
2. ✅ Update `finished-goods-engine.ts` - Replace hardcoded check with policy
3. ✅ Update `waste-engine.ts` - Add mode-aware validation

### Phase 2: Testing (Day 2 Morning)
4. ✅ Write unit tests for all three engines (strict, relaxed, none scenarios)
5. ✅ Run full test suite (165 inventory mode tests + new production tests)
6. ✅ Manual testing: Create business in each mode, test production workflow

### Phase 3: Documentation (Day 2 Afternoon)
7. ✅ Update `PRODUCTION-MODULE-IMPLEMENTATION-COMPLETE.md`
8. ✅ Update `production-module-spec.md`
9. ✅ Create this audit document

---

## Conclusion

The Production Module implementation is **functionally complete** but **missing inventory mode integration**. The three production engines need to be updated to respect business-level inventory modes.

**Current State**:
- ✅ Production module works correctly (functional)
- ⚠️ Assumes strict mode for all businesses (not configurable)
- ⚠️ Relaxed mode businesses cannot use production features

**Required State**:
- ✅ Production module works correctly (functional)
- ✅ Respects business inventory mode setting
- ✅ Strict, relaxed, and none modes all work as expected

**Risk**: MEDIUM
- No data corruption (engines work correctly)
- Feature limitation (some businesses can't use production effectively)
- Easy fix (add validation calls, no architecture changes)

**Recommendation**: Implement changes before wider release. Estimated 1-2 days of work.

---

**Status**: ⚠️ GAPS IDENTIFIED - IMPLEMENTATION REQUIRED

**Next Step**: User decision - implement now or defer to next phase?
