# Comprehensive Transaction Snapshot Audit

## Executive Summary

This document identifies ALL data that should be snapshotted at transaction time to ensure historical accuracy. The goal is to implement this **once** and never have to revisit it.

## Snapshot Philosophy

**Rule**: If a field can be changed by a user AFTER a transaction is created, and that field appears on receipts, reports, or affects financial/tax calculations, it MUST be snapshotted.

## Complete Snapshot Inventory

### 1. Transaction-Level Snapshots

#### ✅ Already Snapshotted at Transaction Level
```prisma
model Transaction {
  totalAmount Int // ✅ Captured
  totalCost   Int // ✅ Captured
  bufferRate  Int // ✅ Captured at time of sale
  taxAmount   Int // ✅ Captured
  discount    Int // ✅ Captured
  
  // Buyer info (for compliance)
  buyerName    String?   // ✅ Captured (won't change if customer record changes)
  buyerTaxId   String?   // ✅ Captured
  buyerAddress String?   // ✅ Captured
}
```

#### ⚠️ MISSING: Business & Branch Snapshots
**Problem**: If business/branch name or compliance info changes, receipts/reports show new values.

```prisma
model Transaction {
  // ... existing fields ...
  
  // --- BUSINESS & BRANCH SNAPSHOTS (NEW) ---
  // Required for receipt reprints and compliance audits
  snapshotBusinessName   String?  // Business name at time of sale
  snapshotBranchName     String?  // Branch name at time of sale
  snapshotBranchAddress  String?  // Branch address (printed on receipts)
  snapshotBranchSN       String?  // Serial Number (BIR requirement)
  snapshotBusinessTIN    String?  // TIN at time of sale (from ComplianceRegistry)
  snapshotBranchCode     String?  // Branch code suffix for TIN
  
  // Tax configuration at time of sale
  snapshotVATRate        String?  // VAT rate percentage (from SystemConfig)
  snapshotIsVATRegistered String? // Whether business was VAT-registered
  snapshotPriceConfig    String?  // INCLUSIVE or EXCLUSIVE (from SystemConfig)
  snapshotCurrency       String?  // Currency code (from SystemConfig)
  snapshotLocale         String?  // Locale for formatting (from SystemConfig)
}
```

**Why These Matter:**
- Receipt reprints must show the exact business/branch name from when the sale happened
- BIR compliance requires TIN and serial number to be immutable
- Tax rate changes must not retroactively affect past transactions
- Refunds need to credit the exact amount using original tax configuration

#### ⚠️ MISSING: User/Cashier Snapshots
**Problem**: If cashier name changes or account is deleted, historical records lose context.

```prisma
model Transaction {
  // ... existing fields ...
  
  // --- USER SNAPSHOTS (NEW) ---
  snapshotCashierName    String? // Cashier name at time of sale
  snapshotCashierEmail   String? // Cashier email for audit trail
  snapshotProviderName   String? // Service provider name (for clinics/salons)
}
```

---

### 2. OrderItem-Level Snapshots (LINE ITEMS)

#### ✅ Already Captured
```prisma
model OrderItem {
  unitPrice Int // ✅ Price at time of sale
  unitCost  Int // ✅ Cost at time of sale
  quantity  Float // ✅ Transaction-specific
}
```

#### ❌ CRITICAL MISSING: Product & Variant Snapshots

```prisma
model OrderItem {
  id String @id @default(cuid())

  orderId String
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  variantId String
  variant   ProductVariant @relation(fields: [variantId], references: [id])
  quantity  Float

  unitPrice Int
  unitCost  Int @default(0)

  unitId String
  unit   Unit   @relation(fields: [unitId], references: [id])

  // --- PRODUCT & VARIANT SNAPSHOTS (NEW) ---
  // Core identification
  snapshotProductName      String? // "Fried Chicken"
  snapshotVariantName      String? // "Large", "Extra Spicy", null for default variant
  snapshotCategoryName     String? // "Main Dishes" — for sales-by-category reports
  snapshotSku              String? // SKU at time of sale
  snapshotProductImage     String? // Product image URL (for digital receipt displays)
  
  // Unit information
  snapshotUnitName         String? // "kilogram", "piece"
  snapshotUnitAbbrev       String? // "kg", "pcs"
  snapshotUnitType         String? // "WEIGHT", "COUNT" (store as string to avoid enum issues)
  snapshotUnitConversion   Float?  // Conversion factor at time of sale
  
  // Tax & Compliance
  snapshotTaxCategory      TaxCategory? // STANDARD, EXEMPT, ZERO_RATED
  
  // Product metadata (helpful for reports/analytics)
  snapshotProductType      String? // "PHYSICAL_GOOD", "SERVICE", "RAW_MATERIAL"
  snapshotAttributeType    String? // "SIZE", "FLAVOR", etc.
  
  // Service-specific (for clinics/salons)
  snapshotDurationMinutes  Int?    // Service duration at time of booking

  selectedAddons OrderItemAddon[]

  businessId String
  business   Business @relation(fields: [businessId], references: [id])
  branchId   String
  branch     Branch   @relation(fields: [branchId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([orderId])
  @@index([businessId, orderId])
  @@map("order_items")
}
```

