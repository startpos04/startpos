# Production Module — Step-by-Step Implementation Guide

**Purpose**: Guide for implementing the Production Module across multiple fresh AI sessions.

**Key Documents**:
- Main spec: `production-module-spec.md`
- Edge cases: `production-edge-cases.md`
- Concurrency: `CONCURRENCY-CONTROL-REQUIREMENT.md`
- Summary: `production-module-enhancement-summary.md`

---

## Pre-Implementation Checklist

Before starting any session:

- [ ] All specification documents are in `.kiro/` folder
- [ ] Current branch is clean (no uncommitted changes)
- [ ] Development database is accessible
- [ ] Prisma client is up to date

---

## Session 1: Schema Design & Migration

**Goal**: Create all database schema changes and migration file.

**Estimated Time**: 1-2 hours

### Prompt for New Session

```
I'm implementing the Production Module for a batch preparation system.

First, read these specification documents:
- #production-module-spec.md (focus on Phase 1)
- #CONCURRENCY-CONTROL-REQUIREMENT.md

Then show me the Prisma schema changes for Sprint 1:

1. ProductionOrder and ProductionOrderItem models
2. ProductVariant updates (isBatchPrepared, productionUsesRecipe, shelfLifeHours)
3. Inventory updates (inventoryType, productionOrderId, producedAt, version)
4. New enums: InventoryType
5. Update MovementType enum (add PRODUCTION_IN, PRODUCTION_OUT)
6. All required relations

CRITICAL: Include the version column in Inventory for optimistic locking.

After showing the schema, wait for my review before creating the migration.
```

### What to Verify

- [ ] `version Int @default(1)` is in Inventory model
- [ ] `isBatchPrepared Boolean @default(false)` in ProductVariant
- [ ] `productionUsesRecipe Boolean @default(true)` in ProductVariant
- [ ] `inventoryType InventoryType @default(RAW_MATERIAL)` in Inventory
- [ ] `producedAt DateTime?` in Inventory
- [ ] All relations are bidirectional
- [ ] Indexes on: `[businessId, branchId, status]` for ProductionOrder
- [ ] Index on `completedAt` for ProductionOrder

### After Review

```
Looks good! Now create the migration file.
```

### Verification Commands

```bash
# Check the migration was created
ls prisma/migrations

# Apply the migration (development)
npm run db:migrate

# Generate Prisma client
npm run db:generate
```

### Commit Point

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(production): add schema for batch preparation module

- Add ProductionOrder and ProductionOrderItem models
- Add batch preparation flags to ProductVariant
- Add inventory type distinction and version column for concurrency
- Add production-related enums and relations

Ref: production-module-spec.md Sprint 1"
```

---

## Session 2: Production Engine (Recipe-Based)

**Goal**: Create the core production engine with recipe-based production.

**Estimated Time**: 2-3 hours

### Prompt for New Session

```
I'm continuing the Production Module implementation. Session 1 completed 
the schema migration.

Read:
- #production-module-spec.md (Phase 2.1)
- #production-edge-cases.md (§1 for cost allocation, §4 for unit conversion)

Create src/lib/production/production-engine.ts with these functions:

1. createProductionOrder() - both recipe and recipe-free modes
2. startProduction() - consume raw materials using FIFO
3. completeProduction() - create finished goods with cost allocation
4. calculateMaterialRequirements() - with unit conversion
5. validateMaterialAvailability()

CRITICAL: 
- Cost allocation: totalCost / actualQuantity
- Support recipe-free: usesRecipe flag
- Use UnitEngine.convert() for material requirements
```

### What to Verify

- [ ] Cost per unit calculation: `Math.round(totalCost / actualQuantity)`
- [ ] Recipe-free mode: `costPerUnit = 0`
- [ ] Unit conversion used for all material calculations
- [ ] FIFO consumption for raw materials
- [ ] Status transitions: DRAFT → IN_PROGRESS → COMPLETED
- [ ] Creates PRODUCTION_OUT movements for materials
- [ ] Creates PRODUCTION_IN movements for finished goods

### Test File Prompt

```
Now create __tests__/unit/lib/production/production-engine.test.ts

