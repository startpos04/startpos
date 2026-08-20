# Phased Transaction Snapshot Implementation Plan

## Overview

This plan breaks down the snapshot implementation into **3 independent phases**, each deliverable and testable on its own. Each phase can be deployed separately to minimize risk.

## Phase Breakdown

```
Phase 1: OrderItem Core Snapshots (HIGHEST IMPACT)
├── Product, variant, category, SKU
├── Most visible to users (receipts, reports)
└── Estimated: 4 hours

Phase 2: OrderItem Unit & Tax Snapshots
├── Unit details, tax categories
├── Required for compliance
└── Estimated: 2 hours

Phase 3: Transaction Business/Branch Snapshots
├── Business, branch, cashier details
├── Required for receipt reprints
└── Estimated: 3 hours
```

---

## Phase 1: OrderItem Core Snapshots (HIGHEST PRIORITY)

### Why First?
- Directly affects receipts and sales reports (most visible)
- Product/category name changes are most common
- Highest user impact

### Scope

#### OrderItem (6 fields)
```prisma
model OrderItem {
  // ... existing fields ...
  
  // 📸 PHASE 1: Core Product/Variant Snapshots
  snapshotProductName  String? // "Fried Chicken"
  snapshotVariantName  String? // "Large", "Extra Spicy"
  snapshotCategoryName String? // "Main Dishes"
  snapshotSku          String? // "SKU-001"
  snapshotProductType  String? // "PHYSICAL_GOOD", "SERVICE"
  snapshotProductImage String? // Image URL (for digital receipts)
}
```

#### OrderItemAddon (3 fields)
```prisma
model OrderItemAddon {
  // ... existing fields ...
  
  // 📸 PHASE 1: Core Addon Snapshots
  snapshotAddonProductName String? // "Extra Cheese"
  snapshotAddonVariantName String? // "Large"
  snapshotAddonSku         String? // "ADD-001"
}
```

**Total: 9 fields**

### Implementation Steps

#### Step 1.1: Schema Migration (30 min)
- [ ] Add 6 nullable columns to `OrderItem`
- [ ] Add 3 nullable columns to `OrderItemAddon`
- [ ] Generate Prisma migration
- [ ] Run in dev environment
- [ ] Verify migration success

#### Step 1.2: Backfill Script (30 min)
- [ ] Write backfill script for OrderItem
- [ ] Write backfill script for OrderItemAddon
- [ ] Test on sample data (100 records)
- [ ] Run full backfill in dev
- [ ] Verify 100% coverage

#### Step 1.3: Update POS Creation (1.5 hours)
- [ ] Find POS transaction creation code
- [ ] Add snapshot capture logic for OrderItem
- [ ] Add snapshot capture logic for OrderItemAddon
- [ ] Test: Create new transaction
- [ ] Verify snapshots populated

#### Step 1.4: Update Reports (1 hour)
- [ ] Update sales-by-product report
- [ ] Update sales-by-category report
- [ ] Add fallback to live data (for pre-snapshot transactions)
- [ ] Test: Generate reports with mixed data

#### Step 1.5: Update Receipts (30 min)
- [ ] Update receipt template to use snapshots
- [ ] Test: Print new receipt
- [ ] Test: Reprint old receipt

#### Step 1.6: Testing (30 min)
- [ ] Test: Create transaction → Rename product → Verify report unchanged
- [ ] Test: Create transaction → Change category → Verify report unchanged
- [ ] Test: Create transaction with addon → Rename addon → Verify receipt unchanged
- [ ] Test: Delete product variant → Verify transaction still displays

### Success Criteria
- All new transactions have non-null Phase 1 snapshots
- Reports show correct historical product/category names
- Receipts display accurate product info
- No breaking changes to existing functionality

### Estimated Time: 4 hours

---

## Phase 2: OrderItem Unit & Tax Snapshots (COMPLIANCE)

### Why Second?
- Required for BIR tax compliance
- Unit conversions affect inventory tracking
- Less frequently changed than product names

### Scope

#### OrderItem (4 fields)
```prisma
model OrderItem {
  // ... existing fields from Phase 1 ...
  
  // 📸 PHASE 2: Unit & Tax Snapshots
  snapshotUnitName     String?      // "kilogram", "piece"
  snapshotUnitAbbrev   String?      // "kg", "pcs"
  snapshotUnitType     String?      // "WEIGHT", "COUNT"
  snapshotTaxCategory  TaxCategory? // STANDARD, EXEMPT, ZERO_RATED
}
```

