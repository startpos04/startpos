# Transaction Snapshot Implementation Plan

## What We're Solving

When users change product names, categories, units, tax rates, or business info, historical transactions currently show the **NEW** values instead of what was actually sold. This breaks:
- BIR audit compliance (immutable record requirement)
- Receipt reprints (can't reproduce original receipts)
- Sales reports (wrong product/category names in historical data)
- Tax calculations (retroactive tax rate changes)

## Complete Snapshot Inventory

### 🔴 CRITICAL: Must Implement

#### 1. **OrderItem Snapshots** (10 fields)
Product line item details that appear on receipts and reports:
- `snapshotProductName` — "Fried Chicken"
- `snapshotVariantName` — "Large", "Extra Spicy"
- `snapshotCategoryName` — "Main Dishes"
- `snapshotSku` — Product SKU
- `snapshotUnitName` — "kilogram"
- `snapshotUnitAbbrev` — "kg"
- `snapshotUnitType` — "WEIGHT"
- `snapshotTaxCategory` — STANDARD, EXEMPT
- `snapshotProductType` — PHYSICAL_GOOD, SERVICE
- `snapshotDurationMinutes` — Service duration (clinics/salons)

#### 2. **OrderItemAddon Snapshots** (6 fields)
Addon/modifier details:
- `snapshotAddonProductName` — "Extra Cheese"
- `snapshotAddonVariantName` — "Large"
- `snapshotAddonSku`
- `snapshotAddonUnitName` — "gram"
- `snapshotAddonUnitAbbrev` — "g"
- `snapshotAddonTaxCategory`

#### 3. **Transaction Business/Branch Snapshots** (11 fields)
Required for receipt reprints and BIR compliance:
- `snapshotBusinessName` — Business name at sale time
- `snapshotBranchName` — Branch name
- `snapshotBranchAddress` — Printed on receipts
- `snapshotBranchSN` — Serial Number (BIR requirement)
- `snapshotBusinessTIN` — TIN from ComplianceRegistry
- `snapshotBranchCode` — Branch code suffix
- `snapshotVATRate` — VAT % from SystemConfig
- `snapshotIsVATRegistered` — VAT registration status
- `snapshotPriceConfig` — INCLUSIVE/EXCLUSIVE
- `snapshotCurrency` — "PHP"
- `snapshotCashierName` — Cashier name at sale time

**Total: 27 new nullable columns**

### ✅ Already Captured (No Action Needed)
- `OrderItem.unitPrice` — Price at sale
- `OrderItem.unitCost` — Cost at sale
- `Transaction.totalAmount` — Total charged
- `Transaction.totalCost` — Total cost
- `Transaction.bufferRate` — Buffer rate snapshot
- `Transaction.taxAmount` — Tax amount
- `Transaction.buyerName/TaxId/Address` — Customer info

### 🟡 Skip for Now
- Payment method names (stable enums)
- Inventory/Location details (not customer-facing)
- Supplier info (different domain)

## Implementation Steps

### Phase 1: Schema Changes (30 min)
1. Add 27 nullable columns across 3 models
2. Create Prisma migration
3. Run migration in dev environment

### Phase 2: Backfill Existing Data (1 hour)
1. Write backfill script to populate snapshots for existing transactions
2. Use current master data values as snapshots
3. Run backfill in dev, then production

### Phase 3: Update Transaction Creation (2 hours)
1. Update POS transaction creation to capture all snapshots
2. Fetch related data (business, branch, product, category, unit, config)
3. Populate snapshot fields on OrderItem and Transaction creation

### Phase 4: Update Reports & Receipts (3 hours)
1. Update all sales reports to use snapshot fields instead of joins
2. Update receipt printing to use snapshots
3. Update refund logic to use snapshots
4. Add fallback to live data for pre-snapshot transactions

### Phase 5: Testing (2 hours)
1. Create transaction → change product name → verify report shows original
2. Create transaction → change category → verify unchanged
3. Create transaction → change tax rate → verify historical unaffected
4. Create transaction → delete product → verify still displays
5. Reprint old receipt → verify shows original business name

### Phase 6: Monitoring (30 min)
1. Add alert for new transactions missing snapshots
2. Add metric dashboard for snapshot coverage %

## Estimated Time: 8-9 hours total

## Database Impact

### Storage
- **~600 MB** for 1 million transactions (negligible)
- Average ~150 bytes per OrderItem snapshot
- Average ~200 bytes per Transaction snapshot

### Performance
- No performance impact (nullable text columns)
- Backfill will lock tables briefly (run during low-traffic period)
- Reports may be faster (no joins to master tables)

## Rollout Plan

### Development
1. ✅ Create implementation plan (this document)
2. ✅ Create detailed audit (transaction-snapshot-audit.md)
3. ⏳ Run migration in dev
4. ⏳ Run backfill in dev
5. ⏳ Test thoroughly

### Staging
1. Deploy migration
2. Run backfill
3. Test end-to-end flows

### Production
1. Schedule maintenance window (optional, migration is non-breaking)
2. Deploy migration
3. Run backfill (monitor progress)
4. Verify no errors
5. Monitor snapshot coverage metric

## Risk Assessment

### Low Risk ✅
- All columns are nullable (backward compatible)
- Existing code continues to work
- Can rollback migration if needed
- Backfill can be re-run if incomplete

### Mitigation
- Test backfill on copy of production data first
- Run backfill in batches (1000 records at a time)
- Add progress logging
- Keep original foreign keys (snapshot is additive)

## Success Criteria

- [ ] All new transactions have non-null snapshot fields
- [ ] Backfill covers 100% of existing transactions
- [ ] Reports use snapshot fields for historical accuracy
- [ ] Receipt reprints show original business/product names
- [ ] Refunds use snapshot data for accuracy
- [ ] Tests pass for all snapshot scenarios
- [ ] Monitoring alerts configured

## Next Steps

**Ready to proceed?** Review this plan and confirm:
1. Are all snapshot fields identified?
2. Any additional fields to snapshot?
3. Should we implement in phases or all at once?
4. Any concerns about the approach?

Once approved, we'll start with Phase 1: Schema Changes.