Test cases:
1. Recipe-based production with correct cost allocation
2. Recipe-free production (no material consumption, cost = 0)
3. Actual output < target (variance absorbed into cost)
4. Actual output = 0 (total loss scenario)
5. Unit conversion (recipe in kg, inventory in g)
6. Insufficient raw materials (should throw error)
```

### Verification Commands

```bash
npm run test production-engine.test.ts
```

### Commit Point

```bash
git add src/lib/production/production-engine.ts __tests__/
git commit -m "feat(production): implement production engine with recipe support

- Support both recipe-based and recipe-free production
- Cost allocation with variance handling
- Unit conversion for material requirements
- FIFO consumption of raw materials

Ref: production-module-spec.md Phase 2.1"
```

---

## Session 3: Finished Goods Engine with Concurrency Control

**Goal**: Create finished goods consumption with optimistic locking.

**Estimated Time**: 2-3 hours

### Prompt for New Session

```
Continuing Production Module. Sessions 1-2 completed schema and 
production engine.

Read:
- #production-module-spec.md (Phase 2.2)
- #CONCURRENCY-CONTROL-REQUIREMENT.md (complete)
- #production-edge-cases.md (§3 for concurrency)

Create src/lib/production/finished-goods-engine.ts with:

1. ConcurrencyError class
2. consumeFinishedGoods() - with version checking
3. checkAvailability()
4. getBatchesApproachingExpiry()

CRITICAL: Implement optimistic locking with version column.
The version check MUST throw ConcurrencyError on mismatch.
```

### What to Verify

- [ ] `ConcurrencyError extends Error`
- [ ] Version check: `if (draft.version !== expectedVersion) throw ConcurrencyError`
- [ ] Version increment: `draft.version += 1`
- [ ] FIFO by `producedAt` timestamp
- [ ] Filters `inventoryType === 'FINISHED_GOOD'`
- [ ] Returns consumed batches with cost info

### Test File Prompt

```
Create __tests__/unit/lib/production/finished-goods-engine.test.ts

Test cases:
1. Successful FIFO consumption of finished goods
2. Version check prevents concurrent modifications
3. ConcurrencyError thrown on version mismatch
4. Out of stock error when insufficient finished goods
5. Multi-batch consumption (oldest first)
6. Shelf life warning detection
```

### Verification Commands

```bash
npm run test finished-goods-engine.test.ts
```

### Commit Point

```bash
git add src/lib/production/finished-goods-engine.ts __tests__/
git commit -m "feat(production): implement finished goods engine with concurrency control

- Optimistic locking with version column
- FIFO consumption of finished goods
- ConcurrencyError for version conflicts
- Shelf life warning detection

Ref: CONCURRENCY-CONTROL-REQUIREMENT.md"
```

---

## Session 4: POS Integration with Retry Logic

**Goal**: Integrate finished goods consumption into POS with concurrency handling.

**Estimated Time**: 2-3 hours

### Prompt for New Session

```
Continuing Production Module. Sessions 1-3 completed engines.

Read:
- #production-module-spec.md (Phase 4.1)
- #CONCURRENCY-CONTROL-REQUIREMENT.md (retry logic)
- #production-edge-cases.md (§3 for retry, §5 for multi-item)

Update src/lib/queries/create-pos-transaction.ts:

1. Add createPOSTransactionWithRetry() wrapper
2. Check isBatchPrepared flag
3. Consume finished goods with version checking
4. Fail entire transaction if any item out of stock
5. Retry only on ConcurrencyError (max 3 attempts)

CRITICAL: Multi-item transaction must fail atomically if ANY item 
is out of stock. No partial fulfillment.
```

### What to Verify

- [ ] Retry wrapper with exponential backoff: `100 * Math.pow(2, attempt - 1)`
- [ ] Only retries `ConcurrencyError`, not `OutOfStockError`
- [ ] Pre-validates ALL items before any deduction
- [ ] Batch-prepared check: `if (variant.isBatchPrepared)`
- [ ] Throws out-of-stock error (no fallback to raw materials)
- [ ] Uses `FinishedGoodsEngine.consumeFinishedGoods()`

### Test File Prompt

```
Create __tests__/integration/production/pos-integration.integration.test.ts

