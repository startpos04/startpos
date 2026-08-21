# Three Inventory Management Modes - Revised Implementation Plan

**Status**: Planning Phase (DO NOT IMPLEMENT YET)  
**Last Updated**: Based on comprehensive codebase inspection  
**Architecture Version**: Aligned with offline-first, OPFS-backed reactive collections

---

## Executive Summary

This document revises the original inventory modes implementation plan to address critical architectural requirements discovered through codebase inspection. The plan establishes exactly three user-facing inventory management modes while maintaining data integrity, offline-first architecture, and production safety.

### Three Modes

1. **No Inventory** (`none`) - No tracking, unlimited checkout
2. **Loose Inventory** (`relaxed`) - Track stock, allow negative, scheduled reconciliation  
3. **Strict Inventory** (`strict`) - Track stock, block checkout at zero

---

## Part 1: Current State Analysis

### 1.1 What Already Exists

**✅ BusinessCharacteristics Field**
```typescript
// web/src/lib/onboarding/types.ts
inventoryCriticality: 'none' | 'relaxed' | 'standard' | 'strict'
```

**✅ Survey Question Q4 Mapping**
```typescript
// web/src/lib/onboarding/survey-interpreter.ts (lines 94-96)
Q4_OPTIONS.NO           → inventoryCriticality: 'none'
Q4_OPTIONS.YES_RELAXED  → inventoryCriticality: 'standard'  // ⚠️ WRONG
Q4_OPTIONS.PERIODIC     → inventoryCriticality: 'relaxed'
Q4_OPTIONS.YES_STRICT   → inventoryCriticality: 'strict'
```

**✅ Observation Rules**
```typescript
// web/src/lib/evolution/observation-rules.ts
ruleInventoryCriticalityStrict   // adjustments > 4  → 'strict'   (0.85)
ruleInventoryCriticalityStandard // adjustments ≥ 10 → 'standard' (0.80)
```

**✅ Inventory Enforcement (All Clamped)**
```typescript
// web/src/lib/inventory/inventory-engine.ts
// All mutations use Math.max(0, quantity - usage) or Math.min()
// Lines: 244, 277, 429, 478, 549
```

**✅ POS Stock Validation**
```typescript
// web/src/lib/queries/create-pos-transaction.ts (lines 147-150)
for (const [variantId, amountNeeded] of Object.entries(PosStockEngine.getReservedMap(...))) {
  const { stock, name } = PosStockEngine.findPhysicalStock(variantId, dbProducts)
  if (stock < amountNeeded) 
    throw new Error(`Insufficient stock for ${name}`)
}
```

**✅ Stock Calculation**
```typescript
// web/src/lib/conversion/pos-stock-engine.ts (line 129)
return Math.floor(Math.max(0, availableTotal) / amountPerUnit)
// Always clamps to 0
```

### 1.2 Critical Discovery: The `standard` Problem

**Current State**:
- Enum includes **four** values: `'none' | 'relaxed' | 'standard' | 'strict'`
- Survey Q4 (`YES_RELAXED`) maps to `'standard'` (NOT `'relaxed'`!)
- Observation rule produces `'standard'` at 10+ adjustments
- Used in profile classifier tests
- Present in business profile editor dropdown

**Impact**:
- Users selecting "yes_relaxed" in survey get `inventoryCriticality: 'standard'`
- No production code differentiates `'standard'` from `'strict'` behavior
- `'relaxed'` is currently only produced by `PERIODIC` survey answer
- Semantic mismatch: `'relaxed'` should be loose, but survey maps incorrectly

---

## Part 2: Architectural Decisions

### 2.1 Resolve `standard` Mode

**DECISION**: Migrate `'standard'` → `'strict'`

**Rationale**:
1. **No behavioral difference**: Current code treats all non-`none` modes identically (clamps to 0)
2. **Survey semantics**: `YES_STRICT` and `YES_RELAXED` should not produce same behavior
3. **Three-mode target**: Product requirement is exactly 3 modes
4. **Lowest risk**: `standard` → `strict` preserves blocking behavior (safe for existing users)

**Migration Path**:
```typescript
// Phase 1: Update survey interpreter
Q4_OPTIONS.YES_STRICT  → 'strict'
Q4_OPTIONS.YES_RELAXED → 'relaxed'  // ⚠️ CHANGE (was 'standard')
Q4_OPTIONS.PERIODIC    → 'relaxed'  // ✅ KEEP
Q4_OPTIONS.NO          → 'none'

// Phase 2: Update observation rule
ruleInventoryCriticalityStandard → ruleInventoryCriticalityStrict
// Fire at 10+ adjustments → 'strict' (was 'standard')

// Phase 3: Data migration
UPDATE Business 
SET livingCharacteristics = jsonb_set(
  livingCharacteristics,
  '{inventoryCriticality,value}',
  '"strict"'
)
WHERE livingCharacteristics->'inventoryCriticality'->>'value' = 'standard';

// Phase 4: Update type definition
type inventoryCriticality = 'none' | 'relaxed' | 'strict'  // Remove 'standard'
```

### 2.2 Separate Stock Truth From Policy

**DECISION**: Stock engine returns TRUTH, policy layer enforces RULES

**Architecture**:
```typescript
┌──────────────────────────────────────────────────┐
│         PosStockEngine (TRUTH)                   │
│  calculateRemainingYield() → actual inventory    │
│  - none:    return UNLIMITED                     │
│  - relaxed: return actual (can be negative)      │
│  - strict:  return actual (can be negative)      │
└──────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│       InventoryPolicy (ENFORCEMENT)              │
│  - none:    always allow checkout                │
│  - relaxed: always allow checkout                │
│  - strict:  throw if would go negative           │
└──────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│       InventoryEngine (MUTATION)                 │
│  - none:    no-op                                │
│  - relaxed: draft.quantity -= qty (allow < 0)   │
│  - strict:  if (qty > avail) throw error         │
└──────────────────────────────────────────────────┘
```

**Rationale**:
- Stock engine should not lie about inventory (no artificial clamping)
- Policy decisions happen at enforcement boundary (transaction create)
- Mutations receive pre-validated quantities (already checked)
- Audit trail remains truthful

### 2.3 Remove `999` Magic Number

**DECISION**: Use discriminated union for stock results

**Current (problematic)**:
```typescript
return 999  // "unlimited"
```

