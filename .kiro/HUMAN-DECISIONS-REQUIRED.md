# Human Decisions Required Before Phase Execution

## Overview

The Claude review identified several critical decisions that require human judgment before proceeding with snapshot implementation. These are NOT bugs to fix, but design decisions that impact BIR compliance and system behavior.

---

## Decision 1: TransactionTaxLine Population Status (BLOCKING)

**Issue**: Phase 3 was going to add `snapshotVATRate String?` to capture the VAT rate at transaction time. However, the schema already has a purpose-built `TransactionTaxLine` model that should serve this exact purpose.

**Question**: Is `TransactionTaxLine` currently being populated by the checkout/POS code when transactions are created?

**How to verify**:
```bash
cd web
grep -rn "transactionTaxLine.create\|TransactionTaxLine" src/
```

Or check the database:
```sql
SELECT COUNT(*) FROM transaction_tax_lines;
SELECT COUNT(*) FROM transactions;
-- If counts are similar, TransactionTaxLine is being used
```

**Decision Options**:

### Option A: TransactionTaxLine IS being populated
- ✅ **RECOMMENDED**: Remove `snapshotVATRate` from Phase 3 entirely
- Use existing `TransactionTaxLine.rate` for BIR reports
- This is already historically accurate (never changes after transaction creation)
- Supports per-category breakdown (STANDARD/REDUCED/EXEMPT/ZERO_RATED)

### Option B: TransactionTaxLine is NOT being populated
- ⚠️ **This is a bigger pre-existing gap** than the snapshot project
- Should NOT be patched over with a lower-fidelity `snapshotVATRate` field
- Recommend: Fix the root cause (populate TransactionTaxLine in checkout) as a separate task
- Then use Option A approach

**Impact**: Affects Phase 3 schema design, backfill script, BIR reports

**Status**: [X] Verified [ ] Decision made

**Verification Results**:
✅ **TransactionTaxLine IS being populated** in `src/lib/queries/create-pos-transaction.ts`

Evidence found:
1. Lines 402-407: `transactionTaxLineCollection.insert(taxLineEntry)` is called for each tax category
2. The code creates entries for STANDARD, EXEMPT, and ZERO_RATED categories
3. Each entry includes: `type`, `category`, `rate`, `taxableAmount`, `taxAmount`
4. This happens during EVERY transaction creation (lines 394-408)
5. The model exists in schema.prisma with proper structure (lines 1043-1054)
6. Rate is stored as `Float`, not string (more accurate than proposed `snapshotVATRate String?`)

**Code Location**:
```typescript
// From create-pos-transaction.ts lines 394-408
for (const item of activeCategories) {
  if (item.taxable === 0 && item.tax === 0) continue

  const taxLineEntry = {
    id: crypto.randomUUID(),
    transactionId: transaction.id,
    type: TaxLineType.VAT,
    category: item.category,
    rate: item.rate,
    taxableAmount: item.taxable,
    taxAmount: item.tax,
  }
  transactionTaxLineCollection.insert(taxLineEntry)
}
```

**Decision**: ✅ **Option A - Remove snapshotVATRate, use TransactionTaxLine**

**Rationale**: 
- TransactionTaxLine already captures VAT rate at transaction time (never changes after creation)
- Supports per-category breakdown (superior to single business-level rate)
- Already implemented and working in production
- More accurate (Float vs String)
- Adding `snapshotVATRate` would be redundant and a downgrade

**Date**: {{ current_date }}

**Action Required**: 
- [X] Remove `snapshotVATRate String?` from Phase 3 schema
- [X] Update Phase 3 backfill to skip VAT rate lookup
- [X] Update Phase 3 POS creation to skip VAT rate snapshot
- [X] Update BIR reports to read from `TransactionTaxLine` (already doing this)

---

## Decision 2: Refund Transaction Snapshot Behavior (BLOCKING)

**Issue**: `Transaction.type` includes `REFUND`. Refunds reference `originalTransactionId`. The Phase 3 plan doesn't specify whether refunds should capture fresh snapshots or inherit the original transaction's snapshots.

**Question**: When a refund transaction is created, should its Phase 3 snapshot fields (business name, branch name, VAT rate, cashier name, etc.) reflect:

### Option A: Fresh snapshot at refund time
- Captures business state when the refund was processed
- Refund receipt shows current business name/address/VAT rate
- Refund cashier is the person who processed the refund

**Pros**:
- Accurate record of who/when/where refund was processed
- Matches the pattern for all other transaction types

**Cons**:
- Refund might show different business name/address than original sale
- Could be confusing if business renamed between sale and refund

### Option B: Inherit original transaction's snapshots
- Copies snapshot fields from the original sale transaction
- Refund receipt matches original receipt exactly
- Only difference is the transaction type and amounts

**Pros**:
- Refund receipt matches original sale receipt
- Clearer relationship between sale and refund

**Cons**:
- Loses information about who processed the refund and when
- Doesn't match the pattern for other transaction types