Test cases:
1. Successful sale of batch-prepared product
2. Out of stock error when finished goods depleted
3. No fallback to raw materials for batch-prepared products
4. Concurrent sales prevent double-sell (REAL concurrency)
5. Retry succeeds after version conflict
6. Multi-item cart fails atomically when one item out of stock
7. Non-batch-prepared products continue working normally
```

### Verification Commands

```bash
npm run test pos-integration.integration.test.ts

# CRITICAL: Verify concurrent test uses real concurrency
# Should use Promise.all(), not sequential awaits
```

### Commit Point

```bash
git add src/lib/queries/create-pos-transaction.ts __tests__/
git commit -m "feat(production): integrate finished goods into POS with concurrency control

- Retry wrapper with exponential backoff
- Optimistic locking prevents double-sales
- Multi-item atomic failure
- Batch-prepared flag check

Ref: production-module-spec.md Phase 4"
```

---

## Session 5: Preparation UI (Simplified Flow)

**Goal**: Create the user-facing preparation interface.

**Estimated Time**: 3-4 hours

### Prompt for New Session

```
Continuing Production Module. Core engines and POS integration complete.

Read:
- #production-module-spec.md (Phase 3)
- #production-module-enhancement-summary.md (UX section)

Create the preparation UI:

1. src/routes/app/[businessId]/[branchId]/preparation/index.tsx
   - Dashboard view: Prepared Today / Sold Today / Remaining
   - List of batch-prepared products with status
   - "+ Prepare" button

2. Prepare dialog component
   - Product selection
   - Quantity input
   - Show material requirements (if recipe-based)
   - Simple one-step flow (not draft→start→complete)

3. Waste recording dialog
   - Product selection
   - Quantity
   - Reason dropdown
   - Confirmation
```

### What to Verify

- [ ] Dashboard shows summary statistics
- [ ] "+ Prepare" creates COMPLETED production order immediately
- [ ] Recipe-based shows material availability check
- [ ] Recipe-free just records quantity
- [ ] Waste requires explicit user action (not automatic)
- [ ] Shelf life warnings shown (if configured)
- [ ] Uses existing design system components

### Verification Commands

```bash
npm run dev

# Navigate to /app/{businessId}/{branchId}/preparation
# Test prepare flow
# Test waste recording
```

### Commit Point

```bash
git add src/routes/app/.../preparation/
git commit -m "feat(production): add preparation UI with simplified workflow

- Dashboard with daily statistics
- One-step prepare flow
- Explicit waste recording
- Shelf life warnings

Ref: production-module-spec.md Phase 3"
```

---

## Session 6: Edge Cases & Polish

**Goal**: Handle all edge cases and add production history.

**Estimated Time**: 2-3 hours

### Prompt for New Session

```
Finalizing Production Module. Core functionality complete.

Read:
- #production-edge-cases.md (all sections)
- #production-module-spec.md (Phase 3.4, Phase 6, Phase 7)

Implement:

1. Waste engine (src/lib/production/waste-engine.ts)
   - recordWaste() with reason tracking
   - getWasteSummary()

2. Production history page
   - List all production orders
   - Filter by date, product, status
   - Material consumption breakdown

3. Low stock detection for finished goods
   - Update notification-engine.ts
   - Create PRODUCTION_TASK instead of SHELF_REFILL

4. Basic production dashboard
   - Daily metrics
   - Waste analysis
   - Yield rate calculation
```

### What to Verify

- [ ] Waste movements use `MovementType.WASTE`
- [ ] Waste requires explicit user action
- [ ] History shows both recipe-based and recipe-free
- [ ] Low stock checks `inventoryType === 'FINISHED_GOOD'`
- [ ] Dashboard calculates yield rate: `(actual / target) * 100`

### Commit Point

```bash
git add src/lib/production/ src/routes/
git commit -m "feat(production): add waste tracking and production analytics

- Explicit waste recording with reasons
- Production history and filtering
- Low stock detection for finished goods
- Basic production dashboard

Ref: production-module-spec.md Phase 6-7"
```

---

## Session 7: Testing & Documentation

**Goal**: Comprehensive testing and documentation.

**Estimated Time**: 2-3 hours

### Prompt for New Session

```
Final session for Production Module. All features implemented.