**Revised**:
```typescript
type StockResult = 
  | { type: 'unlimited' }
  | { type: 'tracked', quantity: number }  // can be negative

// PosStockEngine.calculateRemainingYield returns StockResult
```

**Impact**:
- No artificial ceiling (999 actually means something now)
- Type-safe discrimination
- Clear intent in code

**Alternative** (if union breaks too much):
```typescript
return Number.POSITIVE_INFINITY  // clearer than 999
```

**Migration Strategy**:
- Check all callers of `calculateRemainingYield()`
- Update UI components to handle `{ type, quantity }`
- Add type guards: `isUnlimited()`, `isTracked()`

### 2.4 Business-Level Configuration

**DECISION**: Inventory mode is BUSINESS-LEVEL (not product-level)

**Current State**:
```typescript
user?.business?.livingCharacteristics?.inventoryCriticality?.value
```

**Reasoning**:
- Original requirement describes business workflow types
- Mixing strict/loose within one business creates confusion
- Simpler UX (one mode, all products)
- Capability architecture assumes business-level

**Future Extension** (not now):
- Could add product-level override field later
- Would require: `Product.inventoryOverride?: 'none' | 'strict'`
- Not in scope for initial implementation

---

## Part 3: Strict Mode - Rejection Before Mutation

### 3.1 Critical Requirement

**Strict inventory must reject BEFORE mutation, not clamp AFTER**

**Current (WRONG)**:
```typescript
// web/src/lib/inventory/inventory-engine.ts:244
draft.quantity = Math.max(0, draft.quantity - movement.quantity)
// ⚠️ Hides violation instead of preventing it
```

**Revised (CORRECT)**:
```typescript
// BEFORE mutation
if (inventoryMode === 'strict') {
  const resultingQuantity = currentQuantity - requestedQuantity
  if (resultingQuantity < 0) {
    throw new InsufficientStockError(
      `Cannot deduct ${requestedQuantity} from ${currentQuantity}`,
      { variantId, available: currentQuantity, requested: requestedQuantity }
    )
  }
}

// AFTER validation passes
draft.quantity -= requestedQuantity  // No clamping
```

### 3.2 Enforcement Points

**All inventory mutation paths must enforce strict mode:**

1. **POS Transaction** (web/src/lib/queries/create-pos-transaction.ts:147-150)
   - ✅ Already validates before transaction
   - ⚠️ Throws generic Error (should be typed)
   - ✅ Happens before `dbTransaction()` starts

2. **Void Purchase** (web/src/lib/inventory/inventory-engine.ts:242-246)
   - ⚠️ Currently clamps to 0 (allows negative correction)
   - Should check mode before reversing

3. **Task Fulfillment** (web/src/lib/inventory/inventory-engine.ts:427-550)
   - ⚠️ Uses `Math.min(qty, sourceBatch.quantity)` (prevents over-deduction)
   - Should check mode and throw if insufficient

4. **Production Consumption** (web/src/lib/production/production-engine.ts:355)
   - ⚠️ Direct deduction (no mode check)
   - Should enforce strict mode

5. **Waste Disposal** (web/src/lib/production/waste-engine.ts:145)
   - ⚠️ Direct deduction (no mode check)
   - Should enforce strict mode

6. **Finished Goods Consumption** (web/src/lib/production/finished-goods-engine.ts:192)
   - ⚠️ Direct deduction (no mode check)
   - Already throws on insufficient stock (good!)
   - Should check mode for consistency

### 3.3 Error Handling

**New error type**:
```typescript
// web/src/lib/inventory/errors.ts
export class InsufficientStockError extends Error {
  constructor(
    message: string,
    public readonly details: {
      variantId: string
      available: number
      requested: number
      productName?: string
    }
  ) {
    super(message)
    this.name = 'InsufficientStockError'
  }
}
```

**UI Handling**:
```typescript
try {
  await createPosTransaction(...)
} catch (error) {
  if (error instanceof InsufficientStockError) {
    // Show specific out-of-stock dialog
    toast.error(`Out of stock: ${error.details.productName}`)
  } else {
    // Generic error
    toast.error('Transaction failed')
  }
}
```

---

## Part 4: Loose Inventory - Using Existing Restock Flow

### 4.1 Business Workflow

**Loose inventory mode behavior**:

```
1. Physical stock exists
     ↓
2. Sell products freely (inventory goes negative - allowed)
     ↓
3. Perform physical count (scheduled: end of day/week)
     ↓
4. Use existing "Restock" flow to add inventory
     ↓
5. Inventory returns to positive based on actual count
```

### 4.2 No New Reconciliation Feature Needed

**Existing restock flow** (web/src/lib/queries/restock-ingredient.ts) already supports this:
- User enters: quantity, cost, reason
- Creates: Purchase record + inventory movement (IN)
- Works for both positive and negative starting inventory
- No special "reconciliation" UI needed

**Why this works for loose mode**:
- Negative inventory is just a number (e.g., -10 units)
- "Restock 50 units" moves it from -10 → +40
- Clear audit trail in inventory movements
- Same flow whether starting from 0 or negative

### 4.3 Loose Mode UX Requirements

**Stock Display**:
```tsx
{inventoryMode === 'relaxed' && remainingYield < 0 && (
  <Badge variant="warning" className="bg-amber-100 text-amber-800">
    Stock: {remainingYield} (will become negative after sale)
  </Badge>
)}
```

**Settings Description**:
```
✓ Loose Inventory
  Track inventory without blocking sales. 
  Use the restock flow to adjust inventory after physical counts.
  
  Best for: Restaurants, cafes, batch-produced items
```

**Inventory Page Behavior**:
- Negative stock values displayed normally (e.g., "-10 units")
- "Restock" button always available (works from any starting quantity)
- No special "Reconcile" button needed

---

## Part 5: Offline & Multi-Device Verification

### 5.1 Current Offline Architecture

**Discovery from codebase inspection**:

1. **Offline-First Design** (OPFS + rxdb)
   - Local collections sync with server
   - Transactions commit locally first
   - Background sync when online

2. **Sequence Allocation** (web/src/lib/prisma-client/sequence-api.ts)
   - Online: Server-side atomic allocation with retry
   - Offline: Local `fetchStructuredId()` (client-side)
   - **Restriction**: Only designated terminal can checkout offline

3. **Conflict Resolution**
   - Retry logic for serialization conflicts (lines 46-50, 79-86)
   - `ConcurrencyError` triggers transaction retry
   - No explicit merge strategy found

