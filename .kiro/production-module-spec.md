# Production Module Specification
## Converting Raw Materials to Finished Products

**Problem Statement**: System currently deducts raw materials only at sale time. For businesses that pre-produce items (e.g., cooking fresh chicken into fried chicken), we need to track:
1. Production events (converting raw → finished)
2. Finished goods inventory separate from raw materials
3. End-of-day unsold product handling

**Use Case**: Restaurant buys fresh chicken, cooks it to fried chicken throughout the day, sells some, and needs to handle unsold portions at day end.

---

## Design Overview

### Core Entities

```
Purchase (Raw) → Production Order → Finished Goods Inventory → Sale
                      ↓
                 Waste (End of Day)
```

### Key Principles
1. **Two-Stage Inventory**: Raw materials and finished goods tracked separately
2. **Production as Transaction**: Formal record of raw→finished conversion
3. **FIFO for Finished Goods**: Oldest prepared items sold/wasted first
4. **Backward Compatible**: Existing recipe-based flow remains for businesses that don't pre-produce

---

## Phase 1: Schema & Data Model (High Priority)

### 1.1 Add ProductionOrder Model

**File**: `prisma/schema.prisma`

**Location**: After `GoodsReceiptItem` model (around line 800)

**Changes**:
```prisma
// ---------------------------------------------------------------------------
// Production Domain — Track conversion of raw materials to finished products
// ---------------------------------------------------------------------------

enum ProductionStatus {
  DRAFT      // Created but not started
  IN_PROGRESS // Materials consumed, production underway
  COMPLETED  // Finished goods added to inventory
  CANCELLED  // Voided before completion
}

// Production Order — formal record of raw material → finished product conversion
model ProductionOrder {
  id            String           @id @default(cuid())
  orderNumber   String           // e.g., "PROD-2024-001"
  status        ProductionStatus @default(DRAFT)
  
  // What are we producing?
  targetVariantId String
  targetVariant   ProductVariant @relation("ProductionTarget", fields: [targetVariantId], references: [id])
  targetQuantity  Float          // How many units to produce
  targetUnitId    String
  targetUnit      Unit           @relation("ProductionTargetUnit", fields: [targetUnitId], references: [id])
  
  // Actual output (may differ from target due to waste/efficiency)
  actualQuantity  Float?
  
  // Production metadata
  startedAt    DateTime?
  completedAt  DateTime?
  producedById String?
  producedBy   User?    @relation("ProductionProducer", fields: [producedById], references: [id])
  notes        String?
  
  // Cost tracking
  totalCost    Int      @default(0) @db.Integer // Total cost of materials used (in cents)
  
  // Relations
  items              ProductionOrderItem[]
  inventoryMovements InventoryMovement[]
  
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  branchId   String
  branch     Branch   @relation(fields: [branchId], references: [id])
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([orderNumber, businessId])
  @@index([businessId, branchId, status])
  @@index([targetVariantId])
  @@map("production_orders")
}

// Line items showing which raw materials were consumed for this production
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

### 1.2 Update Related Models

**Add relations to existing models**:

```prisma
// In Business model, add:
productionOrders     ProductionOrder[]
productionOrderItems ProductionOrderItem[]

// In Branch model, add:
productionOrders ProductionOrder[]

// In ProductVariant model, add:
productionTargets  ProductionOrder[]     @relation("ProductionTarget")
productionMaterials ProductionOrderItem[] @relation("ProductionMaterial")

// In Unit model, add:
productionTargetUnits   ProductionOrder[]     @relation("ProductionTargetUnit")
productionMaterialUnits ProductionOrderItem[] @relation("ProductionMaterialUnit")

// In User model, add:
productionOrders ProductionOrder[] @relation("ProductionProducer")

