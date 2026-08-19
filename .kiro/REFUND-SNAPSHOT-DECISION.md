# Refund Snapshot Behavior - Implementation Guide

## Decision Summary

**Date**: {{ current_date }}
**Decision By**: User
**Status**: Approved - Ready to implement in Phase 3

---

## Decision: Option B with Modification

Refund transactions should **inherit** original transaction's Phase 3 snapshot fields, **EXCEPT** `snapshotCashierName` which should reflect the employee who processes the refund.

---

## Rationale

### Why Inherit (Option B)?
1. **BIR Compliance**: Refund receipt should match original sale receipt for audit trail
2. **Context Preservation**: Business name, branch, address, TIN should reflect state at time of original sale
3. **Receipt Clarity**: Refund receipt matching original makes it clear they're related
4. **Audit Trail**: Links refund to original sale's business context

### Why Fresh Cashier?
1. **Accountability**: Need to know who authorized/processed the refund
2. **Security**: Different employee might process refund than original sale
3. **Audit Requirement**: Refund authorization is a distinct action requiring tracking

---

## Refund Date Tracking - Already Built-In ✅

### Question
Can we save the date of refund?

### Answer
✅ **Already captured automatically** - No additional snapshot field needed!

### How It Works

The `Transaction` model already tracks this through its standard fields:

```prisma
model Transaction {
  id                    String             @id @default(cuid())
  type                  TransactionType    // SALE or REFUND
  createdAt             DateTime           @default(now())  // ✅ Refund date
  originalTransactionId String?            // Links to original sale
  
  // Phase 3 snapshots...
  snapshotCashierName   String?            // Who processed refund
}
```

### Refund Data Available

For any refund transaction, you have:

1. **Refund Date**: `refundTransaction.createdAt` (automatic)
2. **Original Sale Date**: `refundTransaction.originalTransaction.createdAt` (via relation)
3. **Days Between**: Can calculate difference
4. **Refund Processor**: `refundTransaction.snapshotCashierName` (Phase 3)
5. **Original Cashier**: `refundTransaction.originalTransaction.snapshotCashierName` (via relation)

### Example Query

```typescript
// Get refund with original sale dates
const refund = await prisma.transaction.findUnique({
  where: { id: refundId },
  include: {
    originalTransaction: {
      select: {
        createdAt: true,
        snapshotCashierName: true,
      }
    }
  }
})

// All date info available:
console.log('Original Sale Date:', refund.originalTransaction.createdAt)
console.log('Refund Date:', refund.createdAt)
console.log('Days Elapsed:', daysDiff(refund.createdAt, refund.originalTransaction.createdAt))
console.log('Original Cashier:', refund.originalTransaction.snapshotCashierName)
console.log('Refund Processor:', refund.snapshotCashierName)
```

### On Receipts

Both dates can be shown:

```typescript
function formatRefundReceipt(refund: Transaction) {
  return {
    // Inherited snapshots (business context from original)
    businessName: refund.snapshotBusinessName,
    branchName: refund.snapshotBranchName,
    
    // Fresh values (refund-specific)
    refundDate: refund.createdAt,              // ✅ When refund processed
    refundProcessor: refund.snapshotCashierName, // ✅ Who processed it
    
    // Original sale reference
    originalInvoiceNo: refund.originalTransaction.invoiceNo,
    originalSaleDate: refund.originalTransaction.createdAt,
    originalCashier: refund.originalTransaction.snapshotCashierName,
  }
}
```

### BIR Compliance

✅ **Fully compliant** - Both dates tracked:
- Original sale date (from original transaction)
- Refund processing date (from refund transaction `createdAt`)
- Links preserved via `originalTransactionId`

### Summary

**No new field needed** - The existing `createdAt` field on the refund transaction already captures exactly when the refund was processed. Combined with `originalTransactionId`, you have complete date tracking for both the original sale and the refund.

---

## Implementation Details

### Fields to Inherit (8 fields)
Copy these from `originalTransaction`:
1. `snapshotBusinessName`
2. `snapshotBranchName`
3. `snapshotBranchAddress`
4. `snapshotBranchSN`
5. `snapshotBusinessTIN`
6. `snapshotBranchCode`
7. `snapshotIsVATRegistered`
8. `snapshotCurrency`

### Field to Set Fresh (1 field)
Set from current user:
1. `snapshotCashierName` = `currentUser.name` (refund processor)

### Already Captured Automatically
The refund date is **already tracked** by existing Transaction fields:
- `createdAt` - Date/time when refund transaction was created (automatic)
- `type = TransactionType.REFUND` - Identifies this as a refund
- `originalTransactionId` - Links to the original sale

**No additional snapshot field needed for refund date** - the standard `createdAt` timestamp provides this automatically.

---

## Current Code Location

**File**: `web/src/lib/queries/create-pos-refund.ts`
**Function**: `createPosRefund`
**Lines**: ~70-115 (transaction creation)