4. **Inventory Synchronization**
   - Collections: `inventoryCollection`, `inventoryMovementCollection`
   - Movements are INSERT-only (append-only ledger)
   - Quantity is UPDATE (last-write-wins)

### 5.2 Strict Mode Offline Behavior

**Scenario**:
```
Recorded stock: 5

Device A (offline): sells 4 → local stock becomes 1
Device B (offline): sells 4 → local stock becomes 1

Both sync:
- Device A committed first → succeeds
- Device B syncs → sees stock was 5, now 1
- Device B's transaction: 5 - 4 = 1 ✓ (appears valid)
- Result: sold 8 units with only 5 stock
```

**Current Architecture Limitation**:
- ⚠️ No optimistic locking on inventory quantity
- ⚠️ Last-write-wins on `inventoryCollection.update()`
- ⚠️ Strict mode cannot guarantee "never oversell" while offline

**Mitigation Strategies**:

**Option A: Offline Restriction (CURRENT)**
- Only designated terminal can checkout offline
- Prevents concurrent offline sales
- Already implemented (lines 95-99)
- ✅ **Recommendation: Document as intended behavior**

**Option B: Version-Based Optimistic Locking** (Future)
```typescript
// Add version field to Inventory schema
inventory.version: number

// On deduction:
if (inventory.version !== expectedVersion) {
  throw new ConcurrencyError('Inventory changed, please retry')
}

// On success:
draft.version += 1
```

**Option C: Server-Side Reconciliation** (Future)
- Server detects impossible inventory after sync
- Flags transaction for review
- Admin can approve/void retroactively

**DECISION FOR NOW**:
- **Acknowledge limitation**: Strict mode is "best effort" offline
- **Rely on existing restriction**: One designated offline terminal
- **Document clearly**: Settings UI should explain

### 5.3 Loose Mode Offline Behavior

**Expected**: Loose mode should work safely offline (no conflicts)

**Verification**:
- Negative stock is intentional (not a conflict)
- Multiple devices selling → all succeed (aggregate becomes very negative)
- Reconciliation later resolves true count
- ✅ No changes needed

### 5.4 None Mode Offline Behavior

**Expected**: No inventory involvement offline

**Verification**:
- Stock checks skipped entirely
- No inventory mutations
- No sync conflicts possible
- ✅ No changes needed

---

## Part 6: Capability Architecture Review

### 6.1 Current Setup

```typescript
// web/src/lib/onboarding/capability-registry.ts:392-410
{
  id: 'MANAGE_INVENTORY',
  required: c => c.tracksInventory,
  boosters: [
    { label: 'strict inventory criticality', 
      signal: c => (c.inventoryCriticality === 'strict' ? 1.0 : 0) 
    }
  ]
}
```

### 6.2 Problem

Original plan suggested:
```typescript
required: c => c.tracksInventory && c.inventoryCriticality !== 'none'
```

**Issue**: This creates circular dependency:
- `inventoryCriticality === 'none'` means no inventory tracking
- But `MANAGE_INVENTORY` controls access to inventory features
- User in `none` mode cannot switch to other modes (no UI access)

### 6.3 Correct Interpretation

**`MANAGE_INVENTORY` capability means:**
> "This business has access to inventory functionality"

**`inventoryCriticality` characteristic means:**
> "How inventory behaves when tracking is active"

**Relationship**:
```
MANAGE_INVENTORY = false
  → All inventory UI hidden
  → inventoryCriticality is irrelevant

MANAGE_INVENTORY = true
  → Inventory UI visible
  → inventoryCriticality controls enforcement:
    - none: Tracking disabled (opt-out)
    - relaxed: Tracking enabled, no blocking
    - strict: Tracking enabled, block at zero
```

### 6.4 Revised Capability Definition

```typescript
{
  id: 'MANAGE_INVENTORY',
  required: c => c.tracksInventory,  // ✅ KEEP
  boosters: [
    { label: 'physical goods', signal: c => (c.sellsPhysicalGoods ? 0.8 : 0) },
    { label: 'raw materials', signal: c => (c.sellsRawMaterials ? 1.0 : 0) },
    { label: 'strict inventory', 
      signal: c => (c.inventoryCriticality === 'strict' ? 1.0 : 0) 
    },
    { label: 'relaxed inventory',
      signal: c => (c.inventoryCriticality === 'relaxed' ? 0.8 : 0)  // NEW
    }
  ]
}
```

**Settings UI Logic**:
```typescript
const canConfigureInventory = useCapability(Capabilities.MANAGE_INVENTORY)

// Show mode selector only if capability enabled
{canConfigureInventory && (
  <RadioGroup label="Inventory Mode">
    <Radio value="none">No Tracking</Radio>
    <Radio value="relaxed">Loose Tracking</Radio>
    <Radio value="strict">Strict Tracking</Radio>
  </RadioGroup>
)}
```

**Mode Change Validation**:
```typescript
// User can change between modes freely if capability is enabled
// Switching to 'none' does not disable MANAGE_INVENTORY
// (They can switch back without admin intervention)
```

---

## Part 7: Settings UX

### 7.1 User-Facing Labels

**DO NOT expose internal terminology**

**Settings Page**:
```tsx
<RadioGroup label="Inventory Management">
  <Radio value="none">
    <strong>No Inventory Tracking</strong>
    <p>Don't track stock levels. Best for services and digital products.</p>
  </Radio>

  <Radio value="relaxed">
    <strong>Loose Inventory Tracking</strong>
    <p>Track inventory without blocking sales. 
       Stock can be reconciled later through physical counts. 
       Best for restaurants and cafes.</p>
  </Radio>

  <Radio value="strict">
    <strong>Strict Inventory Tracking</strong>
    <p>Block sales when recorded inventory reaches zero. 
       Best for retail and wholesale.</p>
  </Radio>
</RadioGroup>

{/* Explanation based on current mode */}
{inventoryMode === 'relaxed' && (
  <Alert variant="info">
    <strong>How Loose Inventory Works</strong>
    <p>Sales are processed immediately without waiting for inventory input. 
       Perform physical stock counts on your schedule 
       (end of day, weekly, etc.) and the system will calculate 
       the adjustment automatically.</p>
  </Alert>
)}
```

### 7.2 Onboarding Survey (Q4)

**Current Question** (keep wording):
> "Do you track how much stock you have?"

