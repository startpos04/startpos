# Snapshot Implementation Patches - Summary

## What Happened

You consulted Claude to review the snapshot execution plans (Phase 1 and Phase 3). Claude identified **7 critical issues** that would cause problems if not fixed before execution.

## Documents Created

### 1. PHASE-1-AND-3-PATCH.md (Main Patch Document)
**Purpose**: Detailed technical fixes for Phase 1 and Phase 3

**Phase 1 Fixes (A1-A2)**:
- A1: Use `ResourceType` enum instead of `String` for `snapshotProductType`
- A2: Replace placeholder test fixtures with real ones

**Phase 3 Fixes (B1-B7)**:
- B1: Remove `snapshotPriceConfig` (redundant with existing field)
- B2: Remove `snapshotVATRate` (use existing `TransactionTaxLine` instead)
- B3: Fix `SystemConfig` lookups to respect branch-level overrides
- B4: Optimize backfill script to prevent N+1 queries
- B5: Fix receipt TIN fallback to use live data, not hardcoded string
- B6: Fix cashier deletion test to use soft-delete, not hard-delete
- B7: Decide and document refund snapshot behavior (fresh vs inherited)

### 2. HUMAN-DECISIONS-REQUIRED.md (Blocking Decisions)
**Purpose**: Document decisions that require human judgment

**Decision 1 (BLOCKING)**: Is `TransactionTaxLine` currently being populated?
- If YES: Remove `snapshotVATRate` from Phase 3
- If NO: Escalate as a pre-existing gap

**Decision 2 (BLOCKING)**: How should refunds snapshot?
- Option A: Fresh snapshot at refund time
- Option B: Inherit from original transaction

**Decision 3 (INFORMATIONAL)**: Has Phase 2 patch been located?

### 3. PATCH-APPLICATION-CHECKLIST.md (Quick Reference)
**Purpose**: Step-by-step checklist for applying all patches

**Sections**:
- Pre-execution requirements (human decisions)
- Phase 1 patch application steps
- Phase 2 patch reference
- Phase 3 patch application steps
- Final verification checklist
- Execution order
- Rollback plan

### 4. SNAPSHOT-EXECUTION-INDEX.md (Updated)
**Purpose**: Main index file updated with patch references

**Changes Made**:
- Added critical patches section at top
- Linked to all patch documents
- Updated each phase to reference its patches
- Added warning not to skip patches

---

## Critical Issues Found

### Type Safety Issue (Phase 1)
**Problem**: `snapshotProductType` was typed as `String?` instead of using the existing `ResourceType` enum.
**Impact**: No type validation, inconsistent with Phase 2's approach
**Fix**: Change to `ResourceType?`

### Test Gap (Phase 1)
**Problem**: Test file had placeholder comments, no real fixtures
**Impact**: Tests wouldn't actually run or validate anything
**Fix**: Create real test setup with proper Business/Branch/Product/Variant creation

### Redundant Field (Phase 3)
**Problem**: `snapshotPriceConfig` duplicates existing `Transaction.priceConfiguration`
**Impact**: Unnecessary write, storage, and maintenance
**Fix**: Remove completely, use existing field

### Wrong Data Model (Phase 3)
**Problem**: `snapshotVATRate` as a single string duplicates the better `TransactionTaxLine` model
**Impact**: Downgrade from multi-category breakdown to single rate
**Fix**: Remove if TransactionTaxLine is populated, escalate if not

### Scope Bug (Phase 3)
**Problem**: SystemConfig lookups ignore branch-level overrides
**Impact**: Wrong config values for branches with overrides
**Fix**: Check BRANCH scope before BUSINESS scope

### Performance Bug (Phase 3)
**Problem**: Backfill queries business/branch/config for every transaction (N+1)
**Impact**: 1000s of redundant queries, slow backfill
**Fix**: Cache business/branch data, reuse across transactions

### Missing Fallback (Phase 3)
**Problem**: Receipt TIN falls back to "(No TIN)" instead of live data
**Impact**: Pre-Phase-3 transactions show wrong TIN
**Fix**: Query ComplianceRegistry as fallback

### Test Error (Phase 3)
**Problem**: "Delete cashier" test expects hard-delete (will fail with FK error)
**Impact**: Test doesn't match reality (User has soft-delete)
**Fix**: Test soft-delete (deletedAt) instead

### Missing Specification (Phase 3)
**Problem**: No specification for how refunds should snapshot
**Impact**: Accidental implementation, potentially wrong for BIR
**Fix**: Get explicit human decision, implement deliberately

---

## Impact Summary

