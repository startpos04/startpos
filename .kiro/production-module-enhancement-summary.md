# Production Module Enhancement Summary
## Key Changes from Original Specification

**Date**: August 20, 2026

---

## Overview

The Production Module specification has been significantly enhanced to create a **generic batch preparation system** rather than a food-specific production feature. The enhancements address critical business requirements for proper batch preparation, inventory carryover, and waste management.

**Important Clarification**: This module focuses ONLY on batch preparation. The existing recipe-based inventory deduction at sale time remains unchanged and is NOT part of this specification.

---

## Major Conceptual Changes

### 1. Two New Flows (Not Four)

**Before**: Unclear distinction between make-to-order and batch preparation

**After**: Clear separation:
- **Existing Flow A**: Direct Purchase → Sale (unchanged)
- **Existing Flow B**: Recipe-based deduction at sale time (unchanged, not modified by this module)
- **NEW Flow C**: Batch Preparation WITH recipe (primary focus)
- **NEW Flow D**: Batch Preparation WITHOUT recipe (secondary focus)

**Critical**: Flow B (recipe-based deduction at sale) exists in the current system and is NOT being replaced, modified, or enhanced by this production module.

### 2. Simple Boolean Flag, Not Operation Mode Enum

**Before**: Complex three-way enum (`PURCHASED`, `MAKE_TO_ORDER`, `BATCH_PREPARED`)

**After**: Simple boolean flag:
```prisma
isBatchPrepared Boolean @default(false)
```

**Rationale**: 
- This module only needs to know: "Is this product batch-prepared?"
- Everything else continues using existing system behavior
- Simpler to understand and implement
- No need to categorize non-batch-prepared products

### 3. Production Can Work With or Without Recipes

**Critical addition**: Support for businesses that want to track finished goods quantity without tracking ingredient consumption.

**Use case**: Small bakery wants to record "50 croissants prepared" without tracking flour, butter, eggs separately.

### 4. No Automatic Waste at End of Day

**Before**: Implied automatic waste disposal at end of day

**After**: 
- Finished goods naturally carry over to next day
- Waste is ONLY recorded when user explicitly chooses to
- System may warn about shelf life but NEVER auto-wastes

### 5. No Fallback to Raw Materials

**Critical change**: POS respects batch-prepared flag strictly.

**Before**: "If finished goods empty, fall back to recipe-based deduction"

**After**: "If finished goods empty for batch-prepared product → Out of Stock error (no fallback)"

### 6. Generic Domain (Not Food-Specific)

**Before**: Terminology focused on cooking/restaurant scenario

**After**: Generic "batch preparation" terminology applicable to:
- Restaurants, bakeries, cafés
- Food manufacturers
- Any business that assembles/produces in advance
- Even non-food products

---

## Schema Enhancements

### New Fields in ProductVariant

```prisma
isBatchPrepared Boolean @default(false)
productionUsesRecipe Boolean @default(true)
shelfLifeHours Int? // For warnings only, not automatic waste
```

**Note**: No `operationMode` enum. Just a simple flag.

### New Fields in Inventory

```prisma
inventoryType InventoryType @default(RAW_MATERIAL)
productionOrderId String?
producedAt DateTime?
```

### Updated ProductionOrder

```prisma
usesRecipe Boolean @default(true) // NEW: Supports recipe-free production
```

### New Enums

```prisma
enum InventoryType {
  RAW_MATERIAL
  FINISHED_GOOD
}
```

**Note**: No `ProductOperationMode` enum needed. Simple `isBatchPrepared` flag is sufficient.

---

## Architectural Requirements Added

### 1. Product Configuration Using Simple Flag

Every product can be marked as batch-prepared or not:
```prisma
isBatchPrepared Boolean @default(false)
```

This is simpler than a three-way mode enum.

### 2. POS Must Check Batch-Prepared Flag

The POS transaction logic must branch based on `isBatchPrepared`:

```typescript
if (variant.isBatchPrepared) {
  // NEW: Consume finished goods only (no fallback)
  if (finishedInventory < needed) {
    throw OutOfStockError
  }
} else {
  // EXISTING: Use current system behavior unchanged
}
```

**This is a simple if/else, not a complex three-way switch.**

### 3. Finished Goods as Distinct Inventory Type

Finished goods must be distinguishable from raw materials using `inventoryType` enum.