**Answer Options** (revise):
```
◯ No, I don't track inventory
   → inventoryCriticality: 'none'

◯ Yes, but I count stock periodically (e.g., end of day)
   → inventoryCriticality: 'relaxed'

◯ Yes, I update stock levels as I receive and sell
   → inventoryCriticality: 'strict'
```

**Remove** (current unused option):
```
◯ YES_RELAXED → currently maps to 'standard' (confusing)
```

---

## Part 8: UI Visibility Requirements

### 8.1 Capability-Based UI Visibility

**Always Visible (Basic Features)**:
- Transaction History sidebar link
- Cost column in products table
- Net Margin column in products table
- Cost and Net Margin fields in create/edit product forms

**Hidden when `MANAGE_INVENTORY` capability is disabled**:
- Ingredients column in products table
- Asset Value column in products table
- Stock Status column in products table
- Stock Total column in products table
- Locations tab in settings
- Batch prep details on product details page
- Batch prep fields in create/edit product forms

**Hidden when Suppliers capability is disabled**:
- Suppliers tab in sidebar

**Hidden when Customers capability is disabled**:
- Customers tab in sidebar

**Hidden when Batch Prep capability is disabled**:
- Batch prep details on product details page
- Batch prep fields in create/edit product forms

### 8.2 Rationale

**Cost and Net Margin are ALWAYS visible** because:
- They are fundamental business metrics (profitability tracking)
- Every business needs to track pricing vs cost relationship
- Useful for service-based businesses without inventory
- Help identify low-margin products regardless of inventory mode

**Inventory-specific data is conditionally hidden**:
- Ingredients count → only relevant when tracking recipes
- Asset value → only meaningful when tracking stock quantities
- Stock status/total → only applicable when inventory management is enabled

---

## Part 9: Implementation Phases

### Phase 1: Type System & Survey (SAFE)

**Files to Change**:
1. `web/src/lib/onboarding/types.ts` (line 65)
   ```diff
   - inventoryCriticality: 'none' | 'relaxed' | 'standard' | 'strict'
   + inventoryCriticality: 'none' | 'relaxed' | 'strict'
   ```

2. `web/src/lib/onboarding/survey-interpreter.ts` (line 95)
   ```diff
   const inventoryCriticality: BusinessCharacteristics['inventoryCriticality'] =
   -  q4 === Q4_OPTIONS.YES_STRICT ? 'strict' : 
   -  q4 === Q4_OPTIONS.YES_RELAXED ? 'standard' :  // ⚠️ WRONG
   -  q4 === Q4_OPTIONS.PERIODIC ? 'relaxed' : 'none'
   +  q4 === Q4_OPTIONS.YES_STRICT ? 'strict' : 
   +  q4 === Q4_OPTIONS.YES_RELAXED ? 'relaxed' :   // ✅ FIXED
   +  q4 === Q4_OPTIONS.PERIODIC ? 'relaxed' : 'none'
   ```

3. `web/src/lib/evolution/observation-rules.ts` (line 169)
   ```diff
   - const ruleInventoryCriticalityStandard: ObservationRule<'inventoryCriticality'> = {
   -   value: 'standard',
   + const ruleInventoryCriticalityStrict: ObservationRule<'inventoryCriticality'> = {
   +   value: 'strict',
   ```

4. `web/src/routes/(private)/(dashboard)/settings/-business-profile/index.tsx` (line 136)
   ```diff
   - inventoryCriticality: ['none', 'relaxed', 'standard', 'strict'],
   + inventoryCriticality: ['none', 'relaxed', 'strict'],
   ```

**Database Migration**:
```sql
-- Migrate existing 'standard' to 'strict'
UPDATE "Business" 
SET "livingCharacteristics" = jsonb_set(
  "livingCharacteristics",
  '{inventoryCriticality,value}',
  '"strict"'::jsonb,
  true
)
WHERE "livingCharacteristics"->'inventoryCriticality'->>'value' = 'standard';
```

**Testing**:
- [ ] Survey interpreter tests pass
- [ ] Observation rule fires correctly
- [ ] Profile classifier tests updated
- [ ] No `'standard'` references remain

### Phase 2: Stock Engine Revision (BREAKING)

**Goal**: Separate truth from policy

**2a. Update Stock Engine Result Type**

```typescript
// web/src/lib/conversion/pos-stock-engine.ts

export type StockResult = 
  | { type: 'unlimited' }
  | { type: 'tracked', quantity: number }

export const PosStockEngine = {
  calculateRemainingYield: (
    product: posProduct,
    variant: posProduct['variants'][number],
    selectedComponentIds: string[],
    cartItems: posItem[],
    orderItems?: posItem[],
    inventoryMode: 'none' | 'relaxed' | 'strict'
  ): StockResult => {
    
    // Mode: none - no tracking
    if (inventoryMode === 'none') {
      return { type: 'unlimited' }
    }

    // SERVICE type - always unlimited
    if (product.type === 'SERVICE') {
      return { type: 'unlimited' }
    }

    // No components + no inventory → provisional
    const hasComponents = variant.components && variant.components.length > 0
    const hasInventory = variant.inventory && variant.inventory.length > 0
    if (!hasComponents && !hasInventory) {
      return { type: 'unlimited' }
    }

    const reserved = PosStockEngine.getReservedMap(cartItems, orderItems)
    const unitReqs = PosStockEngine.getUnitRequirements(variant, selectedComponentIds)

    const yields = Object.entries(unitReqs).map(([materialId, amountPerUnit]) => {
      const { stock } = PosStockEngine.findPhysicalStock(materialId, product)
      const availableTotal = stock - (reserved[materialId] || 0)
      
      // Return actual quantity (can be negative in relaxed mode)
      return Math.floor(availableTotal / amountPerUnit)
    })

    const quantity = yields.length > 0 ? Math.min(...yields) : 0
    return { type: 'tracked', quantity }
  }
}
```

**2b. Update All Callers**

Files to update:
- `web/src/routes/(private)/pos/-components/product-dialog.tsx`
- `web/src/routes/(private)/pos/-components/product-card.tsx`
- `web/src/routes/(private)/pos/-components/cart-aside.tsx`

Pattern:
```typescript
const stockResult = PosStockEngine.calculateRemainingYield(...)
const isUnlimited = stockResult.type === 'unlimited'
const quantity = stockResult.type === 'tracked' ? stockResult.quantity : Infinity

const canCheckout = isUnlimited || inventoryMode === 'relaxed' || quantity > 0
```

**Testing**:
- [ ] All POS components compile
- [ ] Stock badges show correctly
- [ ] Checkout button enables/disables correctly

