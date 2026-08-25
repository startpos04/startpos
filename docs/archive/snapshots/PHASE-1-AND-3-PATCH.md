# Phase 1 & Phase 3 Patch: Fixes From Plan Review

## ⚠️ CRITICAL: Apply These Fixes BEFORE Executing Phases 1 & 3

This document contains critical corrections identified through Claude's review of the execution plans. These fixes address:
- Type safety issues
- Redundant/incorrect fields
- Performance problems
- Testing gaps
- Configuration scope handling

**Status**: Ready to apply
**Created**: Based on Claude review feedback
**Must be applied**: Before executing PHASE-1-EXECUTION.md and PHASE-3-EXECUTION.md

---

# PART A — Phase 1 Fixes

## A1. ✅ Use the existing `ResourceType` enum instead of `String`

### Problem
`snapshotProductType` is typed `String?`, but `Product.type` is a real Prisma enum (`ResourceType`). Storing it as a free-text string means Prisma won't validate the value, and it's inconsistent with Phase 2's own `snapshotTaxCategory TaxCategory?`, which correctly uses the enum type.

### Status
- [ ] Applied to schema
- [ ] Migration generated
- [ ] Backfill script updated
- [ ] POS creation code updated

### File to modify
`web/prisma/schema.prisma`

### Change
Find (in `OrderItem`, Phase 1 block):
```prisma
  snapshotProductType  String? // Product type at time of sale: "PHYSICAL_GOOD", "SERVICE", etc.
```

Replace with:
```prisma
  snapshotProductType  ResourceType? // Product type at time of sale
```

### Update Requirements
- Migration will work (column type stays a Postgres enum, not text)
- Backfill script needs no changes (assignment already correct)
- POS creation code needs no changes (already assigning from enum field)

### Validation Checklist
- [ ] Migration applies (column type is enum, not text)
- [ ] Backfill script compiles with no `as string` casts needed
- [ ] Coverage/report code that reads `snapshotProductType` works

---

## A2. ⚠️ Fill in real test fixtures, not the placeholder

### Problem
`web/__tests__/phase1-snapshots.test.ts`'s `beforeEach` is a literal placeholder comment. As written, test IDs are never assigned, and tests reference `// ... required fields ...` instead of real values. These tests will not run against real Prisma relations.

### Status
- [ ] Test file has real fixtures
- [ ] Tests actually run and pass
- [ ] Cleanup logic added

### Instruction
Before marking Phase 1 "Tests: ✅", replace the placeholder `beforeEach` with real setup that creates:
- `Business`
- `Branch` 
- `Category`
- `Product`
- `ProductVariant`
- Clean them up in `afterEach`

Fill every `// ... required fields ...` stub with actual required fields.

### Search for existing patterns first
```bash
cd web
grep -rln "prisma.business.create" __tests__/ src/
```

If no existing helper exists, build minimal ones:
- `createTestBusiness()`
- `createTestBranch()`
- `createTestProductVariant()`

Note: These should be reused by Phase 2 and Phase 3 test files too.

### Validation Checklist
- [ ] `npm test phase1-snapshots.test.ts` creates and queries real rows
- [ ] Test suite cleans up created rows after each test
- [ ] All tests pass

---

# PART B — Phase 3 Fixes

## B1. 🗑️ Drop `snapshotPriceConfig` — it is fully redundant

### Problem
`Transaction.priceConfiguration` is already captured at creation time (`@default(INCLUSIVE)`, set per-row, never derived from a live join). It is not something that changes retroactively for existing rows — it already behaves exactly like a snapshot field. Adding `snapshotPriceConfig String?` duplicates existing, already-correct data.

### Status
- [ ] Removed from schema
- [ ] Removed from backfill script
- [ ] Removed from POS creation code
- [ ] Removed from receipt/report code

### Instruction
Remove `snapshotPriceConfig` from the Phase 3 field list entirely. Everywhere the plan reads `transaction.snapshotPriceConfig`, read `transaction.priceConfiguration` directly instead — no fallback needed.

### Files to modify
1. `web/prisma/schema.prisma` - Remove the field definition
2. `web/scripts/backfill-phase3-snapshots.ts` - Remove from select/data
3. POS creation code - Remove from snapshot payload
4. Receipt/report code - Use `priceConfiguration` directly