---

## UI/UX Enhancements

### 1. Simplified Preparation Page

**User mental model**: "Prepare → Sell → Keep remaining → Dispose when necessary"

**Dashboard view**:
```
Prepared Today    Sold Today    Remaining
    145              102            43
```

**Product cards show**:
- Quantity prepared today
- Quantity sold today
- Quantity remaining (across all days)
- Age of oldest batch
- Shelf life warnings (if applicable)

### 2. Single-Step "+ Prepare" Workflow

**Before**: Multi-stage draft → start → complete

**After**: Single dialog for common case:
1. Select product
2. Enter quantity
3. Click "Prepare" → Done

**For recipe-based**: Show material requirements and availability check

**For recipe-free**: Just record quantity

**Result**: Immediate COMPLETED production order

### 3. Explicit Waste Recording

Separate "Record Waste" action requiring:
- Product selection
- Quantity to dispose
- Reason (dropdown: Expired, Spoiled, Damaged, Past shelf life, etc.)
- Optional notes

**Never automatic**.

---

## Key Behavioral Changes

### 1. Natural Inventory Carryover

```
Day 1: Produce 100, Sell 82 → Remaining 18
Day 2: Opening 18, Produce 30 → Available 48, Sell 40 → Remaining 8
Day 3: Opening 8, Produce 50 → Available 58
```

**No special code required** — inventory simply persists.

### 2. Shelf Life is Warning Only

```prisma
shelfLifeHours Int? // Hours after production before suggested disposal
```

**Behavior**:
- System calculates when batch "expires"
- Shows warning: "⚠️ Approaching shelf life (2 hours remaining)"
- Does NOT automatically waste
- Does NOT block sales
- User decides what to do

### 3. FIFO for Finished Goods

Internally maintained, not exposed to user:
- Oldest finished batch consumed first during POS sale
- Tracked by `producedAt` timestamp
- User sees total inventory, not individual batches

### 4. Out of Stock Behavior

**Batch-prepared product with zero finished goods**:
```
Error: "Fried Chicken is out of stock. Please prepare more."
```

**NOT**:
```
Silently deduct raw materials as if it was make-to-order
```

---

## Implementation Sprint Changes

### Sprint 1: Foundation
**Added**:
- ProductVariant operation mode fields
- Inventory type distinction
- Support for recipe-free production

### Sprint 2: Core Preparation Flow
**Changed focus**:
- Simplified "+ Prepare" dialog (not complex multi-stage UI)
- Both recipe-based and recipe-free flows
- Waste recording as explicit action

### Sprint 3: POS Integration
**Critical enhancements**:
- Operation mode check (not just "does finished inventory exist?")
- No automatic fallback
- Proper out-of-stock errors
- Separate handling for each mode

### Sprint 4: Verification & Polish
**Added verification**:
- Natural carryover works (no special code needed)
- Shelf life warnings don't auto-waste
- All three operation modes coexist properly

---

## Success Criteria Updates

### Added Criteria

✅ Products can be marked as batch-prepared (`isBatchPrepared` flag)
✅ Batch preparation can work with or without recipes
✅ Recipe-free production only tracks finished quantity
✅ Batch-prepared products show out-of-stock (no fallback)
✅ Non-batch-prepared products continue using existing behavior
✅ Remaining finished goods automatically carry to next day
✅ NO automatic waste at end of day
✅ Users can explicitly record waste when needed
✅ Waste requires reason selection
✅ Shelf life warnings shown but do not block sales
✅ Simple "+ Prepare" workflow takes <30 seconds
✅ System is generic (not food-specific)
✅ POS uses simple if/else check (not complex mode switching)

### Existing Criteria (Retained)

✅ Recipe-based production consumes raw materials correctly
✅ Finished goods tracked in separate inventory
✅ POS respects operation mode
✅ Production costs accurately tracked
✅ Backward compatible with existing flows
✅ FIFO respected for finished goods consumption

---

## New Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Accidental automatic waste | NO automatic waste logic — only explicit user action |
| Recipe vs non-recipe complexity | Single engine handles both with flag check |
| User confusion about operation modes | Clear UI labels, tooltips, documentation |
| FIFO complexity with two inventory types | Filter by inventoryType before FIFO sort |

---

## Acceptance Test Scenarios Added