### Current Behavior (Pre-Phase 3)
```typescript
transactionCollection.insert({
  id: transactionId,
  // ... other fields ...
  cashierId: snapshot.cashierId,  // ❌ Uses original cashier ID
  // No snapshot fields yet (Phase 3 not implemented)
})
```

---

## Required Changes for Phase 3

### Step 1: Update TransactionSnapshot Type

Add Phase 3 snapshot fields to the `TransactionSnapshot` type:

```typescript
export type TransactionSnapshot = {
  id: string
  invoiceNo: string
  // ... existing fields ...
  
  // Phase 3 snapshot fields (from original transaction)
  snapshotBusinessName?: string | null
  snapshotBranchName?: string | null
  snapshotBranchAddress?: string | null
  snapshotBranchSN?: string | null
  snapshotBusinessTIN?: string | null
  snapshotBranchCode?: string | null
  snapshotIsVATRegistered?: string | null
  snapshotCurrency?: string | null
  snapshotCashierName?: string | null  // Will NOT be used (fresh value instead)
}
```

### Step 2: Update Refund Transaction Creation

Modify the `transactionCollection.insert` call in `createPosRefund`:

```typescript
// Get current user for fresh cashier name
const { user } = authStore.state

transactionCollection.insert({
  id: transactionId,
  invoiceNo: refundInvoiceNo,
  type: TransactionType.REFUND,
  originalTransactionId: snapshot.id,
  // ... existing fields ...
  
  // 📸 PHASE 3 SNAPSHOTS - Inherited from original (Option B)
  snapshotBusinessName: snapshot.snapshotBusinessName || null,
  snapshotBranchName: snapshot.snapshotBranchName || null,
  snapshotBranchAddress: snapshot.snapshotBranchAddress || null,
  snapshotBranchSN: snapshot.snapshotBranchSN || null,
  snapshotBusinessTIN: snapshot.snapshotBusinessTIN || null,
  snapshotBranchCode: snapshot.snapshotBranchCode || null,
  snapshotIsVATRegistered: snapshot.snapshotIsVATRegistered || null,
  snapshotCurrency: snapshot.snapshotCurrency || null,
  
  // Fresh value - refund processor (Modification)
  snapshotCashierName: user.name,  // ✅ Current user, NOT original cashier
  
  // ... rest of fields ...
})
```

### Step 3: Update Where Original Transaction is Fetched

The snapshot is passed from the UI. Make sure the UI includes Phase 3 snapshot fields when fetching the transaction:

**File**: Look for where `TransactionSnapshot` is created (likely in a transaction detail component)

```typescript
// When fetching transaction for refund, include Phase 3 snapshots
const transaction = await prisma.transaction.findUnique({
  where: { id: transactionId },
  select: {
    // ... existing fields ...
    
    // Phase 3 snapshot fields
    snapshotBusinessName: true,
    snapshotBranchName: true,
    snapshotBranchAddress: true,
    snapshotBranchSN: true,
    snapshotBusinessTIN: true,
    snapshotBranchCode: true,
    snapshotIsVATRegistered: true,
    snapshotCurrency: true,
    // Note: snapshotCashierName is selected but will be replaced
  }
})
```

---

## Test Implementation

### Test File
`web/__tests__/phase3-snapshots.test.ts`

