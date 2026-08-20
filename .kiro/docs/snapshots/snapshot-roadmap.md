# Transaction Snapshot Implementation Roadmap

## Visual Timeline

```
┌────────────────────────────────────────────────────────────────────┐
│                    PHASED IMPLEMENTATION                            │
└────────────────────────────────────────────────────────────────────┘

Week 1: PHASE 1 - OrderItem Core Snapshots (4 hours)
┌──────────────────────────────────────────────────────────────┐
│  ✅ DELIVERABLE: Product/Category/SKU snapshots              │
│  📊 IMPACT: Sales reports, receipts show accurate history    │
│                                                               │
│  OrderItem (6 fields):                                        │
│    • snapshotProductName     "Fried Chicken"                 │
│    • snapshotVariantName     "Large"                         │
│    • snapshotCategoryName    "Main Dishes"                   │
│    • snapshotSku             "SKU-001"                       │
│    • snapshotProductType     "PHYSICAL_GOOD"                 │
│    • snapshotProductImage    "https://..."                   │
│                                                               │
│  OrderItemAddon (3 fields):                                   │
│    • snapshotAddonProductName "Extra Cheese"                 │
│    • snapshotAddonVariantName "Large"                        │
│    • snapshotAddonSku         "ADD-001"                      │
│                                                               │
│  ✓ Can deploy independently                                  │
│  ✓ Most visible impact to users                              │
│  ✓ Lowest risk (simple string fields)                        │
└──────────────────────────────────────────────────────────────┘

Week 2: PHASE 2 - Unit & Tax Snapshots (2 hours)
┌──────────────────────────────────────────────────────────────┐
│  ✅ DELIVERABLE: Unit & tax compliance snapshots             │
│  📊 IMPACT: Tax reports, BIR compliance accurate             │
│                                                               │
│  OrderItem (4 fields):                                        │
│    • snapshotUnitName        "kilogram"                      │
│    • snapshotUnitAbbrev      "kg"                            │
│    • snapshotUnitType        "WEIGHT"                        │
│    • snapshotTaxCategory     STANDARD                        │
│                                                               │
│  OrderItemAddon (3 fields):                                   │
│    • snapshotAddonUnitName   "gram"                          │
│    • snapshotAddonUnitAbbrev "g"                             │
│    • snapshotAddonTaxCategory STANDARD                       │
│                                                               │
│  ✓ Can deploy independently                                  │
│  ✓ Builds on Phase 1                                         │
│  ✓ Critical for compliance                                   │
└──────────────────────────────────────────────────────────────┘

Week 3: PHASE 3 - Business/Branch Snapshots (3 hours)
┌──────────────────────────────────────────────────────────────┐
│  ✅ DELIVERABLE: Business/branch/cashier snapshots           │
│  📊 IMPACT: Receipt reprints, BIR audit trail                │
│                                                               │
│  Transaction (11 fields):                                     │
│    • snapshotBusinessName    "My Store"                      │
│    • snapshotBranchName      "Main Branch"                   │
│    • snapshotBranchAddress   "123 Main St"                   │
│    • snapshotBranchSN        "SN-001"                        │
│    • snapshotBusinessTIN     "123-456-789-000"               │
│    • snapshotBranchCode      "00001"                         │
│    • snapshotVATRate         "12"                            │
│    • snapshotIsVATRegistered "true"                          │
│    • snapshotPriceConfig     "INCLUSIVE"                     │
│    • snapshotCurrency        "PHP"                           │
│    • snapshotCashierName     "John Doe"                      │
│                                                               │
│  ✓ Can deploy independently                                  │
│  ✓ Most complex (multiple table lookups)                     │
│  ✓ Completes the snapshot system                             │
└──────────────────────────────────────────────────────────────┘

Future: PHASE 4 - Service Duration (1 hour) [OPTIONAL]
┌──────────────────────────────────────────────────────────────┐
│  ✅ DELIVERABLE: Service duration snapshot                   │
│  📊 IMPACT: Service booking accuracy                         │
│                                                               │
│  OrderItem (1 field):                                         │
│    • snapshotDurationMinutes 60                              │
│                                                               │
│  ✓ Only if service businesses use system                     │
│  ✓ Can be added anytime later                                │
└──────────────────────────────────────────────────────────────┘
```

## Quick Comparison

| Aspect | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| **Fields** | 9 | 7 | 11 |
| **Tables** | OrderItem, OrderItemAddon | OrderItem, OrderItemAddon | Transaction |
| **Time** | 4 hours | 2 hours | 3 hours |
| **Impact** | High (receipts, reports) | High (compliance) | Medium (reprints) |
| **Risk** | Low | Low | Medium |
| **Complexity** | Simple strings | Simple strings + enum | Complex (multiple lookups) |
| **User Visible** | Very | Moderate | Low |
| **Can Skip?** | ❌ No | ❌ No | ⚠️ Yes (but not recommended) |

## Phase-by-Phase Value