// In InventoryMovement model, update:
productionOrderId String?
productionOrder   ProductionOrder? @relation(fields: [productionOrderId], references: [id])
```

### 1.3 Update MovementType Enum

**Add new movement type**:
```prisma
enum MovementType {
  IN
  OUT
  ADJUST
  WASTE
  EXTERNAL_TRANSFER
  INTERNAL_TRANSFER
  PRODUCTION_IN   // Finished goods added after production
  PRODUCTION_OUT  // Raw materials consumed for production
}
```

---

## Phase 2: Core Production Engine (High Priority)

### 2.1 Create Production Engine

**File**: `src/lib/production/production-engine.ts`

**Purpose**: Central logic for production operations

**Key Functions**:
```typescript
export const ProductionEngine = {
  // Create a production order from a recipe
  createProductionOrder(params: CreateProductionOrderParams): ProductionOrder
  
  // Start production: consume raw materials from inventory
  startProduction(orderId: string, ctx: ProductionContext): Result<ProductionOrder>
  
  // Complete production: add finished goods to inventory
  completeProduction(orderId: string, actualQty: number, ctx: ProductionContext): Result<ProductionOrder>
  
  // Cancel production: return materials to inventory if not started
  cancelProduction(orderId: string, reason: string, ctx: ProductionContext): Result<ProductionOrder>
  
  // Calculate material requirements from ProductComponent recipe
  calculateMaterialRequirements(variantId: string, quantity: number): MaterialRequirement[]
  
  // Validate sufficient raw materials exist before production
  validateMaterialAvailability(requirements: MaterialRequirement[], branchId: string): ValidationResult
}
```

**Design Notes**:
- Use FIFO for consuming raw materials (same as sales)
- Use `dbTransaction` for atomicity
- Create `InventoryMovement` records for audit trail
- Update `Inventory` quantities for both raw materials (decrease) and finished goods (increase)

---

## Phase 3: Production UI Flow (Medium Priority)

### 3.1 Production Order List Page

**File**: `src/routes/app/[businessId]/[branchId]/production/index.tsx`

**Features**:
- List all production orders with status filtering
- Quick actions: Start, Complete, Cancel
- Search by order number or product name
- Date range filtering

### 3.2 Create Production Order Page

**File**: `src/routes/app/[businessId]/[branchId]/production/create.tsx`

**Features**:
- Select finished product from dropdown
- Enter quantity to produce
- Auto-populate material requirements from recipe
- Show current stock levels for validation
- Preview total cost

### 3.3 Production Order Detail Page

**File**: `src/routes/app/[businessId]/[branchId]/production/[orderId]/index.tsx`

**Features**:
- View order details and status
- Material consumption breakdown
- Timeline of status changes
- Actions: Start, Complete, Cancel (status-dependent)

---

## Phase 4: Integration with Existing Systems (Medium Priority)

### 4.1 Update POS Transaction Logic

**File**: `src/lib/queries/create-pos-transaction.ts`

**Changes**:
- Add check: Does variant have finished goods inventory?
  - YES → Deduct from finished goods (FIFO)
  - NO → Fall back to existing recipe-based deduction
- This maintains backward compatibility

**Logic**:
```typescript
// Check if variant has "type: PHYSICAL_GOOD" and finished goods inventory
const hasFinishedInventory = await checkFinishedInventory(variantId, branchId)

