# Production / Batch Preparation Module Specification
## Generic Batch Preparation System for Converting Raw Materials to Finished Products

**Problem Statement**: The system currently supports two inventory flows:
1. **Direct purchase → sale**: For products purchased and resold without modification
2. **Make-to-order**: Recipe-based raw material deduction at sale time

However, many businesses **batch-prepare finished products in advance** before customer orders arrive. This requires:
1. Production/preparation events that convert raw materials → finished goods inventory
2. Finished goods inventory tracked separately from raw materials
3. Natural carryover of unsold finished goods to the next day
4. Explicit waste recording (not automatic disposal)
5. Support for both recipe-based and recipe-free preparation

**Use Cases**:
- Restaurant: Fresh chicken → Fried chicken (prepared in batches throughout the day)
- Bakery: Flour + ingredients → Bread loaves (baked before customers arrive)
- Café: Raw coffee beans → Brewed coffee (prepared in carafes)
- Food manufacturer: Raw materials → Packaged meals
- Any business: Component materials → Assembled/prepared products

**Important**: This is NOT a food-specific feature. The domain is: **Raw/Component Materials → Optional Preparation → Finished Sellable Inventory**

---

## Design Overview

### Existing System (Before Production Module)

The current system supports two inventory flows:

#### Flow A: Direct Purchase → Sale
```
Purchase → Inventory → Sale
```
Simple buy-and-resell. **No change required.**

#### Flow B: Recipe-based Deduction at Sale Time
```
Order → Recipe Consumption → Raw Materials Deducted → Customer Receives Product
```
When a customer orders, raw materials are immediately deducted based on recipe. **No change required.**

> **Note**: Flow B is often called "make-to-order" but it's really just recipe-based inventory deduction at point of sale. This specification does NOT modify or enhance Flow B. It remains exactly as-is.

---

### NEW: Production Module (This Specification)

This module adds TWO new flows for businesses that **batch-prepare finished products in advance**:

#### Flow C: Batch Preparation WITH Recipe (NEW - Primary Focus)
```
Raw Materials → Prepare (Batch) → Finished Goods Inventory → Sale → Remaining Stock Carries Over
                                                                           ↓
                                                            Explicit Waste Recording (when needed)
```

**Example**: Restaurant prepares 100 fried chicken pieces in advance. Raw materials consumed during preparation. Finished chicken sits in inventory. Sales consume finished inventory throughout the day.

#### Flow D: Batch Preparation WITHOUT Recipe (NEW - Secondary Focus)
```
Prepare (Batch) → Finished Goods Inventory → Sale → Remaining Stock Carries Over
                                                           ↓
                                            Explicit Waste Recording (when needed)
```

**Example**: Bakery records "50 croissants prepared" without tracking flour/butter/eggs individually. Simplified finished-goods-only tracking.

---

### Key Principles
1. **This Module's Scope**: ONLY batch preparation (Flows C & D)
2. **Optional Recipe**: Production can work with or without ingredient tracking
3. **Two-Stage Inventory**: Raw materials and finished goods tracked separately
4. **Production as Transaction**: Formal record of raw→finished conversion
5. **FIFO for Finished Goods**: Oldest prepared items consumed first (internally)
6. **Natural Carryover**: Remaining finished goods persist to next day automatically
7. **Explicit Waste Only**: No automatic waste at end of day
8. **Simple User Model**: User thinks "Prepare → Sell → Keep remaining → Dispose when necessary"
9. **Generic Domain**: Not food-specific; applicable to any batch preparation scenario
10. **Backward Compatible**: Existing flows remain unchanged

---

## Critical Architectural Requirements

### 1. Product Configuration Must Support Batch Preparation

**Before implementing production**, enhance the Product/ProductVariant model to distinguish batch-prepared products from others:

**Schema Addition Required** (in `ProductVariant` model):
```prisma
model ProductVariant {
  // ... existing fields ...
  
  // NEW: Is this product batch-prepared in advance?
  isBatchPrepared Boolean @default(false)
  
  // NEW: For batch-prepared products, does production use a recipe?
  productionUsesRecipe Boolean @default(true)
  
  // NEW: Optional shelf life / sell-by configuration
  shelfLifeHours Int? // Hours after production before product should be sold
  
  // ... rest of model ...
}
```

**Purpose**:
- `isBatchPrepared` marks products that use the production module
- `productionUsesRecipe` allows batch preparation with or without ingredient tracking
- `shelfLifeHours` supports optional sell-by warnings (does NOT auto-waste)

**Important**: Products where `isBatchPrepared = false` continue using existing flows unchanged.

### 2. POS Must Check If Product Is Batch-Prepared

**Critical**: The POS transaction logic must check `isBatchPrepared` before determining how to consume inventory.

**Current behavior**:
```typescript
// In create-pos-transaction.ts
// Deduct inventory using FIFO
// OR deduct raw materials via recipe (if product has components)
```

**Enhanced behavior required**:
```typescript
const variant = getVariant(variantId)

if (variant.isBatchPrepared) {
  // NEW FLOW: Consume finished goods only
  const finishedInventory = getFinishedInventory(variantId)
  
  if (finishedInventory.totalQuantity >= quantitySold) {
    // Consume finished goods (FIFO)
    consumeFinishedGoods(variantId, quantitySold)
  } else {
    // OUT OF STOCK — do not fall back to raw materials
    throw new Error(`${variant.name} is out of stock. Please prepare more.`)
  }
  
} else {
  // EXISTING FLOWS: Unchanged
  // Either consume purchased inventory
  // OR consume raw materials via recipe (if product has components)
  // This is Flow A or Flow B — not part of this module
}
```

**DO NOT** silently fall back to raw material consumption for batch-prepared products.

**DO NOT** modify the existing behavior for non-batch-prepared products.

### 3. Finished Goods Must Be Distinct Inventory

**Requirement**: Finished goods inventory must be tracked separately from raw material inventory.

**Option A** (Recommended): Use existing `Inventory` model with a distinguishing field:
```prisma
model Inventory {
  // ... existing fields ...
  
  // NEW: Distinguish raw materials from finished goods
  inventoryType InventoryType @default(RAW_MATERIAL)
  
  // NEW: Link to production batch if this is finished goods
  productionOrderId String?
  productionOrder   ProductionOrder? @relation(fields: [productionOrderId], references: [id])
  
  // NEW: When was this batch produced (for FIFO and shelf life)
  producedAt DateTime?
  
  // ... rest of model ...
}

enum InventoryType {
  RAW_MATERIAL   // Purchased materials/ingredients
  FINISHED_GOOD  // Produced/prepared products ready for sale
}
```

**Option B**: Create separate `FinishedGoodsInventory` model (more complex, but cleaner separation)

**Decision needed before implementation**: Choose option based on existing codebase patterns.

---

## Critical Edge Cases & Implementation Details

### Edge Case 1: Cost Allocation for Finished Goods

**Problem**: How is production cost allocated to finished goods?

**Recipe-based Production**:
```typescript
// During production completion
const costPerUnit = Math.round(totalMaterialCost / actualQuantity)

// Store in inventory record
{
  inventoryType: 'FINISHED_GOOD',
  costPrice: costPerUnit, // Cost per single unit
  quantity: actualQuantity,
  productionOrderId: productionOrder.id
}
```

**Recipe-free Production**:
```typescript
// No material cost tracking
{
  inventoryType: 'FINISHED_GOOD',
  costPrice: 0, // No cost basis available
  quantity: actualQuantity,
  productionOrderId: productionOrder.id
}
```

**COGS Reporting Implication**:
- Recipe-based: COGS = sum of consumed finished goods' costPrice × quantity
- Recipe-free: COGS = 0 (material cost not tracked)
- Recipe-free products should set `costPrice` manually if needed for reporting