### Change in schema
Find and DELETE:
```prisma
  snapshotPriceConfig     String? // Price configuration: "INCLUSIVE" or "EXCLUSIVE"
```

### Validation Checklist
- [ ] `snapshotPriceConfig` does not exist as a column
- [ ] Nothing in receipts/reports references it
- [ ] Code uses `transaction.priceConfiguration` instead

---

## B2. ✅ ~~Fix `snapshotVATRate`~~ — VERIFIED: Use existing `TransactionTaxLine` model

### ✅ DECISION RESOLVED: Remove `snapshotVATRate` completely

**Verification completed**: `TransactionTaxLine` IS being populated during every transaction creation in `src/lib/queries/create-pos-transaction.ts` (lines 394-408).

### Problem
The schema already has `TransactionTaxLine` (`rate: Float`, `type`, `category`, `taxableAmount`, `taxAmount`), captured per transaction, per tax category, at time of sale. Its own schema comment says it exists to "replace hardcoded PH VAT breakdowns." 

Adding `snapshotVATRate String?` as a single business-level rate is:
1. ✅ **CONFIRMED REDUNDANT** - TransactionTaxLine already exists and works
2. A **downgrade** — a string instead of a float
3. Missing per-category breakdown that `TransactionTaxLine` already supports

### Status
- [X] **Confirmed** `TransactionTaxLine` is populated by checkout code
- [X] **Decision**: Remove `snapshotVATRate` from Phase 3
- [ ] `snapshotVATRate` removed from schema
- [ ] Backfill script updated (skip VAT rate lookup)
- [ ] POS creation updated (skip VAT rate snapshot)
- [ ] Receipt/report code verified

### Evidence
```typescript
// From create-pos-transaction.ts lines 394-408
for (const item of activeCategories) {
  if (item.taxable === 0 && item.tax === 0) continue
  
  const taxLineEntry = {
    id: crypto.randomUUID(),
    transactionId: transaction.id,
    type: TaxLineType.VAT,
    category: item.category,
    rate: item.rate,              // ✅ Rate captured
    taxableAmount: item.taxable,
    taxAmount: item.tax,
  }
  transactionTaxLineCollection.insert(taxLineEntry) // ✅ Being populated
}
```

### Files to modify
1. `web/prisma/schema.prisma` - Remove `snapshotVATRate String?`
2. `web/scripts/backfill-phase3-snapshots.ts` - Remove VAT rate lookup
3. POS creation code - Remove VAT rate snapshot
4. BIR/tax reports - Already using `TransactionTaxLine` (no change needed)

### Validation Checklist
- [X] Confirmed `TransactionTaxLine` is populated by current checkout code
- [ ] `snapshotVATRate` does not exist as a new column
- [ ] BIR/tax reports read from `TransactionTaxLine`, not a snapshot string
- [ ] Phase 3 field count reduced from 11 to 10 fields

---

## B3. 🎯 Fix `SystemConfig` lookups to respect `scope`

### Problem
`SystemConfig` has a `scope` field (`BUSINESS` / `BRANCH` / `USER`) to support branch-level overrides. Every lookup in Phase 3 does:
```typescript
prisma.systemConfig.findFirst({
  where: { key: 'IS_VAT_REGISTERED', businessId: tx.businessId }
})
```

This never filters by `scope` and never checks for a `branchId`-scoped override. If a branch has its own override, this query may return the wrong row.

### Status
- [ ] Helper function created
- [ ] Backfill script updated
- [ ] POS creation code updated
- [ ] Tested with branch-scoped override

### Instruction
Replace every `SystemConfig` lookup with a helper that checks branch scope first, then business scope:

```typescript
async function resolveConfigValue(
  key: ConfigKey,
  businessId: string,
  branchId: string,
  fallback: string
): Promise<string> {
  // Check branch-level override first
  const branchConfig = await prisma.systemConfig.findFirst({
    where: { key, branchId, scope: 'BRANCH' }
  })
  if (branchConfig) return branchConfig.value

  // Fall back to business-level config
  const businessConfig = await prisma.systemConfig.findFirst({
    where: { key, businessId, scope: 'BUSINESS' }
  })
  if (businessConfig) return businessConfig.value

  // Final fallback to default
  return fallback
}
```