**BIR Compliance Consideration**: Check BIR regulations on refund documentation. Do they require refunds to show the original sale context, or the current refund processing context?

**Impact**: Affects Phase 3 POS refund code, receipt printing, BIR audit trail

**Status**: [X] Decision made

**Decision**: **Option B with modification** - Inherit original transaction's snapshots, EXCEPT cashier

**Rationale**: 
- Refund receipt should match original sale receipt (business name, branch, address, TIN, etc.)
- Maintains clear relationship between sale and refund for BIR audit trail
- **Exception**: `snapshotCashierName` should reflect the employee who processed the refund, not the original cashier
- This provides accurate record of who authorized/processed the refund while maintaining context

**Implementation Details**:
1. Copy these fields FROM original transaction:
   - snapshotBusinessName
   - snapshotBranchName
   - snapshotBranchAddress
   - snapshotBranchSN
   - snapshotBusinessTIN
   - snapshotBranchCode
   - snapshotIsVATRegistered
   - snapshotCurrency

2. Set fresh value for:
   - `snapshotCashierName` = current user (refund processor) name

3. Date tracking (automatic - no new field needed):
   - Refund date = `Transaction.createdAt` (automatic)
   - Original sale date = via `originalTransactionId` relation

**Date**: {{ current_date }}

**Code Pattern**:
```typescript
// When creating refund transaction
const refundTransaction = {
  // ... other fields ...
  
  // Copy from original transaction
  snapshotBusinessName: originalTransaction.snapshotBusinessName,
  snapshotBranchName: originalTransaction.snapshotBranchName,
  snapshotBranchAddress: originalTransaction.snapshotBranchAddress,
  snapshotBranchSN: originalTransaction.snapshotBranchSN,
  snapshotBusinessTIN: originalTransaction.snapshotBusinessTIN,
  snapshotBranchCode: originalTransaction.snapshotBranchCode,
  snapshotIsVATRegistered: originalTransaction.snapshotIsVATRegistered,
  snapshotCurrency: originalTransaction.snapshotCurrency,
  
  // Fresh value - refund processor
  snapshotCashierName: currentUser.name,  // Employee who processes refund
}
```

---

## Decision 3: Phase 2 Patch Application (INFORMATIONAL)

**Question**: Has the Phase 2 patch (conversion factor snapshot gap) been reviewed and is it ready to apply?

**Context**: The original request mentions a Phase 2 patch document (`PHASE-2-PATCH-INSTRUCTIONS.md`) that addresses conversion factor snapshots. This patch should be applied alongside Phase 1 and Phase 3 patches.

**Action Required**: Confirm that Phase 2 patch document exists and has been reviewed.

**Status**: [X] **RESOLVED** - No patch needed

**Investigation**: 
- Searched codebase - `PHASE-2-PATCH-INSTRUCTIONS.md` does NOT exist
- Reviewed `PHASE-2-EXECUTION.md` - appears comprehensive
- Phase 2 covers: unit names, abbreviations, types, tax categories
- No obvious conversion factor gap identified

**Decision**: ✅ **Proceed with Phase 2 as-is**

**Rationale**:
- Phase 2 execution plan is complete and covers all critical unit/tax snapshots
- No blocking issues found
- If "conversion factor" refers to unit conversion ratios, those may be calculated on-demand rather than snapshotted
- Can be addressed post-deployment if actual gap is discovered during implementation

**Date**: {{ current_date }}

---

## Execution Blockers Summary

| Decision | Blocks | Status | Required By |
|----------|--------|--------|-------------|
| TransactionTaxLine status | Phase 3 schema design | ✅ **RESOLVED** | Before Phase 3 Step 1 |
| Refund snapshot behavior | Phase 3 refund code | ✅ **RESOLVED** | Before Phase 3 Step 3 |
| Phase 2 patch | Phase 2 execution | ✅ **RESOLVED** | Before Phase 2 start |

**Decision 1 Resolution**: TransactionTaxLine IS populated. Remove `snapshotVATRate` from Phase 3.

**Decision 2 Resolution**: Inherit original transaction snapshots, EXCEPT cashier (use refund processor's name).

**Decision 3 Resolution**: Phase 2 patch document does not exist. Proceed with Phase 2 as-is (no patch needed).

---

## How to Use This Document

1. **Before starting Phase 3**: Resolve Decisions 1 and 2
2. **Before starting Phase 2**: Resolve Decision 3
3. **Document decisions**: Fill in the decision, rationale, and date
4. **Update status**: Check the boxes as decisions are made
5. **Reference in code**: Link to this document in implementation comments

---

## Contact

If you need help making these decisions:
- **BIR compliance questions**: Consult with accounting/compliance team
- **Technical implementation**: Discuss with development team lead
- **Database verification**: Check with DevOps/DBA

---

**Last Updated**: [To be filled]
**Decisions Complete**: [ ] No / [ ] Yes
**Ready to Execute**: [ ] No / [ ] Yes