---

### 3. OrderItemAddon Snapshots (ADDONS/MODIFIERS)

#### ✅ Already Captured
```prisma
model OrderItemAddon {
  priceAtSale Int // ✅ Price at time of sale
  costAtSale  Int // ✅ Cost at time of sale
  quantity    Float // ✅ How many units added
}
```

#### ❌ MISSING: Addon Product Details

```prisma
model OrderItemAddon {
  id          String    @id @default(cuid())
  orderItemId String
  orderItem   OrderItem @relation(fields: [orderItemId], references: [id])

  addonId     String
  addon       ProductVariant @relation("AddonToOrderItem", fields: [addonId], references: [id])
  quantity    Float
  priceAtSale Int
  costAtSale  Int @default(0)

  // --- ADDON SNAPSHOTS (NEW) ---
  snapshotAddonProductName String? // Parent product name (e.g., "Extra Cheese")
  snapshotAddonVariantName String? // Variant name (e.g., "Large")
  snapshotAddonSku         String? // SKU
  snapshotAddonUnitName    String? // "gram", "piece"
  snapshotAddonUnitAbbrev  String? // "g", "pcs"
  snapshotAddonTaxCategory TaxCategory? // Tax category of addon

  businessId String
  business   Business @relation(fields: [businessId], references: [id])
  branchId   String
  branch     Branch   @relation(fields: [branchId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([orderItemId])
  @@index([businessId, orderItemId])
  @@index([businessId, branchId])
  @@map("order_item_addons")
}
```

---

### 4. Payment Snapshots (OPTIONAL - LOW PRIORITY)

**Current State**: Payment methods are typically stable.

**Consideration**: If you allow custom payment method names or fees, snapshot them.

```prisma
model Payment {
  // ... existing fields ...
  
  // Future consideration:
  // snapshotPaymentMethodName String? // "GCash", "Cash", "Credit Card"
  // snapshotPaymentFeeRate     Float?  // Processing fee rate at time of payment
}
```

**Decision**: Skip for now. Payment method enums don't change historically.

---

## Snapshot Strategy by Model

| Model | Foreign Keys to Snapshot | Priority |
|-------|--------------------------|----------|
| **Transaction** | Business, Branch, User (Cashier), SystemConfig (VAT rate, currency) | 🔴 CRITICAL |
| **OrderItem** | Product, ProductVariant, Category, Unit, TaxCategory | 🔴 CRITICAL |
| **OrderItemAddon** | ProductVariant (addon), Unit | 🔴 CRITICAL |
| Payment | PaymentMethod | 🟡 LOW |
| Customer | (N/A - already captured at TX level) | ✅ DONE |

---

## Why NOT Snapshot These

### ✅ Customer
**Already handled**: Transaction captures `buyerName`, `buyerTaxId`, `buyerAddress` directly. Changing the Customer record won't affect past transactions.

### ✅ Inventory/Location
**Not displayed**: Inventory movements are internal. Receipts/reports don't show "which warehouse" the item came from.

### ✅ Supplier
**Purchase domain**: Supplier changes affect purchases, not sales transactions. (Note: We may want to snapshot suppliers in Purchase records separately.)

### ✅ Prices/Costs Already Captured
`unitPrice` and `unitCost` are already captured at OrderItem level. We don't need to re-snapshot these.

---

## Implementation Priority

### Phase 1: OrderItem Snapshots (HIGHEST PRIORITY)
These affect receipts, refunds, and sales reports directly.

**Add to OrderItem**:
- `snapshotProductName`
- `snapshotVariantName`
- `snapshotCategoryName`
- `snapshotSku`
- `snapshotUnitName`
- `snapshotUnitAbbrev`
- `snapshotUnitType`
- `snapshotTaxCategory`

**Add to OrderItemAddon**:
- `snapshotAddonProductName`
- `snapshotAddonVariantName`
- `snapshotAddonSku`
- `snapshotAddonUnitName`
- `snapshotAddonUnitAbbrev`
- `snapshotAddonTaxCategory`

### Phase 2: Transaction-Level Snapshots (HIGH PRIORITY)
Required for BIR compliance and receipt reprints.

**Add to Transaction**:
- `snapshotBusinessName`
- `snapshotBranchName`
- `snapshotBranchAddress`
- `snapshotBranchSN`
- `snapshotBusinessTIN`
- `snapshotBranchCode`
- `snapshotVATRate`
- `snapshotIsVATRegistered`
- `snapshotPriceConfig`
- `snapshotCurrency`
- `snapshotCashierName`