if (hasFinishedInventory) {
  // New path: consume finished goods
  await consumeFinishedGoods(variantId, quantity, transaction.id)
} else {
  // Existing path: consume raw materials via recipe
  await consumeRawMaterials(variantId, quantity, transaction.id)
}
```

### 4.2 Enhance Low Stock Detection

**File**: `src/lib/notification/notification-engine.ts`

**Changes**:
- Check finished goods inventory for products with production capability
- Create `PRODUCTION_TASK` instead of `SHELF_REFILL` for produced items
- Maintain existing logic for raw materials

---

## Phase 5: End-of-Day Waste Handling (Low Priority)

### 5.1 Batch Waste Operation

**File**: `src/lib/production/waste-engine.ts`

**Features**:
- Select finished goods to dispose
- Bulk waste operation with reason
- Generate waste report
- Create `WASTE` movement records

### 5.2 Waste Report UI

**File**: `src/routes/app/[businessId]/[branchId]/production/waste.tsx`

**Features**:
- List all finished goods in stock
- Checkboxes for selection
- Expiry date highlighting
- Batch waste action with confirmation
- Generate waste summary report

---

## Phase 6: Analytics & Reporting (Low Priority)

### 6.1 Production Efficiency Metrics

**Metrics**:
- Yield rate: (Actual Output / Target Output) × 100
- Waste rate: (Wasted Quantity / Produced Quantity) × 100
- Production cost per unit
- Average production time

### 6.2 Production Dashboard

**File**: `src/routes/app/[businessId]/[branchId]/production/analytics.tsx`

**Widgets**:
- Today's production summary
- Top produced items
- Waste trends chart
- Production vs Sales comparison

---

## Implementation Order (For AI Agent)

### Sprint 1: Foundation (Complete First)
1. ✅ Update schema with ProductionOrder models
2. ✅ Run migration
3. ✅ Create production-engine.ts with core functions
4. ✅ Write unit tests for production engine

### Sprint 2: Basic Production Flow
5. ✅ Create production order list page
6. ✅ Create production order creation page
7. ✅ Implement start/complete production actions
8. ✅ Add production order detail page

### Sprint 3: Integration
9. ✅ Update POS transaction to support finished goods
10. ✅ Update low stock detection for produced items
11. ✅ Add production to operational tasks system

### Sprint 4: Waste & Polish
12. ✅ Implement waste handling UI
13. ✅ Add production analytics
14. ✅ Write E2E tests for production flow

---

## Rollout Strategy

### Feature Flag
Add system config: `ENABLE_PRODUCTION_MODULE` (default: false)

### Migration Path
1. Existing businesses continue with recipe-based flow
2. New businesses can opt-in during onboarding
3. Admin can enable for specific branches

### Data Consistency
- No data migration needed for existing businesses
- ProductComponent recipes remain the source of truth
- Production orders are additive, not replacement

---

## Success Criteria

✅ Can create production order from recipe
✅ Raw materials consumed at production start, not at sale
✅ Finished goods tracked in separate inventory
✅ POS automatically uses finished goods when available
✅ Can mark unsold items as waste at end of day
✅ Production costs accurately tracked
✅ Backward compatible with non-production businesses
✅ FIFO respected for both raw and finished goods

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context overflow during implementation | High | Break into 4 sprints with clear checkpoints |
| Breaking existing sales flow | High | Feature flag + dual-path logic with fallback |
| Inventory consistency issues | High | Use dbTransaction for all operations |
| Complex migration for existing users | Medium | Make opt-in, no forced migration |
| Performance on large production volumes | Medium | Add indexes on status and date fields |

---

## File Reference (For Agent Context Loading)

**Read these before each sprint**:

Sprint 1:
- `prisma/schema.prisma` (lines 1-900)
- `src/lib/costing/fifo-engine.ts`
- `src/lib/inventory/inventory-engine.ts`

Sprint 2:
- `src/routes/app/[businessId]/[branchId]/inventory/*` (UI patterns)
- `src/lib/production/production-engine.ts` (own work)

Sprint 3:
- `src/lib/queries/create-pos-transaction.ts` (lines 400-500)
- `src/lib/notification/notification-engine.ts`

Sprint 4:
- `src/lib/inventory/inventory-engine.ts` (WASTE_DISPOSAL logic)
- Previous sprint work

---

## Notes for AI Agent

1. **Context Management**: Each sprint is designed to fit in ~40K tokens
2. **Checkpoint After Each Sprint**: Commit code, run tests, verify before next sprint
3. **Use Existing Patterns**: Follow established patterns from inventory/purchase modules
4. **Type Safety**: Use TypeScript strictly, avoid `any`
5. **Testing**: Write tests alongside implementation, not after
6. **Documentation**: Update inline comments for complex logic

---

## Related Documents

- #[[file:prisma/schema.prisma]] — Current schema
- #[[file:src/lib/inventory/inventory-engine.ts]] — Inventory patterns to follow
- #[[file:src/lib/queries/create-pos-transaction.ts]] — Integration point
- #[[file:.kiro/PHASE-1-EXECUTION.md]] — Existing implementation guide

---

**Created**: 2026-08-18
**Status**: Ready for Implementation
**Estimated Effort**: 4 sprints × 2-3 hours = 8-12 hours
**Priority**: High (Restaurant operations blocker)