### Scenario 2: Recipe-free Batch Preparation
```
Given: Sandwiches configured as batch-prepared (isBatchPrepared = true, productionUsesRecipe = false)
When: User prepares 50 Sandwiches
Then: NO raw materials deducted
And: Finished goods created: Sandwiches +50 pcs
```

### Scenario 4: POS Out of Stock (No Fallback)
```
Given: Finished inventory = 5, Raw materials = sufficient
And: Product has isBatchPrepared = true
When: Customer purchases 10
Then: Transaction fails with "out of stock"
And: NO raw materials deducted (no fallback)
```

### Scenario 5: Natural Carryover
```
Given: Day 1: Remaining 18
When: Day 2 starts
Then: Opening inventory = 18 (automatic)
```

### Scenario 7: Shelf Life Warning (No Auto-Waste)
```
Given: Batch 23 hours old, shelfLifeHours = 24
When: User views preparation page
Then: Warning shown
And: Inventory remains available
And: NO automatic waste
```

### Scenario 8: Non-Batch-Prepared Product
```
Given: Coffee has isBatchPrepared = false
When: Customer purchases Coffee
Then: Existing system behavior (unchanged)
And: NO production module involvement
```

### Scenario 9: Cost Allocation with Variance (Edge Case)
```
Given: Recipe-based production targeting 100 units
And: Total material cost = ₱1,000
When: Actual output = 95 units (5% spillage)
Then: Cost per unit = ₱1,000 / 95 = ₱10.53
And: Loss absorbed into finished goods cost
```

### Scenario 10: Concurrent POS Sales (Edge Case)
```
Given: Finished inventory = 5 units
And: Terminal A attempts to sell 3 units
And: Terminal B simultaneously attempts to sell 3 units
When: Both transactions execute
Then: First transaction succeeds (remaining: 2 units)
And: Second transaction fails with "out of stock"
And: No negative inventory
```

### Scenario 11: Unit Conversion in Production (Edge Case)
```
Given: Recipe requires 0.5 kg Chicken per piece
And: Inventory has 2000 g Chicken
When: User prepares 3 pieces
Then: System converts: 2000 g = 2 kg available
And: Required: 0.5 kg × 3 = 1.5 kg
And: Sufficient: 2 kg >= 1.5 kg ✓
And: Deducts: 1500 g from inventory
```

### Scenario 12: Multi-Item Cart with Out-of-Stock (Edge Case)
```
Given: Cart items:
  - Regular Item A: 2 units (in stock)
  - Batch-Prepared Item B: 5 units (only 3 available)
  - Regular Item C: 1 unit (in stock)
When: Cashier attempts checkout
Then: Entire transaction fails
And: Error: "Item B out of stock (3 available, 5 required)"
And: NO items deducted from inventory
And: User must remove Item B or reduce quantity
```

---

## Documentation Updates Required

### User Documentation

1. **New Guide**: "Batch Preparation"
   - What is batch preparation
   - When to use it vs. regular inventory
   - How to configure products
   - Examples for different business types

2. **Updated Guide**: "Inventory Management"
   - Raw materials vs finished goods
   - How carryover works
   - Waste recording

### Developer Documentation

1. **Architecture Decision Record**: "Batch Preparation Flag"
   - Why simple boolean instead of enum
   - How POS determines behavior
   - No-fallback rationale

2. **Integration Guide**: "Working with Production Module"
   - How to check `isBatchPrepared` flag
   - Finished goods consumption
   - Waste recording API

---

## Breaking Changes

### None (Fully Backward Compatible)

- Existing products default to `isBatchPrepared = false`
- Existing inventory defaults to `RAW_MATERIAL` type
- All existing flows continue unchanged
- Feature is opt-in via configuration

---

## Key Simplifications from Original

1. **No operation mode enum**: Just a boolean `isBatchPrepared` flag
2. **No make-to-order modifications**: Existing recipe-based flow untouched
3. **Simple POS logic**: if/else instead of three-way switch
4. **Clearer scope**: ONLY batch preparation, nothing else

---

## Critical Edge Cases Addressed

The specification now explicitly handles 5 critical edge cases that could cause production issues:

### 1. Cost Allocation for Finished Goods
**Problem**: How is production cost split across finished units?

**Solution**:
- Recipe-based: `costPerUnit = totalMaterialCost / actualQuantity`
- Recipe-free: `costPerUnit = 0` (no cost tracking)
- Each finished inventory record stores its own `costPrice`