**Implementation Rule**: 
```typescript
// In ProductionEngine.completeProduction()
const costPerUnit = productionOrder.usesRecipe 
  ? Math.round(productionOrder.totalCost / actualQuantity)
  : 0 // Or optionally accept manual cost input

finishedInventory.costPrice = costPerUnit
```

---

### Edge Case 2: Target vs Actual Quantity Variance

**Problem**: What happens to consumed materials when actual output < target?

**Scenarios**:

**A. Normal Variance (Spillage/Yield Loss)**:
```
Target: 100 units
Materials consumed: for 100 units
Actual output: 95 units

Result:
- 95 finished goods created
- Material cost allocated to 95 units (higher cost per unit)
- 5-unit loss absorbed into finished goods cost
- No waste record needed
```

**B. Catastrophic Failure**:
```
Target: 100 units
Materials consumed: for 100 units
Actual output: 0 units (burnt, contaminated, etc.)

User action required:
1. Cancel the production order OR
2. Complete with actualQuantity = 0
3. Optionally create waste record for "failed production"
```

**Implementation Rules**:
```typescript
// In ProductionEngine.completeProduction()
if (actualQuantity <= 0) {
  // No finished goods created
  // Materials already consumed, loss recorded
  productionOrder.status = 'COMPLETED'
  productionOrder.actualQuantity = 0
  productionOrder.notes = `Total loss: ${reason}`
  // No finished inventory created
}

if (actualQuantity < targetQuantity) {
  // Calculate cost per actual unit (includes loss)
  costPerUnit = totalMaterialCost / actualQuantity
  // Loss absorbed into higher cost per unit
}
```

**UI Consideration**: Warn user when actual < 80% of target, ask for confirmation.

---

### Edge Case 3: Concurrency Control for POS Sales

**Problem**: Race condition when two POS terminals sell the last few units simultaneously.

**Solution**: Row-level locking at database level + optimistic concurrency check.

**Implementation**:

```typescript
// In create-pos-transaction.ts
await dbTransaction(() => {
  // 1. Lock finished inventory rows for this variant
  const finishedBatches = inventoryCollection
    .filter(i => i.variantId === vId && i.inventoryType === 'FINISHED_GOOD')
    .sort((a, b) => a.producedAt.getTime() - b.producedAt.getTime())

  // 2. Check availability INSIDE transaction
  const totalAvailable = finishedBatches.reduce((sum, b) => sum + b.quantity, 0)
  
  if (totalAvailable < quantityNeeded) {
    throw new Error(`Out of stock: ${variant.name}`)
  }

  // 3. Consume using FIFO
  let remaining = quantityNeeded
  for (const batch of finishedBatches) {
    if (remaining <= 0) break
    
    const toConsume = Math.min(batch.quantity, remaining)
    
    // Update with optimistic check
    inventoryCollection.update(batch.id, draft => {
      if (draft.quantity < toConsume) {
        throw new Error(`Concurrency conflict: inventory changed during transaction`)
      }
      draft.quantity -= toConsume
    })
    
    remaining -= toConsume
  }
})
```

**Database Level** (if using PostgreSQL):
```sql
-- Add version column for optimistic locking
ALTER TABLE inventory ADD COLUMN version INT DEFAULT 1;

-- Update with version check
UPDATE inventory 
SET quantity = quantity - ?, version = version + 1
WHERE id = ? AND version = ?;
```

**TanStack DB Consideration**: 
The framework's transaction isolation provides some protection, but explicit version checking in the update logic is recommended for high-concurrency scenarios.

**Mitigation**: 
1. Check-then-update inside single `dbTransaction` (atomic)
2. Catch concurrency errors and retry with exponential backoff (max 3 attempts)
3. Show clear error to user if all retries fail

---

### Edge Case 4: Unit Conversion in Production

**Problem**: Recipe specifies materials in one unit, inventory tracked in another.

**Example**:
```
Recipe: 0.5 kg Chicken per piece
Inventory: 2000 g Chicken available
```

**Solution**: Use existing `UnitEngine.convert()` for all quantity operations.

**Implementation**:

```typescript
// In ProductionEngine.calculateMaterialRequirements()
function calculateMaterialRequirements(variantId: string, quantity: number): MaterialRequirement[] {
  const recipe = getRecipe(variantId) // Returns ProductComponent[]
  
  return recipe.map(component => {
    // Recipe specifies: 0.5 kg per unit
    const requiredInRecipeUnit = component.quantityUsed * quantity
    
    // Get inventory in various units
    const inventoryBatches = getInventory(component.materialId)
    
    // Convert each batch to recipe unit for comparison
    const availableInRecipeUnit = inventoryBatches.reduce((sum, batch) => {
      const converted = UnitEngine.convert(
        batch.quantity,
        batch.unit,        // e.g., g
        component.unit     // e.g., kg
      )
      return sum + converted
    }, 0)
    
    return {
      materialId: component.materialId,
      requiredQuantity: requiredInRecipeUnit,
      requiredUnit: component.unit,
      availableQuantity: availableInRecipeUnit,
      sufficient: availableInRecipeUnit >= requiredInRecipeUnit
    }
  })
}

// During material consumption
function consumeMaterials(requirements: MaterialRequirement[]) {
  for (const req of requirements) {
    const batches = getInventoryBatches(req.materialId)
    let remainingNeeded = req.requiredQuantity // In recipe unit
    
    for (const batch of batches) {
      if (remainingNeeded <= 0) break
      
      // Convert batch quantity to recipe unit
      const batchInRecipeUnit = UnitEngine.convert(
        batch.quantity,
        batch.unit,
        req.requiredUnit
      )
      
      const toConsumeInRecipeUnit = Math.min(batchInRecipeUnit, remainingNeeded)
      
      // Convert back to batch's original unit for deduction
      const toConsumeInBatchUnit = UnitEngine.convert(
        toConsumeInRecipeUnit,
        req.requiredUnit,
        batch.unit
      )
      
      // Deduct from inventory in its native unit
      inventoryCollection.update(batch.id, draft => {
        draft.quantity -= toConsumeInBatchUnit
      })
      
      remainingNeeded -= toConsumeInRecipeUnit
    }
  }
}
```

**Unit Type Safety**:
```typescript
// UnitEngine.convert() already throws on type mismatch
// Example: trying to convert kg (WEIGHT) to L (VOLUME) will throw
UnitEngine.assertSameType(fromUnit, toUnit) // Throws if mismatch
```

**Precision Handling**:
```typescript
// Use UnitEngine.precision() to avoid floating-point errors
const converted = UnitEngine.precision(
  quantity * fromUnit.conversionFactor / toUnit.conversionFactor
)
```

---

### Edge Case 5: Multi-Item Transaction Failure Behavior

**Problem**: What happens when one item in a multi-item POS sale is out of stock?

**Current System Behavior**: `dbTransaction` is atomic — any error rolls back the entire transaction.

**Desired Behavior for Production Module**: **Fail the entire transaction** if any batch-prepared item is out of stock.

**Rationale**:
- Customer expects to purchase all items together
- Partial fulfillment creates inventory/payment reconciliation issues
- Simpler error handling
- Consistent with existing system behavior

**Implementation**:

```typescript
// In create-pos-transaction.ts
await dbTransaction(() => {
  // Process ALL items upfront before any inventory changes
  for (const item of cartItems) {
    const variant = getVariant(item.variantId)
    
    if (variant.isBatchPrepared) {
      const available = getFinishedInventory(item.variantId)
      
      if (available < item.quantity) {
        // This error will roll back the entire transaction
        throw new Error(
          `Cannot complete sale: ${variant.name} is out of stock. ` +
          `Available: ${available}, Required: ${item.quantity}`
        )
      }
    }
  }
  
  // If we reach here, all items have sufficient stock
  // Proceed with inventory deductions for ALL items
  for (const item of cartItems) {
    consumeInventory(item)
  }
  
  // Create transaction record, payments, etc.
})
```

