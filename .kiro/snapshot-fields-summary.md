# Transaction Snapshot Fields - Quick Reference

## Visual Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         TRANSACTION                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📸 NEW SNAPSHOTS (11 fields)                             │   │
│  │  • snapshotBusinessName                                   │   │
│  │  • snapshotBranchName, Address, SN                       │   │
│  │  • snapshotBusinessTIN, BranchCode                       │   │
│  │  • snapshotVATRate, IsVATRegistered                      │   │
│  │  • snapshotPriceConfig, Currency                         │   │
│  │  • snapshotCashierName                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ✅ Already Captured:                                            │
│     • totalAmount, totalCost, bufferRate                         │
│     • taxAmount, discount                                        │
│     • buyerName, buyerTaxId, buyerAddress                       │
└───────────────────────────────────────────────────────────────── ┘

┌─────────────────────────────────────────────────────────────────┐
│                        ORDER ITEM                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📸 NEW SNAPSHOTS (10 fields)                             │   │
│  │  Product Details:                                         │   │
│  │  • snapshotProductName     "Fried Chicken"               │   │
│  │  • snapshotVariantName     "Large"                       │   │
│  │  • snapshotCategoryName    "Main Dishes"                 │   │
│  │  • snapshotSku             "SKU-001"                     │   │
│  │  • snapshotProductType     "PHYSICAL_GOOD"               │   │
│  │                                                            │   │
│  │  Unit Details:                                            │   │
│  │  • snapshotUnitName        "kilogram"                    │   │
│  │  • snapshotUnitAbbrev      "kg"                          │   │
│  │  • snapshotUnitType        "WEIGHT"                      │   │
│  │                                                            │   │
│  │  Tax & Compliance:                                        │   │
│  │  • snapshotTaxCategory     STANDARD/EXEMPT               │   │
│  │                                                            │   │
│  │  Optional (Services):                                     │   │
│  │  • snapshotDurationMinutes 60                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ✅ Already Captured:                                            │
│     • unitPrice, unitCost, quantity                              │
└───────────────────────────────────────────────────────────────── ┘

