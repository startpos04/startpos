# AI Agent Quick Start Guide - Transaction Snapshots

## 🎯 Your Mission

Implement transaction snapshots so historical data remains accurate when master data changes.

## 📖 Read These Files IN ORDER

### 1. Start Here (5 min read)
**File**: `SNAPSHOT-EXECUTION-INDEX.md`

This gives you:
- Overview of all 3 phases
- Progress tracking checklist
- Troubleshooting guide
- Success criteria

### 2. Then Execute Phase 1 (4 hours)
**File**: `PHASE-1-EXECUTION.md`

This phase adds product/variant/category snapshots to OrderItem.

**You will:**
1. Add 9 columns to Prisma schema
2. Run migration
3. Backfill existing data
4. Update POS creation code
5. Update reports to use snapshots
6. Update receipts
7. Test and monitor

**Everything you need is in that ONE file.**

### 3. Then Execute Phase 2 (2 hours)
**File**: `PHASE-2-EXECUTION.md`

This phase adds unit and tax snapshots.

**Builds on Phase 1 patterns** - same structure, different fields.

### 4. Then Execute Phase 3 (3 hours)
**File**: `PHASE-3-EXECUTION.md`

This phase adds business/branch/cashier snapshots to Transaction.

**Most complex** - involves multiple table lookups.

## 🚨 Critical Rules

### DO:
✅ Read the entire phase file before starting
✅ Follow steps sequentially
✅ Run ALL validation steps
✅ Check coverage at the end (must be 100%)
✅ Document any deviations

### DON'T:
❌ Skip validation steps
❌ Jump between phases
❌ Modify code without reading context first
❌ Assume patterns without checking
❌ Mark complete without 100% coverage

## 🔍 How Each Phase File Is Structured

```
Phase N: [Name] - AI Agent Execution Plan
├── Context for AI Agent ← READ THIS FIRST
├── Step 1: Schema Migration
│   ├── Objective
│   ├── Files to modify
│   ├── Exact changes
│   ├── Commands to run
│   └── Validation
├── Step 2: Backfill Script
│   ├── Objective
│   ├── File to create
│   ├── Complete code
│   ├── Commands to run
│   └── Validation
├── Step 3-7: Similar structure
└── Completion Checklist
```

**Each step:**
1. Tells you what to do
2. Shows you exact code
3. Gives you commands to run
4. Tells you how to validate

## 🎯 Success Indicators

### After Each Step
- [ ] Validation passes
- [ ] No errors in console
- [ ] Changes visible in database

### After Each Phase
- [ ] All steps completed
- [ ] Coverage at 100%
- [ ] Tests passing
- [ ] Can create new transaction with snapshots

### After All Phases
- [ ] 27 snapshot fields added
- [ ] All historical data has snapshots
- [ ] New transactions capture all snapshots
- [ ] Reports use snapshots correctly
- [ ] Receipts display snapshots

## 🔧 If You Get Stuck

### Step Failed?
1. Read error message carefully
2. Check "Troubleshooting Guide" in SNAPSHOT-EXECUTION-INDEX.md
3. Look for similar patterns in the file
4. Document the issue and ask human

### Can't Find Code?
- Use the grep commands provided
- Search for similar patterns
- Check file paths are correct

### Validation Failed?
- Re-read the step instructions
- Check if you skipped something
- Look at the "Validation" section details

### Coverage Not 100%?
- Re-run backfill script
- Check error logs in backfill output
- Verify migration ran successfully

## 📊 Progress Tracking Template

Copy this to track your work:

```
PHASE 1: OrderItem Core Snapshots
Started: [DATE/TIME]
├── [✓] Step 1: Schema Migration - [TIME]
├── [✓] Step 2: Backfill Script - [TIME]
├── [✓] Step 3: Update POS Creation - [TIME]
├── [✓] Step 4: Update Reports - [TIME]
├── [✓] Step 5: Update Receipts - [TIME]
├── [✓] Step 6: Testing - [TIME]
├── [✓] Step 7: Monitoring - [TIME]
└── [✓] Coverage: 100% - [TIME]
Completed: [DATE/TIME]
Total: [HOURS]

Issues encountered:
- [NONE or list issues]

PHASE 2: Unit & Tax Snapshots
[Same format]

PHASE 3: Business/Branch Snapshots
[Same format]
```

## 🎓 Learning Points

### Prisma Patterns You'll Use

```typescript
// Adding nullable columns
snapshotProductName String?

// Backfilling in batches
const items = await prisma.table.findMany({
  where: { snapshotField: null },
  take: BATCH_SIZE
})

// Using snapshots with fallback
const name = item.snapshotName || item.relation.name

// Checking coverage
const coverage = await prisma.table.count({
  where: { snapshotField: { not: null } }
})
```

### Code Patterns You'll See

**1. Snapshot Capture Pattern:**
```typescript
// Fetch related data
const variant = await prisma.productVariant.findUnique({
  where: { id: item.variantId },
  include: { product: { include: { category: true } } }
})

// Capture snapshots
snapshotProductName: variant.product.name,
snapshotVariantName: variant.name,
snapshotCategoryName: variant.product.category.name
```

**2. Snapshot Usage Pattern:**
```typescript
// Use snapshot with fallback
const productName = item.snapshotProductName || item.variant.product.name
```

**3. Backfill Pattern:**
```typescript
// Batch processing loop
while (hasMore) {
  const items = await prisma.table.findMany({
    where: { snapshotField: null },
    take: BATCH_SIZE
  })
  
  if (items.length === 0) {
    hasMore = false
    break
  }
  
  // Update items...
  processedCount += items.length
}
```

## 🚀 Ready to Start?

1. Open `SNAPSHOT-EXECUTION-INDEX.md`
2. Read the overview (5 min)
3. Open `PHASE-1-EXECUTION.md`
4. Read the context section
5. Start with Step 1

## 📞 When to Ask Human

- Before running backfill in production
- If a phase fails completely
- If coverage is stuck below 100%
- After each phase completion (for review)
- Before final deployment

## 🎉 What Success Looks Like

After all phases complete:

```bash
$ npx tsx scripts/check-phase1-coverage.ts
📊 Phase 1 Snapshot Coverage Report
=====================================
OrderItem: 5000/5000 (100.00%)
OrderItemAddon: 1200/1200 (100.00%)
✅ Phase 1 coverage is 100%!

$ npx tsx scripts/check-phase2-coverage.ts
📊 Phase 2 Snapshot Coverage Report
=====================================
OrderItem: 5000/5000 (100.00%)
OrderItemAddon: 1200/1200 (100.00%)
✅ Phase 2 coverage is 100%!

$ npx tsx scripts/check-phase3-coverage.ts
📊 Phase 3 Snapshot Coverage Report
=====================================
Transactions: 5000/5000 (100.00%)
✅ Phase 3 coverage is 100%!
```

**Human verification:**
- Renames product → old reports show old name ✅
- Changes tax category → old reports unchanged ✅
- Renames business → receipt reprints show old name ✅

**You're done!** 🎉

## 📚 File Reference

All files you need are in `.kiro/`:

- `AI-AGENT-QUICK-START.md` ← YOU ARE HERE
- `SNAPSHOT-EXECUTION-INDEX.md` ← Read next
- `PHASE-1-EXECUTION.md` ← Then execute
- `PHASE-2-EXECUTION.md`
- `PHASE-3-EXECUTION.md`
- `snapshot-roadmap.md` ← Visual timeline
- `snapshot-fields-summary.md` ← Quick reference

**Estimated total time: 9 hours across 3 phases**

Good luck! 🚀