**Error Display**:
```tsx
// In POS UI
try {
  await createPOSTransaction(cart)
} catch (error) {
  if (error.message.includes('out of stock')) {
    // Show specific out-of-stock items
    showOutOfStockDialog({
      items: parseOutOfStockItems(error.message),
      suggestion: 'Please prepare more inventory or remove these items from the cart'
    })
  } else {
    // Generic error
    showError(error.message)
  }
}
```

**Alternative (Future Enhancement)**: Partial fulfillment with split transactions
- Current transaction: Only in-stock items
- Backorder: Out-of-stock items saved for later
- This is a Phase 2+ feature, not part of initial implementation

**Test Scenario**:
```typescript
describe('Multi-item transaction with batch-prepared product', () => {
  it('fails entire transaction when one batch-prepared item is out of stock', async () => {
    // Given: Cart with 3 items
    const cart = [
      { variantId: 'regular-item', quantity: 2 },      // In stock
      { variantId: 'batch-prep-item', quantity: 5 },   // Only 3 available
      { variantId: 'another-item', quantity: 1 },      // In stock
    ]
    
    // When: Attempt transaction
    const result = await createPOSTransaction(cart)
    
    // Then: Entire transaction fails
    expect(result.isErr()).toBe(true)
    expect(result.error.message).toContain('out of stock')
    
    // And: No inventory was deducted for ANY item
    expect(getInventory('regular-item')).toBe(originalQuantity)
    expect(getInventory('batch-prep-item')).toBe(3)
    expect(getInventory('another-item')).toBe(originalQuantity)
  })
})
```

---

## Implementation Checklist: Edge Cases

### Sprint 1 (Schema & Foundation)
- [ ] Add `version` column to `Inventory` for optimistic locking (optional)
- [ ] Verify `UnitEngine` is available and working correctly
- [ ] Document cost allocation formula in code comments

### Sprint 2 (Production Engine)
- [ ] Implement cost-per-unit calculation: `totalCost / actualQuantity`
- [ ] Handle recipe-free production with `costPrice = 0`
- [ ] Implement unit conversion for recipe requirements
- [ ] Add validation: warn when `actual < target * 0.8`
- [ ] Support `actualQuantity = 0` for total loss scenarios

### Sprint 3 (POS Integration)
- [ ] Pre-validate ALL items before inventory deduction
- [ ] Use atomic transaction with check-then-update pattern
- [ ] Implement clear multi-item error messages
- [ ] Add retry logic for concurrency conflicts (max 3 attempts)
- [ ] Test concurrent POS sales on same variant

### Sprint 4 (Testing & Verification)
- [ ] Test scenario: actual output < target (cost allocation)
- [ ] Test scenario: actual output = 0 (total loss)
- [ ] Test scenario: recipe unit ≠ inventory unit (kg vs g)
- [ ] Test scenario: concurrent sales (2 terminals, last 5 units)
- [ ] Test scenario: multi-item cart with one item out of stock
- [ ] Test scenario: recipe-free COGS reporting (expect 0)

---

## Phase 1: Schema & Data Model (High Priority)

### 1.1 Add ProductionOrder Model

**File**: `prisma/schema.prisma`

**Location**: After `GoodsReceiptItem` model (around line 800)

**Purpose**: Track batch preparation events

**Changes**:
```prisma
// ---------------------------------------------------------------------------
// Production/Preparation Domain — Generic batch preparation system
// ---------------------------------------------------------------------------

enum ProductionStatus {
  DRAFT       // Created but not started
  IN_PROGRESS // Materials consumed (if recipe), production underway
  COMPLETED   // Finished goods added to inventory
  CANCELLED   // Voided before completion
}

// Production Order — formal record of batch preparation
// Used for both recipe-based and recipe-free production
model ProductionOrder {
  id            String           @id @default(cuid())
  orderNumber   String           // e.g., "PREP-2024-001" or "PROD-2024-001"
  status        ProductionStatus @default(DRAFT)
  
  // What are we producing?
  targetVariantId String
  targetVariant   ProductVariant @relation("ProductionTarget", fields: [targetVariantId], references: [id])
  targetQuantity  Float          // How many units to produce
  targetUnitId    String
  targetUnit      Unit           @relation("ProductionTargetUnit", fields: [targetUnitId], references: [id])
  
  // Actual output (may differ from target due to waste/efficiency)
  actualQuantity  Float?
  
  // Does this production use a recipe?
  usesRecipe      Boolean        @default(true)
  
  // Production metadata
  startedAt    DateTime?
  completedAt  DateTime?
  producedById String?
  producedBy   User?    @relation("ProductionProducer", fields: [producedById], references: [id])
  notes        String?
  
  // Cost tracking (only for recipe-based production)
  totalCost    Int      @default(0) @db.Integer // Total cost of materials used (in cents)
  
  // Relations
  items              ProductionOrderItem[] // Empty if usesRecipe = false
  inventoryMovements InventoryMovement[]
  finishedInventory  Inventory[]           // The finished goods created by this production
  
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  branchId   String
  branch     Branch   @relation(fields: [branchId], references: [id])
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([orderNumber, businessId])
  @@index([businessId, branchId, status])
  @@index([targetVariantId])
  @@index([completedAt]) // For filtering by production date
  @@map("production_orders")
}

// Line items showing which raw materials were consumed (only for recipe-based production)
model ProductionOrderItem {
  id              String @id @default(cuid())
  
  productionOrderId String
  productionOrder   ProductionOrder @relation(fields: [productionOrderId], references: [id], onDelete: Cascade)
  
  // Which raw material was consumed
  materialVariantId String
  materialVariant   ProductVariant @relation("ProductionMaterial", fields: [materialVariantId], references: [id])
  
  // Quantity consumed
  quantityUsed Float
  unitId       String
  unit         Unit   @relation("ProductionMaterialUnit", fields: [unitId], references: [id])
  
  // Cost per unit at time of consumption
  unitCost Int @db.Integer
  
  businessId String
  business   Business @relation(fields: [businessId], references: [id])
  
  @@index([productionOrderId])
  @@index([materialVariantId])
  @@map("production_order_items")
}
```

### 1.2 Update Inventory Model

**Critical**: Distinguish raw materials from finished goods AND add concurrency control

```prisma
model Inventory {
  // ... existing fields ...
  
  // NEW: Track whether this is raw material or finished goods
  inventoryType InventoryType @default(RAW_MATERIAL)
  
  // NEW: Link to production batch if this is finished goods
  productionOrderId String?
  productionOrder   ProductionOrder? @relation(fields: [productionOrderId], references: [id])
  
  // NEW: When was this batch produced (for FIFO and shelf life tracking)
  producedAt DateTime?
  
  // NEW: Optimistic locking for concurrency control (CRITICAL for POS sales)
  // Prevents race condition when two terminals sell last units simultaneously
  // See production-edge-cases.md §3 for details
  version Int @default(1)
  
  // ... rest of existing fields ...
}

enum InventoryType {
  RAW_MATERIAL   // Purchased materials/ingredients
  FINISHED_GOOD  // Produced/prepared products ready for sale
}
```

**Concurrency Note**: The `version` column is **REQUIRED** for correctness, not optimization. 
`dbTransaction()` uses Read Committed isolation (Prisma default), which allows two concurrent 
transactions to both read "5 available" before either writes, causing double-sales. The version 
check prevents this. See `production-edge-cases.md` §3 for detailed analysis.