┌─────────────────────────────────────────────────────────────────┐
│                    ORDER ITEM ADDON                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📸 NEW SNAPSHOTS (6 fields)                              │   │
│  │  • snapshotAddonProductName  "Extra Cheese"              │   │
│  │  • snapshotAddonVariantName  "Large"                     │   │
│  │  • snapshotAddonSku          "ADD-001"                   │   │
│  │  • snapshotAddonUnitName     "gram"                      │   │
│  │  • snapshotAddonUnitAbbrev   "g"                         │   │
│  │  • snapshotAddonTaxCategory  STANDARD                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ✅ Already Captured:                                            │
│     • priceAtSale, costAtSale, quantity                          │
└───────────────────────────────────────────────────────────────── ┘
```

## Why Each Field Matters

### Transaction Level

| Field | Used By | Why Snapshot |
|-------|---------|--------------|
| snapshotBusinessName | Receipt reprints, reports | Business might rebrand |
| snapshotBranchName | Receipt reprints, reports | Branch might rename |
| snapshotBranchAddress | Receipts | Address changes |
| snapshotBranchSN | BIR compliance | Required for audit trail |
| snapshotBusinessTIN | BIR compliance, receipts | TIN must be immutable |
| snapshotBranchCode | BIR compliance | Branch code for TIN |
| snapshotVATRate | Tax calculations, reports | VAT rate changes over time |
| snapshotIsVATRegistered | Tax compliance | Registration status changes |
| snapshotPriceConfig | Receipt formatting | INCLUSIVE vs EXCLUSIVE |
| snapshotCurrency | Receipt formatting | Currency changes (rare but possible) |
| snapshotCashierName | Audit trail | Cashier account might be deleted/renamed |

### OrderItem Level

| Field | Used By | Why Snapshot |
|-------|---------|--------------|
| snapshotProductName | Receipts, reports, refunds | Products rename frequently |
| snapshotVariantName | Receipts, reports | Variant names change |
| snapshotCategoryName | Sales-by-category reports | Category names change |
| snapshotSku | Inventory tracking, reports | SKUs might be reassigned |
| snapshotUnitName | Receipts, reports | Unit names for display |
| snapshotUnitAbbrev | Receipts | Short form for printing |
| snapshotUnitType | Reports, analytics | Unit categorization |
| snapshotTaxCategory | Tax reports, BIR compliance | Tax categories change (e.g., STANDARD → EXEMPT) |
| snapshotProductType | Reports, analytics | Product type for categorization |
| snapshotDurationMinutes | Service bookings | Service duration changes |

### OrderItemAddon Level

| Field | Used By | Why Snapshot |
|-------|---------|--------------|
| snapshotAddonProductName | Receipts, reports | Addon names change |
| snapshotAddonVariantName | Receipts | Variant names change |
| snapshotAddonSku | Inventory, reports | SKUs might be reassigned |
| snapshotAddonUnitName | Receipts | Unit display |
| snapshotAddonUnitAbbrev | Receipts | Short form |
| snapshotAddonTaxCategory | Tax reports | Tax category changes |

## Real-World Examples

### Example 1: Product Rename
**Scenario**: You rename "Fried Chicken" → "Crispy Fried Chicken"

**Without Snapshot**:
- All past transactions now show "Crispy Fried Chicken"
- Sales reports are misleading
- Customer says "I bought Fried Chicken" but system shows "Crispy"

**With Snapshot**:
- Past transactions still show "Fried Chicken"
- Reports are historically accurate
- Can track "when did we rebrand this?"

### Example 2: Tax Rate Change
**Scenario**: Government changes VAT from 12% → 15%

**Without Snapshot**:
- All past transactions retroactively show 15% VAT
- Tax reports are incorrect
- BIR audit fails (incorrect historical tax amounts)

**With Snapshot**:
- Past transactions still show 12% VAT
- Tax reports are accurate
- BIR audit passes

### Example 3: Branch Rename
**Scenario**: "Main Branch" → "SM North Branch"

**Without Snapshot**:
- Reprinting old receipts shows "SM North Branch"
- Customer confused ("I bought this at Main Branch")
- Receipt doesn't match original

**With Snapshot**:
- Old receipts still show "Main Branch"
- Accurate reprints
- Happy customers

## Database Schema Preview

```prisma
model Transaction {
  // ... existing fields ...
  
  // 📸 NEW: Business & Branch Snapshots
  snapshotBusinessName    String?
  snapshotBranchName      String?
  snapshotBranchAddress   String?
  snapshotBranchSN        String?
  snapshotBusinessTIN     String?
  snapshotBranchCode      String?
  snapshotVATRate         String?
  snapshotIsVATRegistered String?
  snapshotPriceConfig     String?
  snapshotCurrency        String?
  snapshotCashierName     String?
}

model OrderItem {
  // ... existing fields ...
  
  // 📸 NEW: Product & Variant Snapshots
  snapshotProductName     String?
  snapshotVariantName     String?
  snapshotCategoryName    String?
  snapshotSku             String?
  snapshotUnitName        String?
  snapshotUnitAbbrev      String?
  snapshotUnitType        String?
  snapshotTaxCategory     TaxCategory?
  snapshotProductType     String?
  snapshotDurationMinutes Int?
}

model OrderItemAddon {
  // ... existing fields ...
  
  // 📸 NEW: Addon Snapshots
  snapshotAddonProductName String?
  snapshotAddonVariantName String?
  snapshotAddonSku         String?
  snapshotAddonUnitName    String?
  snapshotAddonUnitAbbrev  String?
  snapshotAddonTaxCategory TaxCategory?
}
```

## Migration Checklist

- [ ] Phase 1: Add nullable columns (30 min)
- [ ] Phase 2: Backfill existing data (1 hour)
- [ ] Phase 3: Update POS creation logic (2 hours)
- [ ] Phase 4: Update reports & receipts (3 hours)
- [ ] Phase 5: Testing (2 hours)
- [ ] Phase 6: Monitoring (30 min)

**Total: 8-9 hours**

## References

- **SNAPSHOT-IMPLEMENTATION-PLAN.md** — Executive summary & rollout plan
- **transaction-snapshot-audit.md** — Detailed analysis
- **transaction-snapshot-implementation.md** — Code examples

## Questions?

Review the implementation plan and audit documents. Ready to proceed when you approve!