### Phase 3: Optional Enhancements
- Product images for digital receipts
- Service duration for bookings
- Payment method custom names

---

## Migration Strategy

### Step 1: Add Nullable Columns
All snapshot fields should be nullable to maintain backward compatibility with existing transactions.

```prisma
snapshotProductName String?
snapshotVariantName String?
// etc.
```

### Step 2: Backfill Script
Populate existing transactions with current master data values.

```typescript
// For each existing OrderItem without snapshots:
//   - Fetch current ProductVariant → Product → Category
//   - Fetch current Unit
//   - Write snapshot fields

// For each existing Transaction without snapshots:
//   - Fetch current Business, Branch, User
//   - Fetch current SystemConfig (VAT_RATE, etc.)
//   - Write snapshot fields
```

### Step 3: Update POS Transaction Creation
Capture all snapshot fields when creating new transactions.

### Step 4: Update Reports & Receipts
Use snapshot fields instead of joins to master tables.

### Step 5: Add Monitoring
Alert if new transactions are created without snapshot fields (indicates a bug).

---

## Testing Checklist

- [ ] Create transaction → Update product name → Verify report shows original name
- [ ] Create transaction → Update category → Verify sales-by-category shows original
- [ ] Create transaction → Update unit conversion → Verify receipt shows original unit
- [ ] Create transaction → Update tax category → Verify tax calculation unchanged
- [ ] Create transaction → Update business name → Verify receipt reprint shows original name
- [ ] Create transaction → Update VAT rate → Verify historical transactions unaffected
- [ ] Create transaction with addon → Update addon name → Verify receipt shows original
- [ ] Delete product variant → Verify transactions still display correctly
- [ ] Delete cashier user → Verify transaction history still shows cashier name

---

## SQL Estimation: Column Count

### OrderItem: +10 columns
- snapshotProductName
- snapshotVariantName
- snapshotCategoryName
- snapshotSku
- snapshotUnitName
- snapshotUnitAbbrev
- snapshotUnitType
- snapshotTaxCategory
- snapshotProductType
- snapshotDurationMinutes (optional)

### OrderItemAddon: +6 columns
- snapshotAddonProductName
- snapshotAddonVariantName
- snapshotAddonSku
- snapshotAddonUnitName
- snapshotAddonUnitAbbrev
- snapshotAddonTaxCategory

### Transaction: +11 columns
- snapshotBusinessName
- snapshotBranchName
- snapshotBranchAddress
- snapshotBranchSN
- snapshotBusinessTIN
- snapshotBranchCode
- snapshotVATRate
- snapshotIsVATRegistered
- snapshotPriceConfig
- snapshotCurrency
- snapshotCashierName

**Total: 27 new nullable columns** across 3 tables.

---

## Storage Impact

**Assumptions**:
- Average product name: 30 chars
- Average category name: 20 chars
- Average unit name: 15 chars
- Average business name: 40 chars
- Average TIN/SN: 20 chars

**Per OrderItem**: ~150 bytes
**Per OrderItemAddon**: ~100 bytes
**Per Transaction**: ~200 bytes

**For 1M transactions with 2 items each + 1 addon**:
- OrderItem: 2M × 150 = 300 MB
- OrderItemAddon: 1M × 100 = 100 MB
- Transaction: 1M × 200 = 200 MB
- **Total: ~600 MB** for 1 million transactions

**Verdict**: Negligible storage cost for immense audit value.

---

## Alternative: Full JSON Snapshot

Instead of individual columns, store a full JSON blob:

```prisma
model OrderItem {
  // ... existing fields ...
  fullSnapshot Json? // Complete product/variant/unit state at time of sale
}
```

### Pros:
- Single column
- Can capture unlimited fields
- No schema changes for new snapshot needs

### Cons:
- Cannot index/query by product name
- Harder to write SQL reports
- JSON parsing overhead
- Harder to backfill

**Decision**: Use individual columns for Phase 1. Consider JSON for future edge cases.

---

## Related Documentation

- `.kiro/transaction-snapshot-implementation.md` — Detailed implementation steps
- `prisma/schema.prisma` — Current schema
- BIR Revenue Regulation — 10-year immutable transaction record requirement

---

## Sign-Off Checklist

Before marking this as "complete", ensure:
- [ ] All snapshot columns identified
- [ ] Migration script written
- [ ] Backfill script written
- [ ] POS creation logic updated
- [ ] Receipt printing updated
- [ ] Report queries updated
- [ ] Refund logic updated
- [ ] Tests written
- [ ] Monitoring alerts added
- [ ] Documentation updated