### 1.3 Update ProductVariant Model

**Add batch preparation configuration**:

```prisma
model ProductVariant {
  // ... existing fields ...
  
  // NEW: Is this product batch-prepared in advance?
  isBatchPrepared Boolean @default(false)
  
  // NEW: For batch-prepared products, does production use a recipe?
  productionUsesRecipe Boolean @default(true)
  
  // NEW: Optional shelf life configuration (hours after production)
  shelfLifeHours Int? // Used for warnings only, not automatic waste
  
  // NEW: Relations for production
  productionTargets  ProductionOrder[]     @relation("ProductionTarget")
  productionMaterials ProductionOrderItem[] @relation("ProductionMaterial")
  
  // ... rest of existing fields ...
}
```

**Note**: We're NOT adding an `operationMode` enum. The production module only cares whether `isBatchPrepared` is true or false. Everything else remains unchanged.

### 1.4 Update Related Models

**Add relations to existing models**:

```prisma
// In Business model, add:
productionOrders     ProductionOrder[]
productionOrderItems ProductionOrderItem[]

// In Branch model, add:
productionOrders ProductionOrder[]

// In Unit model, add:
productionTargetUnits   ProductionOrder[]     @relation("ProductionTargetUnit")
productionMaterialUnits ProductionOrderItem[] @relation("ProductionMaterialUnit")

// In User model, add:
productionOrders ProductionOrder[] @relation("ProductionProducer")

// In InventoryMovement model, update:
productionOrderId String?
productionOrder   ProductionOrder? @relation(fields: [productionOrderId], references: [id])
```

### 1.5 Update MovementType Enum

**Add new movement types**:
```prisma
enum MovementType {
  IN
  OUT
  ADJUST
  WASTE              // Explicit waste recording
  EXTERNAL_TRANSFER
  INTERNAL_TRANSFER
  PRODUCTION_IN      // Finished goods added after production
  PRODUCTION_OUT     // Raw materials consumed for production
}
```

---

## Phase 2: Core Production Engine (High Priority)

### 2.1 Create Production Engine

**File**: `src/lib/production/production-engine.ts`

**Purpose**: Central logic for batch preparation operations (both recipe-based and recipe-free)

**Key Functions**:
```typescript
export const ProductionEngine = {
  // Create a production order (with or without recipe)
  createProductionOrder(params: CreateProductionOrderParams): ProductionOrder
  
  // Start production: consume raw materials from inventory (if using recipe)
  startProduction(orderId: string, ctx: ProductionContext): Result<ProductionOrder>
  
  // Complete production: add finished goods to inventory
  completeProduction(orderId: string, actualQty: number, ctx: ProductionContext): Result<ProductionOrder>
  
  // Cancel production: return materials to inventory if not started (recipe-based only)
  cancelProduction(orderId: string, reason: string, ctx: ProductionContext): Result<ProductionOrder>
  
  // Calculate material requirements from ProductComponent recipe (if using recipe)
  calculateMaterialRequirements(variantId: string, quantity: number): MaterialRequirement[] | null
  
  // Validate sufficient raw materials exist before production (recipe-based only)
  validateMaterialAvailability(requirements: MaterialRequirement[], branchId: string): ValidationResult
  
  // Check if product can be batch-prepared
  canBatchPrepare(variantId: string): boolean
  
  // Get finished goods inventory for a variant
  getFinishedInventory(variantId: string, branchId: string): FinishedInventorySummary
}

interface CreateProductionOrderParams {
  variantId: string
  quantity: number
  unitId: string
  usesRecipe: boolean // Determined from variant.productionUsesRecipe
  notes?: string
  ctx: ProductionContext
}

interface FinishedInventorySummary {
  totalQuantity: number
  batches: Array<{
    inventoryId: string
    quantity: number
    producedAt: Date
    expiresAt: Date | null
    ageHours: number
  }>
}
```

**Design Notes**:
- Support BOTH recipe-based and recipe-free production
- For recipe-based: Use FIFO for consuming raw materials
- For finished goods: Create inventory records with `inventoryType: FINISHED_GOOD`
- Always use `dbTransaction` for atomicity
- Create `InventoryMovement` records for audit trail
- DO NOT automatically create waste — only when explicitly requested

**Recipe-based Production Flow**:
1. DRAFT → IN_PROGRESS: Consume raw materials (PRODUCTION_OUT movements)
2. IN_PROGRESS → COMPLETED: Add finished goods (PRODUCTION_IN movements)

**Recipe-free Production Flow**:
1. DRAFT → COMPLETED: Add finished goods only (PRODUCTION_IN movements, no material consumption)

### 2.2 Finished Goods Consumption Logic

**File**: `src/lib/production/finished-goods-engine.ts`

**Purpose**: Handle consuming finished goods during POS transactions **with concurrency protection**

**Key Functions**:
```typescript
export const FinishedGoodsEngine = {
  // Consume finished goods using FIFO (oldest first) with optimistic locking
  consumeFinishedGoods(params: ConsumeFinishedGoodsParams): ConsumptionResult
  
  // Check if sufficient finished goods exist
  checkAvailability(variantId: string, quantity: number, branchId: string): boolean
  
  // Get batches approaching expiry (based on shelfLifeHours)
  getBatchesApproachingExpiry(branchId: string, hoursThreshold: number): ExpiringBatch[]
}

interface ConsumeFinishedGoodsParams {
  variantId: string
  quantity: number
  unitId: string
  transactionId: string
  branchId: string
  userId: string
}

interface ConsumptionResult {
  consumed: Array<{
    inventoryId: string
    quantity: number
    costPrice: number
  }>
  totalCost: number
}

// Custom error for concurrency conflicts
class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConcurrencyError'
  }
}
```

**FIFO Logic with Optimistic Locking**:
```typescript
// Sort finished goods batches by producedAt (oldest first)
const finishedBatches = inventory
  .filter(i => i.inventoryType === 'FINISHED_GOOD' && i.variantId === variantId)
  .sort((a, b) => a.producedAt.getTime() - b.producedAt.getTime())

// Consume from oldest batches first with version checking
let remaining = quantityNeeded
for (const batch of finishedBatches) {
  if (remaining <= 0) break
  
  const toConsume = Math.min(batch.quantity, remaining)
  const expectedVersion = batch.version
  
  // CRITICAL: Version check prevents double-sales
  // See production-edge-cases.md §3 for race condition analysis
  inventoryCollection.update(batch.id, draft => {
    if (draft.version !== expectedVersion) {
      throw new ConcurrencyError(
        `Inventory ${batch.id} was modified by another transaction. ` +
        `Expected version ${expectedVersion}, got ${draft.version}`
      )
    }
    draft.quantity -= toConsume
    draft.version += 1
  })
  
  remaining -= toConsume
}
```

**Why Version Check is Required**:
```
Scenario: 5 units available, two terminals simultaneously sell 3 units

WITHOUT version check (Read Committed isolation):
  Terminal A reads: quantity = 5
  Terminal B reads: quantity = 5
  Terminal A writes: quantity = 2  ✓
  Terminal B writes: quantity = 2  ✓
  Result: -1 units (NEGATIVE INVENTORY BUG)

WITH version check (optimistic locking):
  Terminal A reads: quantity = 5, version = 1
  Terminal B reads: quantity = 5, version = 1
  Terminal A writes: quantity = 2, version = 2 WHERE version = 1  ✓
  Terminal B writes: quantity = 2, version = 2 WHERE version = 1  ✗ (version is now 2)
  Result: ConcurrencyError thrown, retry triggered, correct stock maintained
```

### 2.3 Waste Recording Engine

**File**: `src/lib/production/waste-engine.ts`

**Purpose**: Explicit waste recording (not automatic)