### Phase 3: Inventory Engine Enforcement (CRITICAL)

**Goal**: Reject before mutation in strict mode

**3a. Add Error Type**

```typescript
// web/src/lib/inventory/errors.ts (NEW FILE)

export class InsufficientStockError extends Error {
  constructor(
    message: string,
    public readonly details: {
      variantId: string
      available: number
      requested: number
      productName?: string
    }
  ) {
    super(message)
    this.name = 'InsufficientStockError'
  }
}
```

**3b. Add Validation Helper**

```typescript
// web/src/lib/inventory/inventory-policy.ts (NEW FILE)

import { InsufficientStockError } from './errors'

export const InventoryPolicy = {
  /**
   * Validates a proposed inventory deduction against the current mode.
   * 
   * @throws InsufficientStockError if strict mode and insufficient stock
   */
  validateDeduction(
    variantId: string,
    currentQuantity: number,
    requestedQuantity: number,
    inventoryMode: 'none' | 'relaxed' | 'strict',
    productName?: string
  ): void {
    if (inventoryMode === 'none') {
      return // No validation needed
    }

    if (inventoryMode === 'relaxed') {
      return // Always allowed
    }

    // Strict mode: reject if insufficient
    const resultingQuantity = currentQuantity - requestedQuantity
    if (resultingQuantity < 0) {
      throw new InsufficientStockError(
        `Insufficient stock for ${productName || variantId}`,
        {
          variantId,
          available: currentQuantity,
          requested: requestedQuantity,
          productName
        }
      )
    }
  }
}
```

**3c. Update Inventory Engine**

```typescript
// web/src/lib/inventory/inventory-engine.ts

// Add mode to all mutation methods
export interface ApplyPurchaseVoidParams {
  // ... existing fields
  inventoryMode: 'none' | 'relaxed' | 'strict'  // NEW
}

// In applyPurchaseVoid:
for (const movement of movementsToReverse) {
  if (inventoryCollection.has(movement.inventoryId)) {
    const batch = inventoryCollection.get(movement.inventoryId)!
    
    // Validate before mutation (strict mode)
    InventoryPolicy.validateDeduction(
      movement.variantId,
      batch.quantity,
      movement.quantity,
      params.inventoryMode,
      // productName lookup omitted for brevity
    )

    // After validation passes
    inventoryCollection.update(movement.inventoryId, draft => {
      draft.quantity -= movement.quantity  // NO CLAMPING
    })
  }
}
```

**Apply to all mutation methods:**
- `applyPurchaseVoid()`
- `applyTaskFulfillment()` (SHELF_REFILL, BRANCH_TRANSFER, WASTE_DISPOSAL)

**3d. Update POS Transaction Validation**

```typescript
// web/src/lib/queries/create-pos-transaction.ts (line 147)

// Get inventory mode from business characteristics
const inventoryMode = user?.business?.livingCharacteristics?.inventoryCriticality?.value || 'strict'

// Existing validation (keep as-is)
for (const [variantId, amountNeeded] of Object.entries(PosStockEngine.getReservedMap(...))) {
  const { stock, name } = PosStockEngine.findPhysicalStock(variantId, dbProducts)
  
  // Only validate in strict mode
  if (inventoryMode === 'strict' && stock < amountNeeded) {
    throw new InsufficientStockError(
      `Insufficient stock for ${name}`,
      { variantId, available: stock, requested: amountNeeded, productName: name }
    )
  }
}
```

**Testing**:
- [ ] Strict mode blocks checkout at 0 stock
- [ ] Relaxed mode allows negative stock
- [ ] None mode ignores stock entirely
- [ ] Error messages show product names
- [ ] All inventory mutation paths validated

### Phase 4: UX Polish & Testing

**5a. Update Settings Page**
```tsx
// web/src/routes/(private)/(dashboard)/settings/-capabilities/index.tsx

<RadioGroup 
  label="Inventory Management"
  value={inventoryCriticality}
  onChange={handleChangeMode}
>
  <Radio value="none">
    <strong>No Inventory Tracking</strong>
    <p>Don't track stock levels.</p>
  </Radio>
  
  <Radio value="relaxed">
    <strong>Loose Inventory Tracking</strong>
    <p>Track inventory without blocking sales. 
       Reconcile through physical counts.</p>
  </Radio>
  
  <Radio value="strict">
    <strong>Strict Inventory Tracking</strong>
    <p>Block sales when stock reaches zero.</p>
  </Radio>
</RadioGroup>
```

**5b. Update Product Dialog**
```tsx
// Show appropriate messaging per mode
{inventoryMode === 'none' && (
  // Hide stock badge entirely
)}

{inventoryMode === 'relaxed' && stockResult.type === 'tracked' && stockResult.quantity < 0 && (
  <Badge variant="warning">
    Stock: {stockResult.quantity} (inventory will be negative)
  </Badge>
)}

{inventoryMode === 'strict' && stockResult.type === 'tracked' && (
  <Badge variant={stockResult.quantity > 10 ? 'success' : 'warning'}>
    {stockResult.quantity} units available
  </Badge>
)}
```

**5c. Update Products Table**
```tsx
// Already done in previous work:
// - Hide stock columns when inventoryMode === 'none'
// - Show negative stock in relaxed mode
```

**Testing**:
- [ ] Settings page shows 3 modes only
- [ ] Mode descriptions are clear
- [ ] Stock badges show correctly per mode
- [ ] Checkout button behavior correct per mode

---

## Part 9: Migration Checklist

### 9.1 Pre-Implementation Audit

**Before changing any code, verify:**

- [ ] All references to `'standard'` identified
- [ ] All uses of `calculateRemainingYield()` identified
- [ ] All inventory mutation paths identified
- [ ] All inventory validation paths identified
- [ ] All tests that reference inventory modes identified
- [ ] Survey flow tested end-to-end

**Search Commands**:
```bash
# Find all 'standard' references
rg "standard" --type ts

# Find all stock engine calls
rg "calculateRemainingYield" --type ts

# Find all inventory mutations
rg "draft\.quantity\s*[-+]" --type ts

# Find all Math.max(0, references
rg "Math\.max\(0," --type ts
```

### 9.2 Data Migration

**Before deploying to production:**