### Test Case
```typescript
describe('Phase 3: Refund Snapshot Behavior', () => {
  it('refund inherits original snapshots except cashier', async () => {
    // Setup: Create business, branch, and two users
    const business = await createTestBusiness({ name: 'Original Business' })
    const branch = await createTestBranch({ name: 'Original Branch' })
    const cashier1 = await createTestUser({ name: 'Alice Cashier' })
    const cashier2 = await createTestUser({ name: 'Bob Manager' })
    
    // Create original sale transaction with Phase 3 snapshots
    const originalTx = await prisma.transaction.create({
      data: {
        type: TransactionType.SALE,
        businessId: business.id,
        branchId: branch.id,
        cashierId: cashier1.id,
        // ... required fields ...
        
        // Phase 3 snapshots at sale time
        snapshotBusinessName: 'Original Business',
        snapshotBranchName: 'Original Branch',
        snapshotBranchAddress: '123 Original St',
        snapshotBranchSN: 'SN-001',
        snapshotBusinessTIN: '123-456-789-000',
        snapshotBranchCode: '00001',
        snapshotIsVATRegistered: 'true',
        snapshotCurrency: 'PHP',
        snapshotCashierName: 'Alice Cashier',
      }
    })
    
    // Business renames after sale (should NOT affect refund)
    await prisma.business.update({
      where: { id: business.id },
      data: { name: 'New Business Name' }
    })
    
    // Different employee processes refund
    authStore.state.user = { ...cashier2, ... }  // Mock current user
    
    const refundTx = await createPosRefund({
      id: originalTx.id,
      // ... include original transaction snapshot data ...
      snapshotBusinessName: originalTx.snapshotBusinessName,
      snapshotBranchName: originalTx.snapshotBranchName,
      snapshotBranchAddress: originalTx.snapshotBranchAddress,
      snapshotBranchSN: originalTx.snapshotBranchSN,
      snapshotBusinessTIN: originalTx.snapshotBusinessTIN,
      snapshotBranchCode: originalTx.snapshotBranchCode,
      snapshotIsVATRegistered: originalTx.snapshotIsVATRegistered,
      snapshotCurrency: originalTx.snapshotCurrency,
      snapshotCashierName: originalTx.snapshotCashierName,  // Passed but not used
    })
    
    // Verify: Refund inherits business/branch snapshots
    expect(refundTx.snapshotBusinessName).toBe('Original Business')  // NOT 'New Business Name'
    expect(refundTx.snapshotBranchName).toBe('Original Branch')
    expect(refundTx.snapshotBranchAddress).toBe('123 Original St')
    expect(refundTx.snapshotBranchSN).toBe('SN-001')
    expect(refundTx.snapshotBusinessTIN).toBe('123-456-789-000')
    expect(refundTx.snapshotBranchCode).toBe('00001')
    expect(refundTx.snapshotIsVATRegistered).toBe('true')
    expect(refundTx.snapshotCurrency).toBe('PHP')
    
    // Verify: Refund has FRESH cashier name (refund processor)
    expect(refundTx.snapshotCashierName).toBe('Bob Manager')  // ✅ Current user
    expect(refundTx.snapshotCashierName).not.toBe('Alice Cashier')  // ❌ NOT original
  })
  
  it('refund receipt matches original sale receipt except cashier', async () => {
    // Test that receipt printing uses inherited snapshots
    const originalReceipt = await formatReceipt(originalTx)
    const refundReceipt = await formatReceipt(refundTx)
    
    // Business info should match
    expect(refundReceipt.businessName).toBe(originalReceipt.businessName)
    expect(refundReceipt.branchName).toBe(originalReceipt.branchName)
    expect(refundReceipt.tin).toBe(originalReceipt.tin)
    
    // Cashier should differ
    expect(refundReceipt.cashierName).not.toBe(originalReceipt.cashierName)
  })
})
```

---

## Documentation Updates

### Code Comments
Add this comment above the refund snapshot section in `create-pos-refund.ts`:

```typescript
// Phase 3 Refund Snapshot Policy (see REFUND-SNAPSHOT-DECISION.md):
// - Inherit business/branch/TIN/VAT snapshots from original transaction
//   (refund receipt should match original for BIR audit trail)
// - Use FRESH cashier name (accountability for who processed refund)
```

### Phase 3 Execution Plan
The decision is already documented in:
- `HUMAN-DECISIONS-REQUIRED.md` (Decision 2)
- `PHASE-1-AND-3-PATCH.md` (Fix B7)
- This file (`REFUND-SNAPSHOT-DECISION.md`)

---

## BIR Compliance Notes

### Why This Satisfies BIR Requirements
1. **Original Sale Context Preserved**: Refund receipt shows the business/branch state at time of original sale
2. **Refund Authorization Tracked**: Cashier name shows who approved/processed the refund
3. **Clear Audit Trail**: `originalTransactionId` + inherited snapshots link refund to sale
4. **No Retroactive Changes**: Business name changes don't affect historical receipts

### Receipt Behavior
- **Original Sale Receipt**: 
  - Date: 2024-01-15 10:30 AM (original sale `createdAt`)
  - Cashier: Alice Cashier
  - Business: Original Business
- **Refund Receipt**: 
  - Date: 2024-01-20 14:45 PM (refund `createdAt` - 5 days later)
  - Cashier: Bob Manager (refund processor)
  - Business: Original Business (inherited snapshot)
- **Clear Relationship**: Both receipts show same business context, different dates and cashier indicate refund

---

## Implementation Checklist

Phase 3 Step 3 (Update POS Creation):
- [ ] Update `TransactionSnapshot` type with Phase 3 fields
- [ ] Modify `createPosRefund` to inherit 8 fields from snapshot
- [ ] Modify `createPosRefund` to set fresh `snapshotCashierName`
- [ ] Add code comment explaining the policy

Phase 3 Step 6 (Testing):
- [ ] Add test: refund inherits original snapshots except cashier
- [ ] Add test: refund receipt matches original except cashier
- [ ] Verify test passes

Documentation:
- [X] Decision documented in HUMAN-DECISIONS-REQUIRED.md
- [X] Implementation guide created (this file)
- [X] Patch document updated (PHASE-1-AND-3-PATCH.md)
- [ ] Code comments added in implementation

---

## Quick Reference

**Inherit**: Business, Branch, Address, SN, TIN, Code, VAT Status, Currency
**Fresh**: Cashier Name

**Why**: Receipt context from original sale + accountability for refund processor

**BIR**: ✅ Compliant - preserves audit trail while tracking refund authorization