### Without These Patches
- **Phase 1**: Would work but with type issues and no real tests
- **Phase 3**: Would have redundant fields, slow backfill, wrong config values, broken tests

### With These Patches
- **Phase 1**: Type-safe, properly tested
- **Phase 3**: Optimized, correct, complete

### Time Saved
- Backfill performance: Could save hours on large datasets
- Debugging time: Prevents issues from being discovered in production
- Rework time: Avoids having to remove redundant fields later

---

## What You Need To Do

### Step 1: Make Human Decisions (REQUIRED FIRST)
Open `HUMAN-DECISIONS-REQUIRED.md` and make these decisions:

1. **Check TransactionTaxLine**: Run this query:
   ```bash
   cd web
   grep -rn "transactionTaxLine.create\|TransactionTaxLine" src/
   ```
   - If found: Proceed with removing `snapshotVATRate`
   - If not found: Escalate to team

2. **Decide Refund Behavior**: Should refunds:
   - Capture fresh snapshot at refund time? OR
   - Inherit original transaction's snapshot?
   
   Document decision in `HUMAN-DECISIONS-REQUIRED.md`

3. **Locate Phase 2 Patch**: Find or confirm Phase 2 patch document exists

### Step 2: Apply Patches
Open `PATCH-APPLICATION-CHECKLIST.md` and follow step-by-step:

**Phase 1 Patches (Before executing PHASE-1-EXECUTION.md)**:
- [ ] Change `snapshotProductType String?` → `ResourceType?`
- [ ] Create real test fixtures

**Phase 3 Patches (Before executing PHASE-3-EXECUTION.md)**:
- [ ] Remove `snapshotPriceConfig` from schema
- [ ] Remove `snapshotVATRate` from schema (if Decision 1 says yes)
- [ ] Note other patches to apply during execution

### Step 3: Execute Phases
Once patches are applied:
1. Execute PHASE-1-EXECUTION.md (with patches)
2. Execute PHASE-2-EXECUTION.md (with its patch)
3. Execute PHASE-3-EXECUTION.md (with patches)

---

## Quick Start

```bash
# 1. Make decisions
code web/.kiro/HUMAN-DECISIONS-REQUIRED.md

# 2. Apply patches
code web/.kiro/PATCH-APPLICATION-CHECKLIST.md

# 3. Verify schema
cd web
npx prisma validate

# 4. Execute phases
# Follow SNAPSHOT-EXECUTION-INDEX.md
```

---

## Files Modified

### Created
- `web/.kiro/PHASE-1-AND-3-PATCH.md` - Main patch document
- `web/.kiro/HUMAN-DECISIONS-REQUIRED.md` - Blocking decisions
- `web/.kiro/PATCH-APPLICATION-CHECKLIST.md` - Application guide
- `web/.kiro/PATCH-SUMMARY.md` - This file

### Updated
- `web/.kiro/SNAPSHOT-EXECUTION-INDEX.md` - Added patch references

### To Be Modified (After Applying Patches)
- `web/prisma/schema.prisma` - Type fixes, field removals
- `web/__tests__/phase1-snapshots.test.ts` - Real fixtures
- Various scripts/code during execution

---

## Key Takeaways

### What Went Well
✅ Claude review caught issues BEFORE execution
✅ All issues documented with clear fixes
✅ Blocking decisions identified upfront
✅ Performance optimization identified early

### What This Prevents
❌ Redundant fields in production
❌ Slow backfill scripts
❌ Type safety issues
❌ Missing test coverage
❌ Wrong configuration values
❌ Undefined refund behavior

### What This Enables
✅ Clean, optimized schema
✅ Fast backfill execution
✅ Type-safe implementation
✅ Proper test coverage
✅ Correct configuration handling
✅ Deliberate refund behavior

---

## Next Steps

1. **Read this summary** ✅ (You're here)
2. **Open HUMAN-DECISIONS-REQUIRED.md** - Make decisions
3. **Open PATCH-APPLICATION-CHECKLIST.md** - Apply patches
4. **Execute phases** - Follow SNAPSHOT-EXECUTION-INDEX.md

---

## Questions?

If anything is unclear:
- Read the detailed explanations in `PHASE-1-AND-3-PATCH.md`
- Check the validation checklists in each section
- Review the rollback plan in `PATCH-APPLICATION-CHECKLIST.md`
- Ask for clarification before proceeding

---

**Status**: Patches documented, ready to apply
**Next Action**: Make human decisions in HUMAN-DECISIONS-REQUIRED.md
**Estimated Time**: 30 minutes for decisions + patches, then proceed with phases