```sql
-- 1. Check how many businesses use 'standard'
SELECT COUNT(*) 
FROM "Business"
WHERE "livingCharacteristics"->'inventoryCriticality'->>'value' = 'standard';

-- 2. Migrate to 'strict'
UPDATE "Business" 
SET "livingCharacteristics" = jsonb_set(
  "livingCharacteristics",
  '{inventoryCriticality,value}',
  '"strict"'::jsonb,
  true
)
WHERE "livingCharacteristics"->'inventoryCriticality'->>'value' = 'standard';

-- 3. Verify no 'standard' remains
SELECT COUNT(*) 
FROM "Business"
WHERE "livingCharacteristics"->'inventoryCriticality'->>'value' = 'standard';
-- Should return 0
```

### 9.3 Backward Compatibility

**API Responses**:
- Old clients may expect `'standard'` in responses
- Add API version header if breaking change
- Consider: map `'strict'` → `'standard'` for old clients (temporary)

**Offline Sync**:
- Clients with old data may send `'standard'`
- Server should accept and migrate: `'standard'` → `'strict'`
- Add migration in sync endpoint

---

## Part 10: Testing Strategy

### 10.1 Unit Tests

**PosStockEngine** (web/__tests__/unit/lib/conversion/pos-stock-engine.test.ts):
```typescript
describe('calculateRemainingYield with inventory modes', () => {
  it('returns unlimited for none mode', () => {
    const result = PosStockEngine.calculateRemainingYield(
      product, variant, [], [], [], 'none'
    )
    expect(result).toEqual({ type: 'unlimited' })
  })

  it('returns negative quantity in relaxed mode', () => {
    // Set up: stock = 5, reserved = 10
    const result = PosStockEngine.calculateRemainingYield(
      product, variant, [], cartWithReserved, [], 'relaxed'
    )
    expect(result).toEqual({ type: 'tracked', quantity: -5 })
  })

  it('returns negative quantity in strict mode (no clamping)', () => {
    // Set up: stock = 5, reserved = 10
    const result = PosStockEngine.calculateRemainingYield(
      product, variant, [], cartWithReserved, [], 'strict'
    )
    expect(result).toEqual({ type: 'tracked', quantity: -5 })
  })
})
```

**InventoryPolicy** (NEW FILE):
```typescript
describe('InventoryPolicy.validateDeduction', () => {
  it('allows deduction in none mode regardless of stock', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 0, 10, 'none')
    }).not.toThrow()
  })

  it('allows negative result in relaxed mode', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 5, 10, 'relaxed')
    }).not.toThrow()
  })

  it('throws InsufficientStockError in strict mode', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 5, 10, 'strict')
    }).toThrow(InsufficientStockError)
  })

  it('allows exact deduction in strict mode', () => {
    expect(() => {
      InventoryPolicy.validateDeduction('v1', 10, 10, 'strict')
    }).not.toThrow()
  })
})
```

**Survey Interpreter** (web/__tests__/unit/lib/onboarding/survey-interpreter.test.ts):
```typescript
describe('Q4 inventory mode mapping', () => {
  it('YES_STRICT → strict', () => {
    const result = interpretSurvey({ q4_inventory_tracking: 'yes_strict' })
    expect(result.inventoryCriticality).toBe('strict')
  })

  it('YES_RELAXED → relaxed (FIXED)', () => {
    const result = interpretSurvey({ q4_inventory_tracking: 'yes_relaxed' })
    expect(result.inventoryCriticality).toBe('relaxed')
  })

  it('PERIODIC → relaxed', () => {
    const result = interpretSurvey({ q4_inventory_tracking: 'periodic' })
    expect(result.inventoryCriticality).toBe('relaxed')
  })

  it('NO → none', () => {
    const result = interpretSurvey({ q4_inventory_tracking: 'no' })
    expect(result.inventoryCriticality).toBe('none')
  })
})
```

### 10.2 Integration Tests

**Create POS Transaction**:
```typescript
describe('createPosTransaction with inventory modes', () => {
  it('succeeds with stock in strict mode', async () => {
    // Setup: stock = 10, selling 5
    seedInventory({ variantId: 'v1', quantity: 10 })
    await setInventoryMode('strict')
    
    const result = await createPosTransaction(saleData, products)
    expect(result.data).toBeDefined()
    expect(getStock('v1')).toBe(5)
  })

  it('blocks checkout at 0 stock in strict mode', async () => {
    // Setup: stock = 0
    seedInventory({ variantId: 'v1', quantity: 0 })
    await setInventoryMode('strict')
    
    const result = await createPosTransaction(saleData, products)
    expect(result.error).toBeInstanceOf(InsufficientStockError)
    expect(getStock('v1')).toBe(0)  // Not mutated
  })

  it('allows negative stock in relaxed mode', async () => {
    // Setup: stock = 5, selling 10
    seedInventory({ variantId: 'v1', quantity: 5 })
    await setInventoryMode('relaxed')
    
    const result = await createPosTransaction(saleData, products)
    expect(result.data).toBeDefined()
    expect(getStock('v1')).toBe(-5)  // Negative!
  })

  it('ignores stock in none mode', async () => {
    // Setup: stock = 0
    seedInventory({ variantId: 'v1', quantity: 0 })
    await setInventoryMode('none')
    
    const result = await createPosTransaction(saleData, products)
    expect(result.data).toBeDefined()
    expect(getStock('v1')).toBe(0)  // Unchanged (not tracked)
  })
})
```

**Reconciliation**:
```typescript
describe('reconcileInventory', () => {
  it('calculates positive adjustment correctly', async () => {
    // Setup: recorded = 10, physical = 15
    seedInventory({ variantId: 'v1', quantity: 10 })
    
    const result = await reconcileInventory({
      variantId: 'v1',
      locationId: 'loc1',
      physicalCount: 15,
      unitId: 'unit1'
    })
    
    expect(result.reconciliation.adjustment).toBe(5)
    expect(getStock('v1')).toBe(15)
  })

  it('calculates negative adjustment correctly', async () => {
    // Setup: recorded = 10, physical = 7
    seedInventory({ variantId: 'v1', quantity: 10 })
    
    const result = await reconcileInventory({
      variantId: 'v1',
      locationId: 'loc1',
      physicalCount: 7,
      unitId: 'unit1'
    })
    
    expect(result.reconciliation.adjustment).toBe(-3)
    expect(getStock('v1')).toBe(7)
  })

  it('handles reconciling from negative stock', async () => {
    // Setup: recorded = -5, physical = 12
    seedInventory({ variantId: 'v1', quantity: -5 })
    
    const result = await reconcileInventory({
      variantId: 'v1',
      locationId: 'loc1',
      physicalCount: 12,
      unitId: 'unit1'
    })
    
    expect(result.reconciliation.adjustment).toBe(17)
    expect(getStock('v1')).toBe(12)
  })
})
```