#### OrderItemAddon (3 fields)
```prisma
model OrderItemAddon {
  // ... existing fields from Phase 1 ...
  
  // 📸 PHASE 2: Unit & Tax Snapshots
  snapshotAddonUnitName    String?      // "gram"
  snapshotAddonUnitAbbrev  String?      // "g"
  snapshotAddonTaxCategory TaxCategory? // STANDARD, EXEMPT
}
```

**Total: 7 fields**

### Implementation Steps

#### Step 2.1: Schema Migration (15 min)
- [ ] Add 4 nullable columns to `OrderItem`
- [ ] Add 3 nullable columns to `OrderItemAddon`
- [ ] Generate Prisma migration
- [ ] Run in dev environment

#### Step 2.2: Backfill Script (20 min)
- [ ] Update backfill script for new fields
- [ ] Run backfill in dev
- [ ] Verify 100% coverage

#### Step 2.3: Update POS Creation (30 min)
- [ ] Add unit & tax snapshot capture to POS logic
- [ ] Test: Create new transaction
- [ ] Verify all snapshots populated

#### Step 2.4: Update Tax Reports (30 min)
- [ ] Update tax calculation reports to use snapshotTaxCategory
- [ ] Update BIR compliance reports
- [ ] Test: Generate tax reports

#### Step 2.5: Update Receipt Unit Display (15 min)
- [ ] Update receipt to use snapshotUnitAbbrev
- [ ] Test: Print receipt with unit abbreviations

#### Step 2.6: Testing (30 min)
- [ ] Test: Create transaction → Change unit name → Verify receipt unchanged
- [ ] Test: Create transaction → Change tax category → Verify tax report unchanged
- [ ] Test: Create transaction → Change unit conversion → Verify calculations correct

### Success Criteria
- All new transactions have non-null Phase 2 snapshots
- Tax reports use historical tax categories
- Unit changes don't affect historical transactions
- BIR compliance maintained

### Estimated Time: 2 hours

---

## Phase 3: Transaction Business/Branch Snapshots (RECEIPT REPRINTS)

### Why Third?
- Required for accurate receipt reprints
- Business/branch details change less frequently
- Can be deployed independently

### Scope

#### Transaction (11 fields)
```prisma
model Transaction {
  // ... existing fields ...
  
  // 📸 PHASE 3: Business, Branch & Cashier Snapshots
  snapshotBusinessName    String? // Business name at time of sale
  snapshotBranchName      String? // Branch name
  snapshotBranchAddress   String? // Branch address
  snapshotBranchSN        String? // Serial Number (BIR)
  snapshotBusinessTIN     String? // TIN from ComplianceRegistry
  snapshotBranchCode      String? // Branch code suffix
  snapshotVATRate         String? // VAT percentage from SystemConfig
  snapshotIsVATRegistered String? // VAT registration status
  snapshotPriceConfig     String? // INCLUSIVE or EXCLUSIVE
  snapshotCurrency        String? // "PHP"
  snapshotCashierName     String? // Cashier name
}
```

**Total: 11 fields**

### Implementation Steps

#### Step 3.1: Schema Migration (15 min)
- [ ] Add 11 nullable columns to `Transaction`
- [ ] Generate Prisma migration
- [ ] Run in dev environment

#### Step 3.2: Backfill Script (45 min)
- [ ] Write complex backfill script (fetches Business, Branch, User, SystemConfig, ComplianceRegistry)
- [ ] Test on sample data
- [ ] Run full backfill in dev
- [ ] Verify 100% coverage

#### Step 3.3: Update POS Creation (45 min)
- [ ] Add business/branch snapshot capture to transaction creation
- [ ] Fetch SystemConfig values (VAT_RATE, PRICE_CONFIGURATION, CURRENCY)
- [ ] Fetch ComplianceRegistry (BIR_TIN)
- [ ] Test: Create new transaction
- [ ] Verify all snapshots populated

#### Step 3.4: Update Receipt Reprints (30 min)
- [ ] Update receipt header to use snapshot business/branch info
- [ ] Update receipt footer to use snapshot TIN/SN
- [ ] Test: Reprint old receipt
- [ ] Verify shows original business name

#### Step 3.5: Update Tax Reports (15 min)
- [ ] Update BIR reports to use snapshot TIN
- [ ] Test: Generate BIR report