**Impact on COGS**: Recipe-free products report 0 cost unless manually set.

### 2. Target vs Actual Quantity Variance
**Problem**: What happens when actual output < target (spillage, yield loss)?

**Solution**:
- Normal variance (5-10%): Loss absorbed into higher cost per unit
- Catastrophic failure (0 output): Complete with `actualQuantity = 0`, no finished goods
- UI warns when actual < 80% of target

**Example**: 
```
Target: 100, Materials consumed: for 100
Actual: 95 produced
Result: Cost spreads over 95 units (5% higher per-unit cost)
```

### 3. Concurrency Control
**Problem**: Two POS terminals selling last 5 units simultaneously → race condition

**Solution**:
- Check availability INSIDE `dbTransaction` (atomic)
- Optimistic concurrency with version checking (optional)
- Retry logic with exponential backoff (max 3 attempts)
- Clear error if conflict persists

**Code Pattern**:
```typescript
dbTransaction(() => {
  // 1. Check available (inside transaction lock)
  // 2. Deduct if sufficient
  // 3. Throw if insufficient (rolls back)
})
```

### 4. Unit Conversion
**Problem**: Recipe says "0.5 kg", inventory tracked in "grams"

**Solution**:
- Use existing `UnitEngine.convert()` for all operations
- Convert inventory to recipe unit for comparison
- Convert back to inventory unit for deduction
- Type safety: throws on unit type mismatch (kg → L)

**Example**:
```typescript
Recipe: 0.5 kg Chicken
Inventory: 2000 g available
Converted: 2 kg available ✓
```

### 5. Multi-Item Transaction Failure
**Problem**: Cart has 3 items, one batch-prepared item out of stock. What happens?

**Solution**: **Fail entire transaction** (atomic behavior)
- Pre-validate ALL items before any deduction
- If any item insufficient → throw error
- Transaction rolls back completely
- Clear error message listing out-of-stock items

**Rationale**: Partial fulfillment creates reconciliation issues; customer expects all items together.

---

## Estimated Effort Adjustment

**Original**: 8-12 hours (4 sprints × 2-3 hours)

**Updated**: 14-18 hours (4 sprints × 3.5-4.5 hours)

**Reason**: Additional complexity from:
- Supporting both recipe-based and recipe-free
- Edge case handling (5 scenarios)
- Unit conversion in production
- Concurrency control
- Enhanced UI for simplified workflow
- Comprehensive testing for edge cases

---

## Key Principles Emphasized

1. **Batch preparation focus**: This module ONLY handles batch preparation
2. **Existing flows untouched**: Recipe-based sale-time deduction remains as-is
3. **Simple flag, not enum**: `isBatchPrepared` boolean is sufficient
4. **Generic, not food-specific**: Applicable to any batch preparation scenario
5. **User thinks simply**: Prepare → Sell → Keep → Dispose (when needed)
6. **No automatic actions**: User always in control
7. **Natural behavior**: Inventory persists, no special handling needed
8. **No silent fallbacks**: Respect batch-prepared flag strictly
9. **Recipe optional**: Support businesses that don't track ingredients
10. **Simple first**: Basic workflow is fast, advanced features are optional

---

## Next Steps

1. ✅ Review and approve enhanced specification
2. Begin Sprint 1: Schema changes (simple `isBatchPrepared` flag)
3. Implement core engines with both recipe modes
4. Build simplified UI
5. Update POS integration with simple if/else check
6. Test all scenarios thoroughly
7. Document and deploy

---

**Created**: 2026-08-20  
**Updated**: 2026-08-20 (Clarified: Make-to-order is NOT the focus)
**Status**: Enhancement Complete — Ready for Implementation Review


---

## Edge Cases Verification Summary

All 5 critical edge cases have been addressed in the specification:

✅ **Cost Allocation**: Formula defined (`totalCost / actualQuantity`), recipe-free = 0  
✅ **Yield Variance**: Loss absorbed into unit cost, zero-output supported  
✅ **Concurrency**: Transaction atomicity + optional versioning + retry logic  
✅ **Unit Conversion**: Existing `UnitEngine` integration documented  
✅ **Multi-Item OOS**: Fail-entire-transaction pattern specified  

See `production-edge-cases.md` for detailed implementation guidance on each edge case.