Use this for all `SystemConfig`-backed snapshot fields:
- `IS_VAT_REGISTERED`
- `CURRENCY`
- Any others that remain after B1/B2

### Files to modify
1. `web/scripts/backfill-phase3-snapshots.ts` - Add helper, use it
2. POS creation code - Add helper, use it

### Validation Checklist
- [ ] Created branch-scoped `SystemConfig` row that differs from business default
- [ ] Created transaction at that branch
- [ ] Confirmed snapshot captured branch-level value, not business default

---

## B4. ⚡ Fix N+1 backfill performance problem

### Problem
`backfillTransactionSnapshots()` loops over transactions one at a time and issues up to 7 sequential queries per transaction (business, branch, TIN, and 4 SystemConfig lookups) — none cached across transactions that share the same business/branch.

For any business with meaningful transaction volume, this will be far slower than the plan's "5–15 minutes" estimate.

### Status
- [ ] Business/branch caching implemented
- [ ] Performance tested
- [ ] Output verified identical

### Instruction
Restructure backfill to resolve business-level data **once per business**:

```typescript
type BusinessSnapshotData = {
  businessName: string
  tin: string | null
  isVatRegistered: string
  currency: string
}
type BranchSnapshotData = {
  branchName: string
  branchAddress: string | null
  branchSN: string
  branchCode: string
}

const businessCache = new Map<string, BusinessSnapshotData>()
const branchCache = new Map<string, BranchSnapshotData>()

async function getBusinessData(businessId: string): Promise<BusinessSnapshotData> {
  const cached = businessCache.get(businessId)
  if (cached) return cached

  const [business, tinRecord, isVatRegisteredConfig, currencyConfig] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.complianceRegistry.findFirst({ where: { businessId, key: 'BIR_TIN' } }),
    prisma.systemConfig.findFirst({ where: { key: 'IS_VAT_REGISTERED', businessId, scope: 'BUSINESS' } }),
    prisma.systemConfig.findFirst({ where: { key: 'CURRENCY', businessId, scope: 'BUSINESS' } }),
  ])

  const data: BusinessSnapshotData = {
    businessName: business.name,
    tin: tinRecord?.value ?? null,
    isVatRegistered: isVatRegisteredConfig?.value ?? 'false',
    currency: currencyConfig?.value ?? 'PHP',
  }
  businessCache.set(businessId, data)
  return data
}

async function getBranchData(branchId: string): Promise<BranchSnapshotData> {
  const cached = branchCache.get(branchId)
  if (cached) return cached

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } })
  const data: BranchSnapshotData = {
    branchName: branch.name,
    branchAddress: branch.address,
    branchSN: branch.serialNumber,
    branchCode: branch.branchCode,
  }
  branchCache.set(branchId, data)
  return data
}
```

Then in the main loop, call `getBusinessData(tx.businessId)` and `getBranchData(tx.branchId)`.

Still resolve branch-scoped overrides (per B3) as a per-transaction check layered on top of cached business defaults.

Also remove `snapshotVATRate`/`snapshotPriceConfig` per B1/B2.

### Files to modify
1. `web/scripts/backfill-phase3-snapshots.ts` - Implement caching

### Validation Checklist
- [ ] Run backfill against many transactions per business
- [ ] Confirm number of Business/ComplianceRegistry/SystemConfig queries scales with distinct business/branch count, not transaction count
- [ ] Output identical to unoptimized version on sample

---

## B5. 🔗 Fix receipt TIN fallback to match other fallback patterns

### Problem
Every other Phase 3 field falls back to live data:
```typescript
branchName: transaction.snapshotBranchName || transaction.branch.name,
```

But the receipt header code was given:
```typescript
tin: transaction.snapshotBusinessTIN || '(No TIN)',
```

This means an old (pre-Phase-3) transaction for a business that legitimately has a TIN will incorrectly show "(No TIN)" instead of falling back to the live `ComplianceRegistry` lookup.

