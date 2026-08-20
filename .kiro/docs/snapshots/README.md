# Transaction Snapshot Implementation

This folder contains documentation for the three-phase transaction snapshot system implemented to ensure accurate receipt reprints and BIR audit compliance.

## Overview

The snapshot system captures immutable point-in-time data at the moment of sale, ensuring that receipts can be accurately reprinted years later even if business information, product details, or tax rates change. This is critical for Philippine BIR compliance which requires 10-year retention of transaction records.

## Implementation Status

**Status**: ✅ Complete and Production-Ready  
**Date Completed**: Multiple phases (2024-2026)  
**Version**: Phase 3 Complete

## Documents Overview

### Master Plans & Roadmaps

#### [PHASED-SNAPSHOT-PLAN.md](./PHASED-SNAPSHOT-PLAN.md)
The original master plan outlining the three-phase approach to implementing snapshots across the entire system.

#### [snapshot-roadmap.md](./snapshot-roadmap.md)
High-level roadmap and timeline for snapshot implementation across all entities.

#### [SNAPSHOT-IMPLEMENTATION-PLAN.md](./SNAPSHOT-IMPLEMENTATION-PLAN.md)
Detailed technical implementation plan with schema changes and code patterns.

### Phase Execution Documents

#### [PHASE-1-EXECUTION.md](./PHASE-1-EXECUTION.md)
**Phase 1: Product & Order Snapshots**
- OrderItem snapshots (product, variant, category, SKU, image)
- OrderItemAddon snapshots (addon product, variant, SKU)
- Transaction snapshot fields added
- Completed: Q4 2024

#### [PHASE-2-EXECUTION.md](./PHASE-2-EXECUTION.md)
**Phase 2: Unit & Tax Snapshots**
- OrderItem unit snapshots (name, abbreviation, type)
- OrderItemAddon unit snapshots
- Tax category snapshots
- Completed: Q1 2025

#### [PHASE-3-EXECUTION.md](./PHASE-3-EXECUTION.md)
**Phase 3: Business, Branch & Customer Snapshots**
- Business name and TIN
- Branch name, address, serial number, code
- VAT registration status and currency
- Cashier name
- Customer name, TIN, address
- Completed: Q2 2026

#### [PHASE-1-AND-3-PATCH.md](./PHASE-1-AND-3-PATCH.md)
Patch document combining fixes and enhancements from Phase 1 and Phase 3.

### Execution & Audit

#### [SNAPSHOT-EXECUTION-INDEX.md](./SNAPSHOT-EXECUTION-INDEX.md)
Index of all snapshot-related execution tasks and their status.

#### [transaction-snapshot-implementation.md](./transaction-snapshot-implementation.md)
Technical implementation details for Transaction-level snapshots.

#### [transaction-snapshot-audit.md](./transaction-snapshot-audit.md)
Audit report verifying snapshot completeness and accuracy.

### Reference Documents

#### [snapshot-fields-summary.md](./snapshot-fields-summary.md)
Complete reference of all snapshot fields across all entities with data types and purposes.

#### [REFUND-SNAPSHOT-DECISION.md](./REFUND-SNAPSHOT-DECISION.md)
Architectural decision document explaining why refunds copy snapshots from original transactions rather than capturing fresh data.

## What Was Implemented

### Phase 1: Product/Variant/Category Snapshots
✅ **OrderItem Fields**
- `snapshotProductName` - Product name at time of sale
- `snapshotVariantName` - Variant name at time of sale
- `snapshotCategoryName` - Category name at time of sale
- `snapshotSku` - SKU at time of sale
- `snapshotProductType` - Product type (CONSUMABLE, INGREDIENT, etc.)
- `snapshotProductImage` - Image URL at time of sale

✅ **OrderItemAddon Fields**
- `snapshotAddonProductName` - Addon product name
- `snapshotAddonVariantName` - Addon variant name
- `snapshotAddonSku` - Addon SKU

### Phase 2: Unit & Tax Snapshots
✅ **OrderItem Unit Fields**
- `snapshotUnitName` - Unit name at time of sale
- `snapshotUnitAbbrev` - Unit abbreviation
- `snapshotUnitType` - Unit type (WEIGHT, VOLUME, COUNT, etc.)
- `snapshotTaxCategory` - Tax category (STANDARD, EXEMPT, ZERO_RATED)

✅ **OrderItemAddon Unit Fields**
- `snapshotAddonUnitName` - Addon unit name
- `snapshotAddonUnitAbbrev` - Addon unit abbreviation
- `snapshotAddonTaxCategory` - Addon tax category

### Phase 3: Business/Branch/Customer Snapshots
✅ **Transaction Business/Branch Fields**
- `snapshotBusinessName` - Business name at time of sale
- `snapshotBranchName` - Branch name at time of sale
- `snapshotBranchAddress` - Branch address for receipt
- `snapshotBranchSN` - Branch serial number (BIR requirement)
- `snapshotBusinessTIN` - Business TIN from ComplianceRegistry
- `snapshotBranchCode` - Branch code suffix (e.g., "00001")
- `snapshotIsVATRegistered` - VAT registration status ("true"/"false")
- `snapshotCurrency` - Currency code (e.g., "PHP")
- `snapshotCashierName` - Cashier name at time of sale