**Key Functions**:
```typescript
export const WasteEngine = {
  // Record waste for finished goods
  recordWaste(params: RecordWasteParams): WasteRecord
  
  // Get waste summary for reporting
  getWasteSummary(branchId: string, dateRange: DateRange): WasteSummary
}

interface RecordWasteParams {
  variantId: string
  quantity: number
  reason: string // e.g., "Expired", "Spoiled", "Damaged", "End of shelf life"
  inventoryIds?: string[] // Specific batches to waste (optional, defaults to FIFO)
  ctx: TenantContext
}
```

**Important**: Waste is ONLY created when user explicitly records it. No automatic waste at end of day.

---

## Phase 3: Simple Preparation UI (High Priority)

**User Mental Model**: "Prepare → Sell → Keep remaining → Dispose when necessary"

### 3.1 Main Preparation Page

**File**: `src/routes/app/[businessId]/[branchId]/preparation/index.tsx`

**Purpose**: Primary operational view for batch preparation

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Production & Preparation                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Today (August 20, 2026)                                │
│                                                          │
│  Prepared Today    Sold Today    Remaining              │
│      145              102            43                 │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Prepared Products                                      │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Fried Chicken                                  │    │
│  │ 80 prepared  •  65 sold  •  15 remaining      │    │
│  │ Last batch: 2 hours ago                        │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Beef Stew                                      │    │
│  │ 20 prepared  •  12 sold  •  8 remaining       │    │
│  │ ⚠️ Approaching shelf life (2 hours left)      │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Lasagna                                        │    │
│  │ 15 prepared  •  10 sold  •  5 remaining       │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│                               [+ Prepare]                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Summary statistics (prepared today, sold today, remaining stock)
- List of batch-prepared products with current status
- Visual warnings for products approaching configured shelf life
- Shows carryover from previous days naturally
- Simple "+ Prepare" button as primary action

**Data Query**:
```typescript
// Get all batch-prepared products with inventory status
const products = await db.productVariant.findMany({
  where: {
    operationMode: 'BATCH_PREPARED',
    businessId,
    branchId
  },
  include: {
    inventory: {
      where: { inventoryType: 'FINISHED_GOOD' }
    },
    productionOrders: {
      where: {
        completedAt: { gte: startOfToday }
      }
    }
  }
})

// Calculate summary
const preparedToday = sum(productionOrders.actualQuantity)
const soldToday = sum(movements.where(type: OUT, date: today).quantity)
const remaining = sum(inventory.quantity)
```

### 3.2 Prepare Product Dialog

**Trigger**: Click "+ Prepare" button

**Flow**:
```
Step 1: Select Product & Quantity
┌─────────────────────────────────────┐
│  Prepare Product                    │
├─────────────────────────────────────┤
│                                      │
│  Product:                            │
│  [Fried Chicken ▼]                  │
│                                      │
│  Quantity:                           │
│  [  30  ] [pcs ▼]                   │
│                                      │
│  [Cancel]            [Continue]     │
└─────────────────────────────────────┘

Step 2a: Recipe-based (if productionUsesRecipe = true)
┌─────────────────────────────────────┐
│  Prepare 30 Fried Chicken           │
├─────────────────────────────────────┤
│                                      │
│  Required Materials:                 │
│                                      │
│  ✓ Chicken: 3.0 kg (Available)      │
│  ✓ Oil: 0.5 L (Available)           │
│  ✓ Seasoning: 0.3 kg (Available)    │
│                                      │
│  Estimated Cost: ₱450.00            │
│                                      │
│  [Back]              [Prepare]      │
└─────────────────────────────────────┘

Step 2b: Recipe-free (if productionUsesRecipe = false)
┌─────────────────────────────────────┐
│  Prepare 30 Sandwiches              │
├─────────────────────────────────────┤
│                                      │
│  This will add 30 sandwiches to     │
│  finished inventory.                 │
│                                      │
│  Note (optional):                    │
│  [                          ]       │
│                                      │
│  [Back]              [Prepare]      │
└─────────────────────────────────────┘

Step 3: Confirmation
┌─────────────────────────────────────┐
│  ✓ Prepared Successfully            │
├─────────────────────────────────────┤
│                                      │
│  30 Fried Chicken prepared          │
│                                      │
│  Finished Inventory: +30            │
│  Total Available: 45 pcs            │
│                                      │
│  [Close]       [Prepare More]       │
└─────────────────────────────────────┘
```

**Simplified Flow**: No separate "draft → start → complete" stages. Clicking "Prepare" immediately:
1. Validates material availability (if recipe-based)
2. Consumes raw materials (if recipe-based)
3. Adds finished goods to inventory
4. Records production order as COMPLETED

**For advanced users who need multi-stage control**, provide an "Advanced Production" page with draft/start/complete workflow.

### 3.3 Waste Recording Dialog

**Trigger**: Button/action on preparation page or product detail

**Flow**:
```
┌─────────────────────────────────────┐
│  Record Waste                       │
├─────────────────────────────────────┤
│                                      │
│  Product:                            │
│  [Fried Chicken ▼]                  │
│                                      │
│  Quantity to Dispose:                │
│  [  15  ] [pcs ▼]                   │
│                                      │
│  Available: 15 pcs                   │
│                                      │
│  Reason:                             │
│  [ Past Shelf Life ▼ ]              │
│  • Past Shelf Life                   │
│  • Expired                           │
│  • Spoiled                           │
│  • Damaged                           │
│  • Failed Preparation                │
│  • Other                             │
│                                      │
│  Notes (optional):                   │
│  [                          ]       │
│                                      │
│  [Cancel]         [Record Waste]    │
└─────────────────────────────────────┘
```

**Important**: Waste is ONLY recorded when user explicitly triggers this action. Not automatic.

### 3.4 Production History / Detail Page

**File**: `src/routes/app/[businessId]/[branchId]/preparation/history.tsx`

**Purpose**: View past preparation batches

**Features**:
- List all production orders (completed, in-progress, cancelled)
- Filter by date range, product, status
- View material consumption breakdown (recipe-based)
- View finished goods created
- Timeline of production events

---

## Phase 4: POS Integration (Critical)

**CRITICAL REQUIREMENT**: This phase must implement concurrency control. See `production-edge-cases.md` §3 for detailed race condition analysis.

### 4.1 Update POS Transaction Logic

**File**: `src/lib/queries/create-pos-transaction.ts`

**Critical Changes**: 
1. Check if product is batch-prepared
2. Implement retry logic for concurrency conflicts

**Add Retry Wrapper** (NEW - Required for concurrency):
```typescript
// Custom error for concurrency conflicts
class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConcurrencyError'
  }
}

// Wrapper function to handle concurrency conflicts
async function createPOSTransactionWithRetry(
  data: CreatePOSTransactionParams,
  maxAttempts = 3
): Promise<Result<Transaction, Error>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await createPOSTransaction(data)
    } catch (error) {
      // Retry ONLY on concurrency conflicts, NOT on genuine out-of-stock
      if (error instanceof ConcurrencyError && attempt < maxAttempts) {
        // Exponential backoff: 100ms, 200ms, 400ms
        await sleep(100 * Math.pow(2, attempt - 1))
        console.log(`Concurrency conflict detected, retry ${attempt}/${maxAttempts}`)
        continue
      }
      throw error // Re-throw if: not concurrency error, or max attempts reached
    }
  }
}

// Helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
```

**Current behavior** (around line 500-550):
```typescript
// Existing: Deduct inventory using FIFO or recipe-based consumption
const inventoryBatches = [...inventoryCollection.values()]
  .filter(i => i.variantId === vId && i.quantity > 0)
  .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

const plan = CostingEngine.prepareConsumption('FIFO', { variantId: vId, quantity: totalQty, unit }, inventoryBatches)
```