#### Step 3.6: Testing (30 min)
- [ ] Test: Create transaction → Rename business → Verify reprint unchanged
- [ ] Test: Create transaction → Update branch address → Verify receipt unchanged
- [ ] Test: Create transaction → Change VAT rate → Verify historical transactions unaffected
- [ ] Test: Create transaction → Delete cashier → Verify transaction shows cashier name

### Success Criteria
- All new transactions have non-null Phase 3 snapshots
- Receipt reprints show accurate historical business/branch info
- VAT rate changes don't affect historical transactions
- Cashier audit trail maintained

### Estimated Time: 3 hours

---

## Optional Phase 4: Service Duration Snapshot (FUTURE)

### Scope
Only needed if you have service-based businesses (clinics, salons, spas).

#### OrderItem (1 field)
```prisma
model OrderItem {
  // ... existing fields ...
  
  // 📸 PHASE 4: Service Duration Snapshot
  snapshotDurationMinutes Int? // Service duration at time of booking
}
```

**Total: 1 field**

### When to Implement
- After Phase 1-3 are complete
- If service businesses start using the system
- If duration-based pricing becomes critical

### Estimated Time: 1 hour

---

## Overall Timeline

| Phase | Scope | Time | Can Deploy Independently? |
|-------|-------|------|---------------------------|
| **Phase 1** | OrderItem core (product, variant, category) | 4 hours | ✅ Yes |
| **Phase 2** | OrderItem units & tax | 2 hours | ✅ Yes |
| **Phase 3** | Transaction business/branch | 3 hours | ✅ Yes |
| **Phase 4** | Service duration (optional) | 1 hour | ✅ Yes |
| **Total** | All phases | 9-10 hours | - |

---

## Deployment Strategy

### Option A: Deploy Each Phase Separately (RECOMMENDED)
```
Week 1: Phase 1 → Deploy → Monitor → Verify
Week 2: Phase 2 → Deploy → Monitor → Verify
Week 3: Phase 3 → Deploy → Monitor → Verify
```

**Pros:**
- Lower risk (smaller changes)
- Easier to debug issues
- Can pause if problems arise
- Progressive value delivery

**Cons:**
- Takes 3 weeks total
- More deployment overhead

### Option B: Deploy All at Once
```
Week 1: Phase 1+2+3 → Deploy → Monitor
```

**Pros:**
- Faster completion
- Single deployment
- All issues resolved together

**Cons:**
- Higher risk
- Harder to debug if issues
- Larger migration/backfill

### Recommendation
**Use Option A (phased deployment)** because:
- You have existing production data
- Each phase is independently valuable
- Easier to roll back if needed
- More time to test each phase

---

## Pre-Implementation Checklist

Before starting Phase 1:
- [ ] Review this plan with team
- [ ] Set up staging environment
- [ ] Back up production database
- [ ] Schedule low-traffic window for backfills
- [ ] Prepare rollback plan
- [ ] Set up monitoring alerts

---

## Rollback Plan

### If Issues Found in Phase N:
1. **Schema**: Keep new columns (nullable, won't hurt)
2. **Code**: Revert POS creation changes
3. **Reports**: Revert to use live data joins
4. **Backfill**: Can be re-run anytime

**No data loss risk** — all changes are additive and nullable.

---

## Monitoring & Validation

### After Each Phase

#### Automated Checks
- [ ] Snapshot coverage metric: `SELECT COUNT(*) WHERE snapshotProductName IS NULL`
- [ ] Alert if new transactions missing snapshots
- [ ] Monitor backfill progress

#### Manual Validation
- [ ] Create test transaction
- [ ] Verify snapshots populated
- [ ] Change master data
- [ ] Verify reports unchanged
- [ ] Print/reprint receipts

---

## Success Metrics

### Phase 1 Success
- [ ] 100% of new transactions have product/category snapshots
- [ ] Sales reports show historical product names
- [ ] Product renames don't affect historical data

### Phase 2 Success
- [ ] 100% of new transactions have unit/tax snapshots
- [ ] Tax reports show historical tax categories
- [ ] Unit changes don't affect historical data

### Phase 3 Success
- [ ] 100% of new transactions have business/branch snapshots
- [ ] Receipt reprints show original business names
- [ ] VAT rate changes don't affect historical data

---

## Next Steps

**Ready to start Phase 1?**

1. ✅ Review this phased plan
2. ⏳ Approve Phase 1 scope
3. ⏳ Start with schema migration
4. ⏳ Run backfill in dev
5. ⏳ Update POS creation code

Let me know when you're ready to begin Phase 1, and I'll guide you through each step! 🚀