### Status
- [ ] Receipt header code updated
- [ ] Tested with pre-Phase-3 transaction with TIN
- [ ] Tested with pre-Phase-3 transaction without TIN

### Instruction
Change the fallback to actually query live data:

```typescript
function formatReceiptHeader(
  transaction: Transaction & { business: Business; branch: Branch },
  liveTin: string | null // fetched from ComplianceRegistry if snapshot is null
) {
  return {
    businessName: transaction.snapshotBusinessName || transaction.business.name,
    branchName: transaction.snapshotBranchName || transaction.branch.name,
    branchAddress: transaction.snapshotBranchAddress || transaction.branch.address,
    tin: transaction.snapshotBusinessTIN || liveTin || '(No TIN)',
    serialNumber: transaction.snapshotBranchSN || transaction.branch.serialNumber,
    branchCode: transaction.snapshotBranchCode || transaction.branch.branchCode,
  }
}
```

The caller should fetch `liveTin` from `ComplianceRegistry` only when `transaction.snapshotBusinessTIN` is null.

### Files to modify
1. Receipt formatting code (wherever `formatReceiptHeader` is implemented)

### Validation Checklist
- [ ] Reprint pre-Phase-3 transaction for business with TIN — shows real TIN, not "(No TIN)"
- [ ] Reprint pre-Phase-3 transaction for business without TIN — shows "(No TIN)"
- [ ] New transactions show snapshot TIN correctly

---

## B6. 🧪 Fix the untestable "delete cashier" manual test

### Problem
`Transaction.cashierId` → `User` has no `onDelete: SetNull` or `Cascade` specified, so Prisma defaults to restricting the delete. A hard delete of a `User` who has processed transactions will fail with a foreign-key error.

`User` already has a `deletedAt` soft-delete field — that's almost certainly what the manual test checklist meant.

### Status
- [ ] Manual test checklist corrected
- [ ] Automated test added
- [ ] Test passes

### Instruction
Change the checklist item from:
```
- [ ] Delete cashier user
- [ ] Transaction still shows cashier name
```

to:
```
- [ ] Soft-delete cashier user (set deletedAt), do NOT hard-delete
- [ ] Transaction still shows cashier name via snapshotCashierName
```

Add an automated test:
```typescript
it('should preserve cashier name after cashier is soft-deleted', async () => {
  const transaction = await prisma.transaction.create({
    data: { /* ... required fields ... */ snapshotCashierName: 'Jane Cashier' }
  })

  await prisma.user.update({
    where: { id: transaction.cashierId },
    data: { deletedAt: new Date() }
  })

  const fetched = await prisma.transaction.findUnique({ where: { id: transaction.id } })
  expect(fetched?.snapshotCashierName).toBe('Jane Cashier')
})
```

### Files to modify
1. `web/__tests__/phase3-snapshots.test.ts` - Add test
2. Phase 3 execution plan manual checklist - Update wording

### Validation Checklist
- [ ] Confirmed hard-delete of User with transactions fails (expected FK behavior)
- [ ] Soft-delete test passes

---

## B7. ✅ Refund snapshot behavior - DECIDED

### Status
- [X] **Human confirmed** intended behavior
- [ ] Refund creation code implements it explicitly
- [ ] Test added

### Decision
**Option B with modification**: Inherit original transaction's snapshots, EXCEPT cashier

**Rationale from user**:
- Refund receipt should match original sale receipt (business context preserved)
- Clear BIR audit trail linking refund to original sale
- **Exception**: Cashier field should reflect the employee who processed the refund
- Provides accountability for who authorized the refund

### Implementation

When creating a refund transaction, copy most snapshot fields from `originalTransaction`, but set fresh `snapshotCashierName`:

```typescript
// In POS refund creation code
const originalTransaction = await prisma.transaction.findUniqueOrThrow({
  where: { id: refundData.originalTransactionId },
  select: {
    // Select all Phase 3 snapshot fields
    snapshotBusinessName: true,
    snapshotBranchName: true,
    snapshotBranchAddress: true,
    snapshotBranchSN: true,
    snapshotBusinessTIN: true,
    snapshotBranchCode: true,
    snapshotIsVATRegistered: true,
    snapshotCurrency: true,
    // Do NOT copy snapshotCashierName
  }
})

const refundTransaction = await prisma.transaction.create({
  data: {
    type: TransactionType.REFUND,
    originalTransactionId: originalTransaction.id,
    // ... other fields ...
    
    // 📸 PHASE 3 SNAPSHOTS - Inherited from original
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
})
```