### 10.3 E2E Tests

**Scenario: Loose Inventory Workflow**:
```typescript
test('loose inventory: sell, go negative, reconcile', async ({ page }) => {
  // 1. Setup: Set to relaxed mode
  await setInventoryMode(page, 'relaxed')
  await seedInventory(page, { product: 'Coffee', quantity: 5 })
  
  // 2. Sell more than available
  await page.goto('/pos')
  await addToCart(page, 'Coffee', 10)
  await checkout(page)
  
  // Should succeed
  await expect(page.locator('[data-testid="receipt"]')).toBeVisible()
  
  // 3. Check inventory is negative
  await page.goto('/inventory-reports')
  await expect(page.locator('[data-testid="stock-coffee"]')).toHaveText('-5')
  
  // 4. Perform physical count reconciliation
  await page.locator('[data-testid="reconcile-coffee"]').click()
  await page.locator('[data-testid="physical-count"]').fill('20')
  await page.locator('[data-testid="reconcile-button"]').click()
  
  // 5. Verify adjustment calculated correctly
  await expect(page.locator('[data-testid="adjustment"]')).toHaveText('+25')
  
  // 6. Verify final stock
  await expect(page.locator('[data-testid="stock-coffee"]')).toHaveText('20')
})
```

**Scenario: Strict Inventory Blocking**:
```typescript
test('strict inventory: blocked at zero stock', async ({ page }) => {
  // 1. Setup
  await setInventoryMode(page, 'strict')
  await seedInventory(page, { product: 'Coffee', quantity: 3 })
  
  // 2. Try to add 5 units (more than available)
  await page.goto('/pos')
  await page.locator('[data-testid="product-coffee"]').click()
  
  // Should show "Out of Stock" or disabled button
  await expect(page.locator('[data-testid="add-to-cart"]')).toBeDisabled()
  await expect(page.locator('[data-testid="stock-badge"]')).toHaveText('3 units left')
})
```

**Scenario: None Mode**:
```typescript
test('no inventory: unlimited checkout', async ({ page }) => {
  // 1. Setup
  await setInventoryMode(page, 'none')
  await seedInventory(page, { product: 'Coffee', quantity: 0 })
  
  // 2. Can still add to cart
  await page.goto('/pos')
  await page.locator('[data-testid="product-coffee"]').click()
  
  // No stock badge shown
  await expect(page.locator('[data-testid="stock-badge"]')).not.toBeVisible()
  
  // Add button always enabled
  await expect(page.locator('[data-testid="add-to-cart"]')).toBeEnabled()
  
  // Can checkout
  await addToCart(page, 'Coffee', 100)
  await checkout(page)
  await expect(page.locator('[data-testid="receipt"]')).toBeVisible()
  
  // Stock unchanged (not tracked)
  await page.goto('/inventory-reports')
  await expect(page.locator('[data-testid="stock-coffee"]')).toHaveText('0')
})
```

---

## Part 11: Files Affected

### 11.1 Core Type Definitions

- [x] `web/src/lib/onboarding/types.ts` (line 65) - Remove `'standard'`
- [x] `web/src/lib/conversion/pos-stock-engine.ts` - Add `StockResult` type
- [ ] `web/src/lib/inventory/errors.ts` - NEW FILE: Add `InsufficientStockError`
- [ ] `web/src/lib/inventory/inventory-policy.ts` - NEW FILE: Add validation logic

### 11.2 Business Logic

- [x] `web/src/lib/onboarding/survey-interpreter.ts` (line 95) - Fix YES_RELAXED mapping
- [x] `web/src/lib/evolution/observation-rules.ts` (line 169) - Rename to strict
- [ ] `web/src/lib/inventory/inventory-engine.ts` - Add mode parameter to all methods
- [ ] `web/src/lib/queries/create-pos-transaction.ts` (line 147) - Use InsufficientStockError
- [ ] `web/src/lib/queries/reconcile-inventory.ts` - NEW FILE: Add reconciliation
- [ ] `web/src/lib/production/production-engine.ts` (line 355) - Add mode check
- [ ] `web/src/lib/production/waste-engine.ts` (line 145) - Add mode check
- [ ] `web/src/lib/production/finished-goods-engine.ts` (line 192) - Add mode check

### 11.3 UI Components

- [ ] `web/src/routes/(private)/pos/-components/product-dialog.tsx` - Update stock handling
- [ ] `web/src/routes/(private)/pos/-components/product-card.tsx` - Update stock display
- [ ] `web/src/routes/(private)/pos/-components/cart-aside.tsx` - Update validation
- [x] `web/src/routes/(private)/(dashboard)/settings/-business-profile/index.tsx` (line 136) - Remove 'standard'
- [ ] `web/src/routes/(private)/(dashboard)/settings/-capabilities/index.tsx` - Add mode selector
- [ ] `web/src/routes/(private)/(dashboard)/(admin)/inventory/-components/reconcile-inventory-dialog.tsx` - NEW FILE

### 11.4 Tests

- [ ] `web/__tests__/unit/lib/onboarding/survey-interpreter.test.ts` (line 241) - Fix mapping test
- [ ] `web/__tests__/unit/lib/evolution/observation-rules-phase3b.test.ts` - Update rule tests
- [ ] `web/__tests__/unit/lib/onboarding/profile-classifier.test.ts` - Update classifier tests
- [ ] `web/__tests__/unit/lib/conversion/pos-stock-engine.test.ts` - NEW: Add mode tests
- [ ] `web/__tests__/unit/lib/inventory/inventory-policy.test.ts` - NEW FILE
- [ ] `web/__tests__/integration/create-pos-transaction-modes.test.ts` - NEW FILE
- [ ] `web/__tests__/e2e/inventory-modes.spec.ts` - NEW FILE

### 11.5 Database

- [ ] Migration script: `'standard'` → `'strict'` in Business.livingCharacteristics

---

## Part 12: Open Questions & Risks

### 12.1 Open Questions

**Q1**: Should reconciliation be restricted to admins only?
- **Context**: Physical counts are important for accuracy
- **Options**: 
  - A) Anyone with `MANAGE_INVENTORY` can reconcile
  - B) Require `SUPERVISOR` or `ADMIN` role