**Enhanced behavior required**:
```typescript
// NEW: Check if product is batch-prepared
const variant = dbProducts
  .flatMap(p => p.variants)
  .find(v => v.id === vId)

if (!variant) continue

// Handle batch-prepared products differently
if (variant.isBatchPrepared) {
  // NEW FLOW: Consume finished goods only
  const finishedBatches = [...inventoryCollection.values()]
    .filter(i => 
      i.variantId === vId && 
      i.inventoryType === 'FINISHED_GOOD' && 
      i.quantity > 0
    )
    .sort((a, b) => 
      new Date(a.producedAt || a.createdAt).getTime() - 
      new Date(b.producedAt || b.createdAt).getTime()
    )

  const totalFinished = finishedBatches.reduce((sum, b) => sum + b.quantity, 0)

  if (totalFinished < totalQty) {
    throw new Error(
      `${variant.product.name} is out of stock. ` +
      `Available: ${totalFinished}, Required: ${totalQty}. ` +
      `Please prepare more inventory.`
    )
  }

  // Consume finished goods using FIFO
  const plan = CostingEngine.prepareConsumption(
    'FIFO',
    { variantId: vId, quantity: totalQty, unit },
    finishedBatches
  )

  for (const usage of plan.consumed || []) {
    inventoryCollection.update(usage.inventoryId, draft => {
      draft.quantity -= usage.quantity
    })

    inventoryMovementCollection.insert({
      id: crypto.randomUUID(),
      variantId: vId,
      inventoryId: usage.inventoryId,
      userId: user.id,
      quantity: usage.quantity,
      unitId: unit.id,
      type: MovementType.OUT,
      reason: `Sale: Invoice ${invoiceNo}`,
      transactionId: transaction.id,
      purchaseId: null,
      targetBranchId: null,
      locationId: null,
      businessId: user.business.id,
      branchId: user.branch.id,
      updatedAt: new Date(),
      createdAt: new Date(),
      operationalTaskId: null,
    })
  }

} else {
  // EXISTING FLOWS: Not batch-prepared
  // Use existing logic unchanged
  // This handles both purchased inventory and recipe-based deduction
  
  const inventoryBatches = [...inventoryCollection.values()]
    .filter(i => i.variantId === vId && i.quantity > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  const plan = CostingEngine.prepareConsumption('FIFO', { variantId: vId, quantity: totalQty, unit }, inventoryBatches)
  
  // ... existing FIFO consumption code ...
}
```

**Important Notes**:
- Only check `isBatchPrepared` flag
- Do NOT modify existing behavior for non-batch-prepared products
- Do NOT implement fallback from finished goods to raw materials
- This is a simple if/else branch, not a complex three-way mode check

### 4.2 Update Low Stock Detection

**File**: `src/lib/notification/notification-engine.ts`

**Enhancement**: Detect low stock for finished goods separately from raw materials

**Current behavior**:
```typescript
// Checks total inventory quantity against lowStockThreshold
if (totalQuantity <= lowStockThreshold) {
  // Create SHELF_REFILL task
}
```

**Enhanced behavior**:
```typescript
const variant = getVariant(variantId)

if (variant.isBatchPrepared) {
  // Check FINISHED GOODS inventory specifically
  const finishedQuantity = inventory
    .filter(i => i.variantId === variantId && i.inventoryType === 'FINISHED_GOOD')
    .reduce((sum, i) => sum + i.quantity, 0)

  if (finishedQuantity <= lowStockThreshold) {
    // Create PRODUCTION_TASK instead of SHELF_REFILL
    createProductionTask({
      variantId,
      currentFinished: finishedQuantity,
      threshold: lowStockThreshold,
      suggestedQty: lowStockThreshold - finishedQuantity + 10
    })
  }
  
  // Optionally: Also check raw materials separately
  // to warn if ingredients are running low
  
} else {
  // Existing logic for non-batch-prepared products
  if (totalQuantity <= lowStockThreshold) {
    // Create SHELF_REFILL task
  }
}
```

**New Task Type** (add to `TaskType` enum if not exists):
```prisma
enum TaskType {
  SHELF_REFILL
  BRANCH_TRANSFER
  STOCK_COUNT
  WASTE_DISPOSAL
  PRODUCTION_TASK  // NEW: Reminder to prepare more finished goods
}
```

---

## Phase 5: Natural Inventory Carryover (Built-in)

**Important**: This phase requires NO implementation. Natural carryover should work automatically.

### 5.1 Verification Checklist

Verify that the existing inventory architecture already supports:

- [x] Inventory records persist across days (no automatic expiry)
- [x] Inventory queries do not filter by date (unless explicitly requested)
- [x] Finished goods created on Day 1 remain in inventory on Day 2
- [x] FIFO naturally prioritizes older batches based on `producedAt` timestamp
- [x] Dashboard/reports show total inventory regardless of when it was created

**Expected behavior**:
```
Day 1 (Aug 20):
  Produce: 100 units
  Sell: 82 units
  Remaining: 18 units

Day 2 (Aug 21):
  Opening stock: 18 units (from yesterday)
  Produce: 30 units
  Total available: 48 units
  Sell: 40 units
  Remaining: 8 units

Day 3 (Aug 22):
  Opening stock: 8 units (from yesterday)
  Produce: 50 units
  Total available: 58 units
```

**No special code required**. The inventory simply persists.

### 5.2 Optional: Opening Stock Report

**File**: `src/routes/app/[businessId]/[branchId]/preparation/reports/opening-stock.tsx`

**Purpose**: Show starting inventory at the beginning of each day for reconciliation

**Query**:
```typescript
// Get all finished goods inventory at start of day
const openingStock = await db.inventory.findMany({
  where: {
    branchId,
    inventoryType: 'FINISHED_GOOD',
    quantity: { gt: 0 }
  },
  include: {
    variant: {
      include: { product: true }
    }
  }
})

// Group by variant and show total
const summary = groupBy(openingStock, 'variantId').map(group => ({
  product: group[0].variant.product.name,
  variant: group[0].variant.name,
  totalQuantity: sum(group.map(i => i.quantity)),
  oldestBatch: min(group.map(i => i.producedAt)),
  batchCount: group.length
}))
```

---

## Phase 6: Shelf Life Warnings (Not Automatic Waste)

### 6.1 Optional Shelf Life Configuration

**Already added to schema** in Phase 1:
```prisma
model ProductVariant {
  shelfLifeHours Int? // Hours after production before product should be sold
}
```

### 6.2 Expiry Warning System

**File**: `src/lib/production/shelf-life-engine.ts`

**Purpose**: Identify products approaching shelf life (for warnings only)

**Key Functions**:
```typescript
export const ShelfLifeEngine = {
  // Get batches approaching configured shelf life
  getBatchesApproachingExpiry(
    branchId: string, 
    hoursThreshold: number = 2
  ): ExpiringBatch[]
  
  // Check if a specific batch has expired
  isBatchExpired(inventory: Inventory, variant: ProductVariant): boolean
}

interface ExpiringBatch {
  inventoryId: string
  variantId: string
  productName: string
  quantity: number
  producedAt: Date
  shelfLifeHours: number
  hoursRemaining: number
  expiresAt: Date
}
```