### Test Case

Add to `web/__tests__/phase3-snapshots.test.ts`:

```typescript
it('refund transactions inherit original snapshots except cashier', async () => {
  // Create original sale
  const originalTx = await prisma.transaction.create({
    data: {
      // ... required fields ...
      cashierId: cashier1.id,
      snapshotBusinessName: 'Original Business Name',
      snapshotBranchName: 'Main Branch',
      snapshotCashierName: 'Alice Cashier',
      // ... other snapshots ...
    }
  })
  
  // Business renames after sale
  await prisma.business.update({
    where: { id: businessId },
    data: { name: 'New Business Name' }
  })
  
  // Different employee processes refund
  const refundTx = await createRefundTransaction({
    originalTransactionId: originalTx.id,
    processedBy: cashier2.id,  // Different employee
  })
  
  // Should inherit original business/branch snapshots
  expect(refundTx.snapshotBusinessName).toBe('Original Business Name')
  expect(refundTx.snapshotBranchName).toBe('Main Branch')
  
  // Should have fresh cashier name (refund processor)
  expect(refundTx.snapshotCashierName).toBe('Bob Cashier')  // cashier2's name
  expect(refundTx.snapshotCashierName).not.toBe('Alice Cashier')  // NOT original cashier
})
```

### Files to modify
1. POS refund creation code - Implement inheritance pattern
2. `web/__tests__/phase3-snapshots.test.ts` - Add test case
3. Refund receipt printing - Verify it uses inherited snapshots

### Validation Checklist
- [X] Human confirmed intended behavior
- [ ] Refund creation code implements inheritance + fresh cashier
- [ ] Test added and passes
- [ ] Refund receipt matches original sale receipt (except cashier)
- [ ] Decision documented in code comments

---

# Combined Patch Completion Checklist

## Phase 1 Fixes
- [ ] A1: `snapshotProductType` uses `ResourceType?` enum, not `String?`
- [ ] A2: Test file has real fixtures, not placeholder `beforeEach`

## Phase 3 Fixes
- [ ] B1: `snapshotPriceConfig` removed (redundant with `priceConfiguration`)
- [X] B2: ✅ **VERIFIED** - `snapshotVATRate` to be removed (TransactionTaxLine confirmed working)
- [ ] B3: `SystemConfig` lookups resolve branch-scope before business-scope
- [ ] B4: Backfill script caches business/branch/config data
- [ ] B5: Receipt TIN fallback checks live `ComplianceRegistry`
- [ ] B6: "Delete cashier" test corrected to soft-delete
- [X] B7: ✅ **DECIDED** - Refund inherits original snapshots, except cashier (uses refund processor)

## Cross-Phase
- [ ] Confirmed with human whether Phase 2 patch (conversion factor) has also been applied
- [ ] All three patches should land together before production deployment

---

# Execution Order

1. **Read this patch document completely**
2. **Apply Phase 1 fixes** (A1, A2)
3. **Execute PHASE-1-EXECUTION.md** with fixes applied
4. **Apply Phase 2 patch** (conversion factor - separate document)
5. **Execute PHASE-2-EXECUTION.md** with its patch
6. **Apply Phase 3 fixes** (B1-B7)
7. **Execute PHASE-3-EXECUTION.md** with fixes applied
8. **Final validation** across all three phases

---

# Notes for AI Agent

- These fixes are **critical** and must be applied before executing the original plans
- Don't skip any validation checklists
- If B2 (TransactionTaxLine check) or B7 (refund behavior) requires human input, STOP and ask
- Document any deviations or additional issues found
- Keep this patch document updated as fixes are applied

---

# Document Status

- **Created**: From Claude review feedback
- **Status**: Ready to apply
- **Last Updated**: [To be filled by AI agent]
- **Applied**: [ ] Not started / [ ] In progress / [ ] Complete

