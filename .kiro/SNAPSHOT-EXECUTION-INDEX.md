# Transaction Snapshot Implementation - AI Agent Execution Index

## 🎯 Mission

Implement transaction snapshots in 3 phases to preserve historical data accuracy when master data changes. Each phase is independent, testable, and deployable.

---

## ⚠️ CRITICAL PATCHES - READ FIRST

**✅ ALL HUMAN DECISIONS COMPLETE - Ready to Execute**

### Required Reading Order:
1. ✅ **DECISIONS-COMPLETE.md** - Summary of all resolved decisions
2. **PHASE-1-AND-3-PATCH.md** - Critical corrections for Phase 1 and Phase 3
3. **PHASE-2-PATCH-INSTRUCTIONS.md** - Conversion factor snapshot gap (if available)
4. **PATCH-APPLICATION-CHECKLIST.md** - Quick reference for applying all patches

### Decision Status:
- ✅ **Decision 1 RESOLVED**: Remove `snapshotVATRate` (use TransactionTaxLine)
- ✅ **Decision 2 RESOLVED**: Refund inherits original snapshots, except cashier
- ⏸️ **Decision 3 PENDING**: Phase 2 patch location (non-blocking for Phase 1 & 3)

### What's in the patches:
- **Phase 1 Fixes**: Type safety (ResourceType enum), test fixture gaps
- **Phase 3 Fixes**: 2 fields removed (snapshotVATRate, snapshotPriceConfig), performance optimization, scope handling, refund behavior
- **Phase 3 Updated**: 9 fields instead of 11 (simpler, better)

**⚠️ DO NOT SKIP: These patches fix critical design issues identified by Claude review.**

---

## 📋 Execution Files

### Phase 1: OrderItem Core Snapshots (4 hours)
**File**: `PHASE-1-EXECUTION.md`
**Patch**: Apply fixes A1-A2 from `PHASE-1-AND-3-PATCH.md` FIRST

**What**: Snapshot product names, variant names, categories, SKUs
**Impact**: Receipts & sales reports show accurate historical product data
**Tables**: OrderItem (6 fields), OrderItemAddon (3 fields)
**Total**: 9 fields

**Steps**:
1. Schema migration - Add 9 nullable columns
2. Backfill script - Populate existing records
3. Update POS creation - Capture snapshots on new transactions
4. Update reports - Use snapshots with fallback
5. Update receipts - Display snapshot data
6. Testing - Verify product renames don't affect history
7. Monitoring - Check 100% coverage

### Phase 2: Unit & Tax Snapshots (2 hours)
**File**: `PHASE-2-EXECUTION.md`
**Patch**: Apply fixes from `PHASE-2-PATCH-INSTRUCTIONS.md` FIRST

**What**: Snapshot unit details and tax categories
**Impact**: Tax compliance & unit conversions remain accurate
**Tables**: OrderItem (4 fields), OrderItemAddon (3 fields)
**Total**: 7 fields

**Steps**:
1. Schema migration - Add 7 fields (4 to OrderItem, 3 to OrderItemAddon)
2. Backfill script - Populate Phase 2 fields
3. Update POS creation - Add Phase 2 snapshot capture
4. Update tax reports - Use snapshotTaxCategory
5. Update receipts - Display unit abbreviations
6. Testing - Verify tax changes don't affect history
7. Monitoring - Check Phase 2 coverage

### Phase 3: Business/Branch Snapshots (3 hours)
**File**: `PHASE-3-EXECUTION.md`
**Patch**: Apply fixes B1-B7 from `PHASE-1-AND-3-PATCH.md` FIRST

**What**: Snapshot business, branch, cashier, VAT config
**Impact**: Receipt reprints & BIR audit trail complete
**Tables**: Transaction (11 fields)
**Total**: 11 fields

**Steps**:
1. Schema migration - Add 11 nullable columns to Transaction
2. Backfill script - Complex lookups (Business, Branch, SystemConfig, ComplianceRegistry)
3. Update POS creation - Capture Phase 3 snapshots
4. Update receipts - Use snapshot business/branch info
5. Update BIR reports - Use snapshot TIN and VAT rate
6. Testing - Verify business renames don't affect reprints
7. Monitoring - Check Phase 3 coverage

---

## 🤖 AI Agent Instructions

### Context Preservation Strategy

Each phase file is **self-contained** with:
- ✅ Complete context at the top
- ✅ Exact code snippets to add/modify
- ✅ Specific file paths and line numbers
- ✅ Validation steps after each action
- ✅ No external dependencies between phases

### How to Execute

1. **Read the phase file completely** before starting
2. **Follow steps sequentially** - each step validates the previous one
3. **Run all validation checks** - don't skip these
4. **Check coverage at the end** - must be 100%
5. **Document any deviations** in comments

### If You Get Stuck

**Problem**: Can't find the exact code pattern
**Solution**: Use the grep commands provided to search

**Problem**: Migration fails
**Solution**: Check Prisma syntax, ensure Prisma Client is up to date

**Problem**: Backfill script errors
**Solution**: Check if related tables/data exist, handle nulls gracefully

**Problem**: Coverage is not 100%
**Solution**: Re-run backfill script, check for error logs

---

## 📊 Overall Progress Tracking