**Logic**:
```typescript
function getBatchesApproachingExpiry(branchId: string, hoursThreshold: number = 2) {
  const now = new Date()
  
  const batches = db.inventory.findMany({
    where: {
      branchId,
      inventoryType: 'FINISHED_GOOD',
      quantity: { gt: 0 },
      variant: {
        shelfLifeHours: { not: null }
      }
    },
    include: { variant: { include: { product: true } } }
  })

  return batches
    .map(batch => {
      const producedAt = batch.producedAt || batch.createdAt
      const shelfLifeHours = batch.variant.shelfLifeHours!
      const expiresAt = addHours(producedAt, shelfLifeHours)
      const hoursRemaining = differenceInHours(expiresAt, now)

      return {
        inventoryId: batch.id,
        variantId: batch.variantId,
        productName: batch.variant.product.name,
        quantity: batch.quantity,
        producedAt,
        shelfLifeHours,
        hoursRemaining,
        expiresAt
      }
    })
    .filter(b => b.hoursRemaining <= hoursThreshold && b.hoursRemaining > 0)
    .sort((a, b) => a.hoursRemaining - b.hoursRemaining)
}
```

### 6.3 UI Warning Display

**In Preparation Page** (`preparation/index.tsx`):
```tsx
{batch.hoursRemaining !== null && batch.hoursRemaining <= 2 && (
  <div className="flex items-center gap-2 text-orange-600">
    <AlertTriangle className="h-4 w-4" />
    <span className="text-sm">
      Approaching shelf life ({batch.hoursRemaining}h remaining)
    </span>
  </div>
)}
```

**Important**: This is a WARNING only. The system does NOT:
- Automatically move inventory to waste
- Block sales of "expired" products
- Remove inventory from availability

The user decides what to do (sell at discount, record waste, etc.).

---

## Phase 7: Reporting & Analytics (Medium Priority)

### 7.1 Production Dashboard

**File**: `src/routes/app/[businessId]/[branchId]/preparation/dashboard.tsx`

**Widgets**:
1. **Today's Production Summary**
   - Total prepared (units)
   - Total sold (units)
   - Remaining stock (units)
   - Value of finished inventory

2. **Production Efficiency**
   - Yield rate: (Actual Output / Target Output) × 100
   - Average production time (if tracked)
   - Cost per unit

3. **Waste Analysis**
   - Waste quantity (today, week, month)
   - Waste value
   - Waste reasons breakdown
   - Waste rate: (Wasted / Produced) × 100

4. **Top Prepared Products**
   - Most frequently prepared
   - Highest volume prepared
   - Highest waste

5. **Production vs Sales**
   - Chart showing daily preparation and sales over time
   - Identify over/under-production patterns

### 7.2 Waste Report

**File**: `src/routes/app/[businessId]/[branchId]/preparation/reports/waste.tsx`

**Purpose**: Detailed analysis of waste

**Metrics**:
- Total waste by period (day, week, month)
- Waste by product
- Waste by reason
- Waste trends over time
- Cost of waste

**Actions**:
- Export waste report (CSV, PDF)
- Filter by date range, product, reason

### 7.3 Inventory Aging Report

**File**: `src/routes/app/[businessId]/[branchId]/preparation/reports/aging.tsx`

**Purpose**: Show age of finished goods inventory

**Display**:
```
Product         | <6h | 6-12h | 12-24h | >24h | Total
----------------|-----|-------|--------|------|------
Fried Chicken   | 30  | 15    | 5      | 0    | 50
Beef Stew       | 10  | 8     | 2      | 1    | 21
Lasagna         | 15  | 0     | 0      | 0    | 15
```

Helps identify:
- Which products have old inventory
- Whether production frequency should be adjusted
- Risk of waste

---

## Phase 8: Advanced Features (Low Priority)

### 8.1 Batch Production Planning

**File**: `src/routes/app/[businessId]/[branchId]/preparation/planning.tsx`

**Purpose**: Help users decide how much to prepare

**Features**:
- Historical sales data analysis
- Suggested production quantity based on:
  - Average daily sales
  - Day of week patterns
  - Seasonal trends
  - Current inventory
- Adjustable forecast parameters

**Algorithm**:
```typescript
function suggestProductionQuantity(variantId: string, date: Date): number {
  // Get sales history for same day of week
  const historicalSales = getSalesHistory(variantId, { dayOfWeek: date.getDay(), weeks: 4 })
  
  // Calculate average
  const avgSales = mean(historicalSales.map(s => s.quantity))
  
  // Add buffer (e.g., 20%)
  const buffer = avgSales * 0.2
  
  // Subtract current finished inventory
  const currentInventory = getFinishedInventory(variantId)
  
  // Suggested quantity
  return Math.max(0, avgSales + buffer - currentInventory)
}
```

### 8.2 Multi-stage Production (Advanced)

**For businesses with complex production processes**:

Add production stages/steps:
```
Stage 1: Marinate (2 hours)
Stage 2: Cook (30 minutes)
Stage 3: Package (15 minutes)
```

Track production progress through stages.

**This is LOW PRIORITY**. Most businesses can use simple "Prepare" flow.

### 8.3 Recipe Costing & Profitability

**File**: `src/routes/app/[businessId]/[branchId]/preparation/profitability.tsx`

**Purpose**: Analyze profit margins for batch-prepared products

**Metrics**:
- Recipe cost (raw materials)
- Production cost per unit
- Selling price
- Gross margin: (Price - Cost) / Price
- Waste cost impact

**Actions**:
- Identify products with low margins
- Suggest price adjustments
- Optimize recipe costs

---

## Implementation Order (For AI Agent)

### Sprint 1: Foundation (Complete First)
1. ✅ Update schema with all required changes:
   - Add `ProductionOrder` and `ProductionOrderItem` models
   - Add `isBatchPrepared` and `productionUsesRecipe` fields to `ProductVariant`
   - Add `InventoryType` enum and fields to `Inventory`
   - **Add `version Int @default(1)` to `Inventory` (CRITICAL for concurrency control)**
   - Update `MovementType` enum
   - Add all required relations
2. ✅ Run migration
3. ✅ Create `production-engine.ts` with core functions (both recipe-based and recipe-free)
4. ✅ Create `finished-goods-engine.ts` for consumption logic with version checking
5. ✅ Create `ConcurrencyError` class
6. ✅ Write unit tests for engines

### Sprint 2: Core Preparation Flow
7. ✅ Create simplified preparation page (`preparation/index.tsx`)
8. ✅ Implement "+ Prepare" dialog (both recipe-based and recipe-free flows)
9. ✅ Create waste recording dialog
10. ✅ Add production history page
11. ✅ Test end-to-end preparation workflow

### Sprint 3: POS Integration (Critical)
12. ✅ Update `create-pos-transaction.ts` to check `isBatchPrepared` flag
13. ✅ Implement `createPOSTransactionWithRetry()` wrapper with exponential backoff
14. ✅ Implement finished goods consumption with version checking in POS
15. ✅ Add proper error handling for out-of-stock batch-prepared products
16. ✅ **Test concurrent POS sales scenario (CRITICAL - real concurrent transactions required)**
17. ✅ Test POS with batch-prepared and non-batch-prepared products
18. ✅ Update low stock detection for finished goods

### Sprint 4: Verification & Polish
19. ✅ Verify natural inventory carryover works across days
20. ✅ Implement shelf life warnings (optional)
21. ✅ Add basic production dashboard
22. ✅ Add waste reporting
23. ✅ Write E2E tests for complete production → sale → waste flow
24. ✅ Update documentation

---

## Rollout Strategy

### Feature Flag
Add system config: `ENABLE_PRODUCTION_MODULE` (default: false)

### Migration Path for Existing Businesses
1. No data migration needed — production is additive
2. Existing products default to `operationMode: PURCHASED`
3. Existing inventory defaults to `inventoryType: RAW_MATERIAL`
4. Businesses can opt-in by:
   - Enabling production module in settings
   - Configuring products as `BATCH_PREPARED`
   - Setting `productionUsesRecipe` flag
5. Make-to-order flow continues unchanged