✅ **Transaction Customer Fields**
- `snapshotCustomerName` - Customer/buyer name
- `snapshotCustomerTaxId` - Customer TIN/tax ID
- `snapshotCustomerAddress` - Customer address

## Key Design Decisions

### 1. Nullable Snapshot Fields
All snapshot fields are nullable to support:
- Pre-snapshot transactions (created before snapshots were implemented)
- Gradual rollout across phases
- Backward compatibility

### 2. String Type for Boolean Values
`snapshotIsVATRegistered` is stored as string `"true"/"false"` instead of boolean for:
- Consistency with other compliance data stored as JSON strings
- Future extensibility (e.g., "pending", "expired")
- Explicit null handling for pre-snapshot data

### 3. Refund Snapshot Copy Pattern
Refunds copy snapshots from the original transaction rather than capturing fresh data because:
- Refund receipts must match original receipt exactly
- Maintains audit trail consistency
- Prevents discrepancies if business info changed

### 4. Phased Implementation
Three phases allowed for:
- Risk mitigation (test each phase before next)
- Team learning and adaptation
- Minimal production disruption
- Clear rollback points

## Files Modified

### Schema
- `web/prisma/schema.prisma` - Added all snapshot fields across OrderItem, OrderItemAddon, Transaction models

### Transaction Creation
- `web/src/lib/queries/create-pos-transaction.ts` - Captures all snapshot fields
- `web/src/lib/queries/create-pos-order.ts` - Captures order snapshots
- `web/src/lib/queries/create-pos-refund.ts` - Copies snapshots from original transaction

### Receipt Generation
- Receipt printing components use snapshot fields for accurate reprints
- All receipt data sourced from snapshots, never from current data

## Usage Example

### Capturing Snapshots
```typescript
// Phase 1: Product snapshots
snapshotProductName: product.name,
snapshotVariantName: variant.name,
snapshotCategoryName: product.category.name,
snapshotSku: variant.sku,

// Phase 2: Unit and tax snapshots
snapshotUnitName: product.baseUnit.name,
snapshotUnitAbbrev: product.baseUnit.abbreviation,
snapshotTaxCategory: variant.taxCategory,

// Phase 3: Business/branch snapshots
snapshotBusinessName: user.business.name,
snapshotBranchName: user.branch.name,
snapshotBranchAddress: user.branch.address,
snapshotCashierName: user.name,
```

### Receipt Reprinting
```typescript
// Always use snapshots, never current data
<div class="product-name">{orderItem.snapshotProductName}</div>
<div class="variant-name">{orderItem.snapshotVariantName}</div>
<div class="unit">{orderItem.snapshotUnitAbbrev}</div>

// Business info from transaction snapshots
<div class="business-name">{transaction.snapshotBusinessName}</div>
<div class="branch-address">{transaction.snapshotBranchAddress}</div>
```

## BIR Compliance

### Requirements Met
✅ **10-Year Retention** - All snapshot data retained with transaction  
✅ **Accurate Reprints** - Receipts identical to original even years later  
✅ **Audit Trail** - Complete history of what was printed on each receipt  
✅ **Tax Compliance** - Tax categories and rates captured at time of sale  
✅ **Business Identity** - TIN, serial numbers, branch codes preserved  

### Audit Preparation
During BIR audit, snapshots prove:
1. Receipt reprints are accurate and unchanged
2. Tax calculations used correct rates at time of sale
3. Business information was compliant when transaction occurred
4. No retroactive data manipulation

## Testing

### Pre-Snapshot Data Handling
All snapshot fields are nullable to gracefully handle:
- Transactions created before snapshot implementation
- Receipts can be reprinted using current data as fallback
- Clear indication in UI when using fallback vs. snapshot

### Migration Safety
No data migration required:
- New fields added as nullable
- Existing transactions unaffected
- New snapshots captured from implementation date forward

## Future Enhancements

### Phase 4 (Potential)
- Payment method snapshots (if payment provider info changes)
- Discount policy snapshots (if discount rules change)
- Promotion snapshots (if promo details change)

Currently deferred - not critical for compliance or functionality.

## Troubleshooting

### Missing Snapshot Data
If snapshot fields are null:
1. Check transaction date - created before snapshot implementation?
2. Fallback to current data with warning indicator
3. Document in audit trail that original receipt used current data

### Snapshot Mismatch
If snapshot doesn't match current data:
1. This is expected and correct behavior
2. Snapshot represents historical truth at time of sale
3. Current data shows present state
4. Both are valid for their respective purposes

## References

- BIR Revenue Regulations No. 18-2012 (E-receipts and Invoices)
- BIR RMC No. 29-2012 (10-Year Retention)
- Internal: Transaction Snapshot Architecture (Design Phase)
- Internal: Phase Execution Documents (this folder)

---

**Maintained By**: Development Team  
**Phases Completed**: 1, 2, 3  
**Last Updated**: August 20, 2026  
**Status**: ✅ Production Ready
