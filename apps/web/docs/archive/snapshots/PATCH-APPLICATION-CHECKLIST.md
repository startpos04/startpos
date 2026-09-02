# Patch Application Checklist

## Quick Reference for Applying Critical Fixes

This checklist ensures all patches are applied in the correct order before executing the phase plans.

---

## Pre-Execution Requirements

### 1. Human Decisions (REQUIRED FIRST)
- [ ] Read `HUMAN-DECISIONS-REQUIRED.md`
- [ ] Decision 1: TransactionTaxLine status verified
- [ ] Decision 2: Refund snapshot behavior decided
- [ ] Decision 3: Phase 2 patch document located
- [ ] All blocking decisions documented

**DO NOT PROCEED** until all human decisions are made.

---

## Phase 1 Patch Application

Reference: `PHASE-1-AND-3-PATCH.md` Section A

### A1: ResourceType Enum Fix
- [ ] Open `web/prisma/schema.prisma`
- [ ] Find `OrderItem` model, Phase 1 snapshot block
- [ ] Change `snapshotProductType String?` to `snapshotProductType ResourceType?`
- [ ] Save file
- [ ] Verify: No other changes needed in backfill/POS code

### A2: Test Fixture Fix
- [ ] Open `web/__tests__/phase1-snapshots.test.ts`
- [ ] Search for existing test helpers:
  ```bash
  cd web
  grep -rln "prisma.business.create" __tests__/ src/
  ```
- [ ] Create or reuse test fixture helpers:
  - `createTestBusiness()`
  - `createTestBranch()`
  - `createTestCategory()`
  - `createTestProduct()`
  - `createTestProductVariant()`
- [ ] Replace placeholder `beforeEach` with real setup
- [ ] Add `afterEach` cleanup
- [ ] Fill in all `// ... required fields ...` placeholders
- [ ] Save file

### A1-A2 Verification
- [ ] Run: `cd web && npx prisma validate`
- [ ] Schema validates successfully
- [ ] Test file has no placeholder comments
- [ ] Ready to execute PHASE-1-EXECUTION.md

---

## Phase 2 Patch Application

Reference: `PHASE-2-PATCH-INSTRUCTIONS.md` (separate document)

- [ ] Locate Phase 2 patch document
- [ ] Read patch instructions completely
- [ ] Apply Phase 2 specific fixes
- [ ] Verify changes
- [ ] Ready to execute PHASE-2-EXECUTION.md

**Note**: Phase 2 patch is a separate document. If not found, ask human for location.

---

## Phase 3 Patch Application

Reference: `PHASE-1-AND-3-PATCH.md` Section B

### B1: Remove snapshotPriceConfig (Redundant)
- [ ] Open `web/prisma/schema.prisma`
- [ ] Find `Transaction` model, Phase 3 block
- [ ] Remove line: `snapshotPriceConfig String?`
- [ ] Note: Will update backfill/POS code during execution
- [ ] Save file

### B2: Handle snapshotVATRate
**Based on Decision 1 outcome:**

#### If TransactionTaxLine IS populated:
- [ ] Open `web/prisma/schema.prisma`
- [ ] Find `Transaction` model, Phase 3 block
- [ ] Remove line: `snapshotVATRate String?`
- [ ] Note: Will use `TransactionTaxLine` instead
- [ ] Save file

#### If TransactionTaxLine is NOT populated:
- [ ] STOP - Escalate to human
- [ ] Do not proceed with Phase 3 until resolved
- [ ] This is a pre-existing gap requiring separate fix

### B3: SystemConfig Scope Helper (Will apply during execution)
- [ ] Note: Helper function will be added during Step 2 (backfill)
- [ ] Note: Helper will check BRANCH scope before BUSINESS scope
- [ ] Reminder: Apply to both backfill and POS creation code

### B4: Backfill Performance Optimization (Will apply during execution)
- [ ] Note: Caching will be added during Step 2 (backfill)
- [ ] Note: Cache business and branch data to prevent N+1
- [ ] Reminder: Verify query count scales with businesses, not transactions

### B5: Receipt TIN Fallback (Will apply during execution)
- [ ] Note: Will be fixed during Step 4 (receipt printing)
- [ ] Reminder: Fallback to live ComplianceRegistry, not "(No TIN)"

### B6: Soft-Delete Cashier Test (Will apply during execution)
- [ ] Note: Will be added during Step 6 (testing)
- [ ] Reminder: Use soft-delete (deletedAt), not hard-delete

### B7: Refund Snapshot Behavior (Will apply during execution)
- [ ] Verify Decision 2 is documented in `HUMAN-DECISIONS-REQUIRED.md`
- [ ] Note: Will be implemented during Step 3 (POS creation)
- [ ] Note: Will be tested during Step 6 (testing)
- [ ] Reminder: Implement explicitly, don't leave to accident

### B1-B7 Verification
- [ ] Schema changes made (B1, B2 if applicable)
- [ ] Run: `cd web && npx prisma validate`
- [ ] Schema validates successfully
- [ ] All "will apply during execution" items noted
- [ ] Ready to execute PHASE-3-EXECUTION.md

---

## Pre-Execution Final Checklist

### All Patches Applied
- [ ] Phase 1 patches A1-A2 applied
- [ ] Phase 2 patch applied (separate document)
- [ ] Phase 3 patches B1-B2 applied (schema changes)
- [ ] Phase 3 patches B3-B7 noted for execution

### Documentation Complete
- [ ] All human decisions documented
- [ ] All schema changes saved
- [ ] All test fixture changes saved
- [ ] Prisma schema validates

### Ready to Execute
- [ ] Human decisions finalized
- [ ] Schema patches applied
- [ ] Test fixtures ready
- [ ] Execution notes prepared

---

## Execution Order

Now execute in this order:

1. **Phase 1**: Execute `PHASE-1-EXECUTION.md` with A1-A2 applied
2. **Phase 2**: Execute `PHASE-2-EXECUTION.md` with its patch applied
3. **Phase 3**: Execute `PHASE-3-EXECUTION.md` with B1-B7 applied/noted

During Phase 3 execution:
- Step 2 (Backfill): Apply B3 (scope helper) and B4 (caching)
- Step 3 (POS Creation): Apply B3 (scope helper) and B7 (refund behavior)
- Step 4 (Receipts): Apply B5 (TIN fallback)
- Step 6 (Testing): Apply B6 (soft-delete test) and B7 (refund test)

---

## Rollback Plan

If issues are discovered after applying patches:

### Schema Changes
```bash
cd web
git diff prisma/schema.prisma  # Review changes
git checkout prisma/schema.prisma  # Rollback if needed
```

### Test Files
```bash
git diff __tests__/phase1-snapshots.test.ts  # Review
git checkout __tests__/phase1-snapshots.test.ts  # Rollback
```

### Full Rollback
```bash
cd web
git status  # See all modified files
git checkout .  # Rollback everything (use with caution)
```

---

## Support

If you encounter issues:
1. Check `PHASE-1-AND-3-PATCH.md` for detailed explanations
2. Check `HUMAN-DECISIONS-REQUIRED.md` for unresolved decisions
3. Review validation checklists in each section
4. Ask human for clarification on decisions

---

**Last Updated**: [To be filled by AI agent]
**Patches Applied**: [ ] None [ ] Partial [ ] Complete
**Ready to Execute**: [ ] No [ ] Yes