### New Business Onboarding
- Ask during setup: "Do you prepare products in advance?"
- If yes, show configuration options
- Provide templates for common scenarios (restaurant, bakery, etc.)

### Training & Documentation
- Create user guide: "Batch Preparation vs Make-to-Order"
- Video tutorials for:
  - Setting up batch-prepared products
  - Daily preparation workflow
  - Recording waste
- Best practices guide

---

## Success Criteria

✅ Products can be marked as batch-prepared (`isBatchPrepared = true`)
✅ Batch preparation can work with or without recipes (`productionUsesRecipe` flag)
✅ Recipe-based production consumes raw materials correctly
✅ Recipe-free production only tracks finished quantity
✅ Finished goods tracked in separate inventory (`inventoryType: FINISHED_GOOD`)
✅ POS checks `isBatchPrepared` flag before consuming inventory
✅ Batch-prepared products consume finished goods only (no raw materials)
✅ Batch-prepared products show out-of-stock when finished inventory depleted (no fallback)
✅ Non-batch-prepared products continue using existing flows unchanged
✅ Remaining finished goods automatically carry to next day
✅ NO automatic waste at end of day
✅ Users can explicitly record waste when needed
✅ Waste requires reason selection
✅ FIFO respected for finished goods consumption (internally)
✅ Shelf life warnings shown (when configured) but do not block sales
✅ Simple "+ Prepare" workflow takes <30 seconds
✅ Production dashboard shows prepared/sold/remaining statistics
✅ Backward compatible with all existing flows
✅ System is generic (not food-specific)
✅ All inventory operations use `dbTransaction` for atomicity

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context overflow during implementation | High | Break into 4 sprints with clear checkpoints |
| Breaking existing sales flow | High | Feature flag + operation mode check + comprehensive tests |
| Inventory type confusion | High | Clear enum naming + migration defaults |
| Accidental automatic waste | Critical | NO automatic waste logic — only explicit user action |
| Recipe vs non-recipe complexity | Medium | Single engine handles both with flag check |
| Performance on large production volumes | Medium | Add indexes on status, completedAt, inventoryType fields |
| User confusion about operation modes | Medium | Clear UI labels, tooltips, documentation |
| FIFO complexity with two inventory types | Medium | Filter by inventoryType before FIFO sort |

---

## File Reference (For Agent Context Loading)

**Read these before each sprint**:

Sprint 1:
- `prisma/schema.prisma` (full file for context)
- `src/lib/inventory/inventory-engine.ts` (existing patterns)
- `src/lib/costing/fifo-engine.ts` (FIFO logic)

Sprint 2:
- `src/routes/app/[businessId]/[branchId]/inventory/*` (UI patterns)
- `src/lib/production/production-engine.ts` (own work)
- `src/lib/production/finished-goods-engine.ts` (own work)

Sprint 3:
- `src/lib/queries/create-pos-transaction.ts` (full file)
- `src/lib/notification/notification-engine.ts` (low stock detection)

Sprint 4:
- Previous sprint work
- `src/routes/app/[businessId]/[branchId]/preparation/*` (own work)

---

## Notes for AI Agent

1. **Context Management**: Each sprint is designed to fit in ~50K tokens
2. **Checkpoint After Each Sprint**: Commit code, run tests, verify before next sprint
3. **Use Existing Patterns**: Follow established patterns from inventory/purchase modules
4. **Type Safety**: Use TypeScript strictly, avoid `any`
5. **Testing**: Write tests alongside implementation, not after
6. **Documentation**: Update inline comments for complex logic
7. **Generic Terminology**: Use "preparation" and "batch" language, avoid "cooking" or food-specific terms
8. **Simple First**: Implement simplified workflow before advanced features
9. **No Automatic Waste**: Triple-check no automatic waste logic exists
10. **Operation Mode**: Always check `operationMode` before inventory operations

---

## Related Documents

- #[[file:prisma/schema.prisma]] — Current schema
- #[[file:src/lib/inventory/inventory-engine.ts]] — Inventory patterns to follow
- #[[file:src/lib/queries/create-pos-transaction.ts]] — Critical integration point
- #[[file:src/lib/costing/fifo-engine.ts]] — FIFO logic reference

---

## Acceptance Test Scenarios

### Scenario 1: Recipe-based Batch Preparation
```
Given: Fried Chicken is configured as batch-prepared (isBatchPrepared = true, productionUsesRecipe = true)
And: Recipe requires 0.1kg Chicken, 0.02L Oil per piece
And: Raw materials: Chicken 5kg, Oil 1L
When: User prepares 30 Fried Chicken
Then: Raw materials deducted: Chicken -3kg, Oil -0.6L
And: Finished goods created: Fried Chicken +30 pcs
And: Production order status = COMPLETED
```

### Scenario 2: Recipe-free Batch Preparation
```
Given: Sandwiches is configured as batch-prepared (isBatchPrepared = true, productionUsesRecipe = false)
When: User prepares 50 Sandwiches
Then: NO raw materials deducted
And: Finished goods created: Sandwiches +50 pcs
And: Production order status = COMPLETED
```

### Scenario 3: POS Sale of Batch-Prepared Product
```
Given: Fried Chicken finished inventory = 15 pcs
When: Customer purchases 10 Fried Chicken
Then: Finished inventory deducted: -10 pcs
And: NO raw materials deducted
And: Remaining finished inventory = 5 pcs
```

### Scenario 4: POS Out of Stock for Batch-Prepared Product
```
Given: Fried Chicken finished inventory = 5 pcs
And: Raw material inventory: Chicken 10kg (sufficient for production)
When: Customer purchases 10 Fried Chicken
Then: Transaction fails with "out of stock" error
And: NO raw materials deducted (no fallback)
And: User shown message: "Please prepare more Fried Chicken"
```

### Scenario 5: Natural Carryover
```
Given: Day 1: Prepared 100, Sold 82, Remaining 18
When: Day 2 starts
Then: Opening finished inventory = 18 pcs
When: Prepare 30 more
Then: Total available = 48 pcs
When: Sell 40
Then: Remaining = 8 pcs
And: NO automatic waste recorded
```

### Scenario 6: Explicit Waste Recording
```
Given: Fried Chicken finished inventory = 18 pcs
When: User records waste: 15 pcs, reason "Past shelf life"
Then: Finished inventory deducted: -15 pcs
And: WASTE movement created with reason
And: Remaining finished inventory = 3 pcs
```

### Scenario 7: Shelf Life Warning (No Auto-Waste)
```
Given: Fried Chicken shelfLifeHours = 24
And: Batch produced 23 hours ago, quantity = 10 pcs
When: User views preparation page
Then: Warning shown: "Approaching shelf life (1h remaining)"
And: Inventory remains available for sale
And: NO automatic waste
```

### Scenario 8: Non-Batch-Prepared Product (Existing Flow Unchanged)
```
Given: Coffee is NOT batch-prepared (isBatchPrepared = false)
And: Coffee has recipe components (Coffee Beans)
And: Raw materials: Coffee Beans 2kg
When: Customer purchases 1 Coffee
Then: Existing inventory flow handles it
And: NO production module involvement
And: Existing behavior works unchanged
```

---

**Created**: 2026-08-20
**Updated**: 2026-08-20 (Added critical edge cases handling)
**Status**: Ready for Implementation (Enhanced)
**Estimated Effort**: 4 sprints × 3.5-4.5 hours = 14-18 hours
**Priority**: High (Restaurant operations blocker)

---

## Quick Reference Documents

- **Main Specification**: This document
- **Enhancement Summary**: `production-module-enhancement-summary.md`
- **Edge Cases Guide**: `production-edge-cases.md` ⭐ Critical reference for implementation
- **Related**: `PHASE-1-EXECUTION.md` (existing implementation guide)