### After Phase 1 ✅
**You Get:**
- Product renames don't break historical reports
- Category changes don't affect sales analysis
- SKU reassignments tracked correctly
- Addon changes preserved
- **User Impact**: Immediately visible in receipts/reports

### After Phase 2 ✅✅
**You Get:**
- Everything from Phase 1, plus:
- Unit changes don't break inventory reports
- Tax category changes don't affect compliance
- BIR audit ready for tax calculations
- **User Impact**: Tax reports accurate, compliance maintained

### After Phase 3 ✅✅✅
**You Get:**
- Everything from Phase 1 & 2, plus:
- Receipt reprints show original business name
- Branch renames don't affect historical receipts
- VAT rate changes don't retroactively apply
- Cashier audit trail preserved
- **User Impact**: Complete historical accuracy

## Decision Tree

```
Do you need accurate historical reports?
│
├─ YES → Start Phase 1 (4 hours)
│         │
│         └─ Do you need tax compliance?
│             │
│             ├─ YES → Continue to Phase 2 (2 hours)
│             │         │
│             │         └─ Do you need receipt reprints?
│             │             │
│             │             ├─ YES → Continue to Phase 3 (3 hours)
│             │             │         └─ DONE! (9 hours total)
│             │             │
│             │             └─ NO → Stop at Phase 2 (6 hours total)
│             │
│             └─ NO → Stop at Phase 1 (4 hours)
│
└─ NO → Don't implement snapshots
          (but you'll have audit issues!)
```

## Recommended Path

```
✅ Phase 1: MUST DO
   └─ Highest impact, most visible to users
   
✅ Phase 2: MUST DO
   └─ Required for BIR compliance
   
✅ Phase 3: STRONGLY RECOMMENDED
   └─ Completes the audit trail
   
⚠️ Phase 4: OPTIONAL
   └─ Only for service businesses
```

## Risk Assessment by Phase

| Phase | Risk Level | Why |
|-------|-----------|------|
| Phase 1 | 🟢 Low | Simple string fields, high user value |
| Phase 2 | 🟢 Low | Simple fields, builds on Phase 1 pattern |
| Phase 3 | 🟡 Medium | Multiple table joins, more complex backfill |
| Phase 4 | 🟢 Low | Single field, optional |

## Testing Strategy

### Phase 1 Testing
1. Create transaction with product "Chicken"
2. Rename product to "Fried Chicken"
3. Run sales report → Should show "Chicken" for old transactions
4. Print receipt → Should show "Chicken"

### Phase 2 Testing
1. Create transaction with unit "kilogram"
2. Change unit name to "kg"
3. Run reports → Should show "kilogram" for old transactions
4. Change tax category STANDARD → EXEMPT
5. Run tax report → Old transactions still STANDARD

### Phase 3 Testing
1. Create transaction at "Main Branch"
2. Rename branch to "SM Branch"
3. Reprint receipt → Should show "Main Branch"
4. Change VAT rate 12% → 15%
5. Old transactions still show 12% VAT

## Deployment Windows

### Best Time to Deploy Each Phase

| Phase | Best Time | Why |
|-------|-----------|-----|
| Phase 1 | Any time | Low risk, high value |
| Phase 2 | Any time | Low risk, builds on Phase 1 |
| Phase 3 | Low-traffic window | Backfill is more complex |

### Suggested Schedule

**Option A: Aggressive (3 days)**
- Monday: Phase 1
- Wednesday: Phase 2
- Friday: Phase 3

**Option B: Conservative (3 weeks)**
- Week 1: Phase 1 → Monitor for 1 week
- Week 2: Phase 2 → Monitor for 1 week
- Week 3: Phase 3 → Monitor for 1 week

**Option C: Recommended (1.5 weeks)**
- Monday: Phase 1 → Monitor
- Wednesday: Phase 2 → Monitor
- Next Monday: Phase 3 → Monitor

## Current Status

```
[ ] Phase 1: OrderItem Core Snapshots (4 hours)
    [ ] Schema migration
    [ ] Backfill script
    [ ] Update POS creation
    [ ] Update reports
    [ ] Testing

[ ] Phase 2: Unit & Tax Snapshots (2 hours)
    [ ] Schema migration
    [ ] Backfill script
    [ ] Update POS creation
    [ ] Update tax reports
    [ ] Testing

[ ] Phase 3: Business/Branch Snapshots (3 hours)
    [ ] Schema migration
    [ ] Backfill script
    [ ] Update POS creation
    [ ] Update receipts
    [ ] Testing

[ ] Phase 4: Service Duration (1 hour) [OPTIONAL]
    [ ] Schema migration
    [ ] Backfill script
    [ ] Update booking logic
    [ ] Testing
```

## Next Action

**👉 Ready to start Phase 1?**

Review `PHASED-SNAPSHOT-PLAN.md` for detailed steps, then let me know and I'll help you:
1. Create the schema migration
2. Write the backfill script
3. Update the POS creation logic
4. Update reports and receipts
5. Write tests

Let's do this! 🚀