- **Recommendation**: Start with option B (safer)

**Q2**: Should inventory movements show "RECONCILIATION" type?
- **Context**: Currently uses "IN" or "ADJUST"
- **Impact**: Better audit trail clarity
- **Recommendation**: Add new `MovementType.RECONCILIATION`

**Q3**: What happens to existing carts when mode changes?
- **Context**: User switches from strict → relaxed mid-day
- **Options**:
  - A) Existing carts adapt immediately
  - B) Require cart clear on mode change
- **Recommendation**: Option A (less disruptive)

**Q4**: Should we show a warning when switching from strict → relaxed?
- **Context**: User might not understand implications
- **Recommendation**: Yes, show confirmation dialog

### 12.2 Known Risks

**R1: Offline Strict Mode Cannot Guarantee "Never Oversell"**
- **Impact**: Multiple offline devices can oversell
- **Mitigation**: Document limitation, rely on single-terminal restriction
- **Severity**: MEDIUM (already limited by architecture)

**R2: Stock Result Type is Breaking Change**
- **Impact**: All callers must update
- **Mitigation**: Comprehensive testing, staged rollout
- **Severity**: HIGH (affects UI)

**R3: Data Migration May Affect Existing Users**
- **Impact**: `'standard'` → `'strict'` changes behavior
- **Mitigation**: Send notification, allow self-service revert
- **Severity**: MEDIUM (better than leaving broken)

**R4: Negative Stock May Confuse Users**
- **Impact**: Users see "-10" and think it's broken
- **Mitigation**: Clear UX explanations, help tooltips
- **Severity**: LOW (intentional feature)

**R5: Reconciliation Could Be Misused**
- **Impact**: Staff could "fix" shortages by inflating counts
- **Mitigation**: Audit log all reconciliations, require supervisor approval
- **Severity**: MEDIUM (business process issue)

---

## Part 13: Success Criteria

### 13.1 Functional Requirements

- [ ] Exactly 3 user-facing modes (none, relaxed, strict)
- [ ] Survey maps correctly to modes
- [ ] Strict mode rejects before mutation (never clamps)
- [ ] Loose mode allows negative stock
- [ ] Reconciliation calculates adjustment automatically
- [ ] No `999` magic number in production code
- [ ] Stock engine returns truthful quantities
- [ ] All inventory mutation paths enforce mode
- [ ] Offline behavior documented
- [ ] Settings UI uses clear business language

### 13.2 Technical Requirements

- [ ] No `'standard'` references remain
- [ ] All tests pass
- [ ] Database migration runs cleanly
- [ ] Backward compatibility maintained (API)
- [ ] Error handling covers all modes
- [ ] Audit trail remains accurate
- [ ] Offline sync works correctly

### 13.3 User Experience Requirements

- [ ] Mode descriptions are clear (no jargon)
- [ ] Stock badges adapt to mode
- [ ] Checkout behavior matches expectations
- [ ] Warning messages are helpful
- [ ] Reconciliation UI is intuitive
- [ ] No confusion about negative stock

---

## Part 14: Next Steps

**IMMEDIATE (Before Implementation)**:
1. ✅ Review this revised plan
2. ⬜ Answer open questions (Part 12.1)
3. ⬜ Get stakeholder approval
4. ⬜ Verify database migration script
5. ⬜ Create feature flag (optional)

**PHASE 1 (Low Risk)**:
- Remove `'standard'` from types
- Fix survey mapping
- Update observation rule
- Run database migration
- Update tests

**PHASE 2 (Breaking Change)**:
- Update `StockResult` type
- Update all POS components
- Comprehensive testing

**PHASE 3 (Critical Path)**:
- Add `InsufficientStockError`
- Add `InventoryPolicy` validation
- Update `InventoryEngine` methods
- Update all mutation paths
- Extensive testing

**PHASE 4 (New Feature)**:
- Add reconciliation function
- Add reconciliation UI
- Integration testing

**PHASE 5 (Polish)**:
- Update settings UI
- Add help text
- Update documentation
- E2E testing

---

## Appendix A: Survey Q4 Options Mapping

| Survey Answer | Old Mapping | New Mapping | Reasoning |
|--------------|-------------|-------------|-----------|
| `NO` | `'none'` | `'none'` ✅ | No change |
| `YES_STRICT` | `'strict'` | `'strict'` ✅ | No change |
| `YES_RELAXED` | `'standard'` ⚠️ | `'relaxed'` ✅ | **FIXED**: Now maps to actual relaxed behavior |
| `PERIODIC` | `'relaxed'` | `'relaxed'` ✅ | Correct: periodic counts = loose tracking |

---

## Appendix B: Inventory Mode Behavior Matrix

| Aspect | None | Relaxed | Strict |
|--------|------|---------|--------|
| **Track Stock** | ❌ No | ✅ Yes | ✅ Yes |
| **Block at Zero** | ❌ No | ❌ No | ✅ Yes |
| **Allow Negative** | N/A | ✅ Yes | ❌ No |
| **Reconciliation** | N/A | ✅ Featured | ⚠️ Rare |
| **Offline Safe** | ✅ Yes | ✅ Yes | ⚠️ Best Effort |
| **Stock Badge** | Hidden | Shows (incl. negative) | Shows (clamped display) |
| **Checkout Button** | Always Enabled | Always Enabled | Disabled at 0 |
| **Best For** | Services, Digital | Restaurants, Cafes | Retail, Wholesale |

---

## Appendix C: Glossary

**Inventory Mode**: Business-level setting determining how stock is tracked and enforced

**Stock Truth**: Actual recorded inventory quantity (can be negative in relaxed mode)

**Inventory Policy**: Rules determining when checkout is allowed

**Physical Count**: Actual inventory counted in warehouse/shelf

**Reconciliation**: Process of adjusting recorded inventory to match physical count

**Strict Enforcement**: Blocking checkout when insufficient stock

**Loose Tracking**: Tracking inventory without blocking sales

**OPFS**: Origin Private File System (offline storage mechanism)

**Optimistic Locking**: Concurrency control using version numbers

**Last-Write-Wins**: Conflict resolution where newest update overwrites

---

**END OF REVISED IMPLEMENTATION PLAN**

**Status**: READY FOR REVIEW  
**Approval Required Before**: Implementation begins  
**Estimated Effort**: 3-4 weeks (5 phases)  
**Risk Level**: MEDIUM (breaking changes, data migration)