```
Phase 1: OrderItem Core Snapshots
├── [ ] Step 1: Schema Migration
├── [ ] Step 2: Backfill Script
├── [ ] Step 3: Update POS Creation
├── [ ] Step 4: Update Reports
├── [ ] Step 5: Update Receipts
├── [ ] Step 6: Testing
└── [ ] Step 7: Monitoring

Phase 2: Unit & Tax Snapshots
├── [ ] Step 1: Schema Migration
├── [ ] Step 2: Backfill Script
├── [ ] Step 3: Update POS Creation
├── [ ] Step 4: Update Tax Reports
├── [ ] Step 5: Update Receipt Units
├── [ ] Step 6: Testing
└── [ ] Step 7: Monitoring

Phase 3: Business/Branch Snapshots
├── [ ] Step 1: Schema Migration
├── [ ] Step 2: Backfill Script (complex)
├── [ ] Step 3: Update POS Creation
├── [ ] Step 4: Update Receipts
├── [ ] Step 5: Update BIR Reports
├── [ ] Step 6: Testing
└── [ ] Step 7: Monitoring
```

---

## 🎯 Success Metrics

### After Phase 1
- [ ] 9 new columns in order_items and order_item_addons
- [ ] 100% coverage for snapshotProductName
- [ ] Product renames don't affect historical reports
- [ ] Receipts show accurate historical product names

### After Phase 2
- [ ] 7 new columns (4 in order_items, 3 in order_item_addons)
- [ ] 100% coverage for snapshotUnitName and snapshotTaxCategory
- [ ] Tax category changes don't affect historical calculations
- [ ] Unit name changes don't affect historical data

### After Phase 3
- [ ] 11 new columns in transactions
- [ ] 100% coverage for snapshotBusinessName
- [ ] Business renames don't affect receipt reprints
- [ ] VAT rate changes don't retroactively apply
- [ ] Complete BIR audit trail

### Overall
- [ ] **27 total snapshot fields** across 3 tables
- [ ] **100% coverage** for all phases
- [ ] **All tests passing**
- [ ] **No breaking changes** to existing functionality

---

## 🔧 Troubleshooting Guide

### Common Issues

**Issue**: Prisma migration fails with "column already exists"
**Fix**: Run `npx prisma migrate reset` in dev, or manually drop the column

**Issue**: Backfill script runs forever
**Fix**: Check BATCH_SIZE, reduce if needed. Check for circular references.

**Issue**: Some records have null snapshots after backfill
**Fix**: Check if related data (Product, Unit, Business) exists. Handle deleted records.

**Issue**: Tests fail with "Cannot find module"
**Fix**: Run `npx prisma generate` to regenerate Prisma Client

**Issue**: POS creation fails with "missing required field"
**Fix**: Check that all required fields are provided. Snapshots are nullable, shouldn't cause this.

**Issue**: Reports showing wrong data
**Fix**: Ensure fallback logic is in place: `snapshot || liveData`

### Performance Concerns

**Backfill taking too long?**
- Reduce BATCH_SIZE
- Run during low-traffic period
- Add indexes on businessId, branchId if needed

**POS creation slower after Phase 3?**
- Normal (additional queries for snapshots)
- Consider caching business/branch/config in session
- Only noticeable on very high-volume systems

---

## 📦 Deliverables

### Code Changes
- [ ] Schema migrations (3 files)
- [ ] Backfill scripts (3 files)
- [ ] Updated POS creation logic
- [ ] Updated reports
- [ ] Updated receipts
- [ ] Test files (3 files)
- [ ] Coverage check scripts (3 files)

### Documentation
- [ ] Migration notes
- [ ] Backfill logs
- [ ] Coverage reports
- [ ] Test results

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All phases tested in dev
- [ ] All tests passing
- [ ] Coverage at 100%
- [ ] Performance validated
- [ ] Rollback plan ready

### Deployment
- [ ] Run migrations in production
- [ ] Run backfill scripts
- [ ] Monitor for errors
- [ ] Check coverage
- [ ] Verify new transactions have snapshots

### Post-Deployment
- [ ] Monitor application logs
- [ ] Check error rates
- [ ] Validate receipts
- [ ] Run sample reports
- [ ] Confirm BIR compliance

---

## 📞 Support

**If AI Agent encounters unresolvable issues:**
1. Document the exact error message
2. Note which step failed
3. Include relevant code context
4. List what was already completed
5. Ask human for guidance

**Human review points:**
- After each phase completion
- Before running backfill in production
- After any unexpected errors
- Before final deployment

---

## 🎓 Learning for AI Agent

**Key Patterns to Remember:**

1. **Always use nullable fields** for backward compatibility
2. **Always add fallback logic** in reports: `snapshot || liveData`
3. **Always validate** after each step
4. **Always check coverage** before marking complete
5. **Always handle missing data** gracefully in backfills

**Prisma Patterns:**

```typescript
// Good: Batched updates
const updates = items.map(item => prisma.table.update({...}))
await Promise.all(updates)

// Good: Fallback in queries
const name = item.snapshotName || item.relation.name

// Good: Nullable snapshot fields
snapshotProductName String?

// Good: Coverage check
const coverage = await prisma.table.count({
  where: { snapshotField: { not: null } }
})
```

---

## ✅ Final Checklist

Before marking the entire project complete:

- [ ] All 3 phases deployed
- [ ] 27 snapshot fields added
- [ ] 100% coverage across all phases
- [ ] All tests passing
- [ ] No breaking changes
- [ ] Performance acceptable
- [ ] Documentation updated
- [ ] Monitoring in place
- [ ] Human approval received

---

## 🎉 Completion

Once all phases are complete:
- Transaction data is fully immutable
- Historical reports are accurate
- BIR compliance maintained
- Receipt reprints work correctly
- Audit trail complete

**Total implementation time: 9 hours across 3 phases**