Read:
- #production-module-spec.md (Acceptance Test Scenarios)
- #production-edge-cases.md (all test cases)

Create E2E tests covering:

1. Complete production workflow (recipe-based)
2. Complete production workflow (recipe-free)
3. Natural inventory carryover across days
4. Concurrent sales with real concurrency
5. Multi-item cart with out-of-stock
6. Waste recording
7. Unit conversion scenarios
8. Yield variance handling

Then update documentation:
- Add JSDoc comments to engine functions
- Update README if needed
- Add production module section to docs
```

### Test Files to Create

- `__tests__/e2e/production/complete-workflow.e2e.test.ts`
- `__tests__/e2e/production/concurrent-sales.e2e.test.ts`
- `__tests__/e2e/production/edge-cases.e2e.test.ts`

### Verification Commands

```bash
# Run all production tests
npm run test -- production

# Run E2E tests
npm run test:e2e -- production

# Check test coverage
npm run test:coverage
```

### Final Commit

```bash
git add __tests__/ docs/
git commit -m "test(production): add comprehensive test suite and documentation

- E2E tests for complete workflows
- Concurrent sales testing with real concurrency
- Edge case coverage
- Updated documentation

Ref: production-module-spec.md Acceptance Criteria"
```

---

## Verification Checklist

After all sessions complete, verify:

### Schema
- [ ] All models exist in Prisma schema
- [ ] Migration applied successfully
- [ ] Version column exists in Inventory
- [ ] All relations are working

### Core Engines
- [ ] Production engine handles recipe-based and recipe-free
- [ ] Cost allocation formula correct
- [ ] Unit conversion working
- [ ] Finished goods engine has version checking
- [ ] ConcurrencyError class exists

### POS Integration
- [ ] Batch-prepared products consume finished goods
- [ ] Out-of-stock error shown (no fallback)
- [ ] Retry logic works for concurrency
- [ ] Multi-item transactions fail atomically

### UI
- [ ] Preparation page shows statistics
- [ ] Prepare flow is simple (one step)
- [ ] Waste recording requires explicit action
- [ ] Shelf life warnings shown

### Edge Cases
- [ ] Yield variance handled (cost absorbed)
- [ ] Unit conversion working (kg ↔ g)
- [ ] Concurrent sales prevented
- [ ] Multi-item failures atomic
- [ ] Natural carryover works

### Tests
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Concurrent sales test uses real concurrency
- [ ] Coverage > 80%

---

## Troubleshooting

### If a Session Loses Context

Start the next session with:
```
I'm implementing the Production Module for a POS system. 
Previous session completed [X]. I need to continue with [Y].

Please read:
- #production-module-spec.md
- #[relevant-doc].md

Then [specific task].
```

### If Tests Fail

```
I'm debugging failing tests for the Production Module.
The test [test name] is failing with [error].

Read #production-edge-cases.md section [X] for the expected behavior.

Help me fix the implementation.
```

### If Concurrency Test Fails

```
The concurrent sales test is failing. It should prevent double-sales.

Read #CONCURRENCY-CONTROL-REQUIREMENT.md for the optimistic locking 
implementation.

Check:
1. Is version column being checked?
2. Is ConcurrencyError being thrown?
3. Is the test using real concurrent transactions (Promise.all)?
```

---

## Session Template

Use this template for each new session:

```
I'm implementing the Production Module, Session [N]: [Goal].

Previous sessions completed:
- Session 1: ✓ Schema migration
- Session 2: ✓ Production engine
- Session N-1: ✓ [previous work]

Read:
- #production-module-spec.md ([relevant phase])
- #[other-relevant-doc].md

Task: [specific task from this guide]

CRITICAL: [any critical requirements for this session]
```

---

## Final Notes

- Each session should be 1-3 hours of focused work
- Always commit after each session
- Test before moving to next session
- Keep commits focused and well-described
- Reference the spec documents in commit messages

**Total Estimated Time**: 14-20 hours across 7 sessions

**When Complete**: The Production Module will be fully functional with all edge cases handled and comprehensive test coverage.

---

**Created**: 2026-08-20  
**Status**: Ready for Implementation  
**Next**: Start with Session 1 in a fresh AI session
