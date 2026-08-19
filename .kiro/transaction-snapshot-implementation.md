# Transaction Snapshot Implementation Guide

## Problem Statement

Currently, `OrderItem` stores foreign keys to `ProductVariant`, `Unit`, and `Category`. When these master data entities are updated, historical transactions reflect the NEW values instead of what was actually sold. This breaks:

1. **Audit compliance** — BIR requires immutable transaction records
2. **Financial reporting** — Historical sales reports show wrong product/category names
3. **Tax accuracy** — Tax category changes retroactively affect past transactions
4. **Receipt reprints** — Cannot accurately reproduce original receipts

## Architecture Decision: Snapshot at OrderItem Level

### Why OrderItem (not Transaction)?
- Transaction already snapshots `totalAmount`, `totalCost`, `bufferRate`
- OrderItem is the granular line-item level where product details matter
- Allows per-item historical accuracy
- Supports refunds with original item details

### What to Snapshot

```typescript
// Fields that must be captured at time of sale:
interface OrderItemSnapshot {
  // Product Identity
  snapshotProductName: string      // "Fried Chicken"
  snapshotVariantName: string | null // "Large", "Extra Spicy", null for default
  snapshotCategoryName: string     // "Main Dishes"
  snapshotSku: string | null       // "SKU-001"
  
  // Unit Information
  snapshotUnitName: string         // "kilogram"
  snapshotUnitAbbrev: string       // "kg"
  snapshotUnitType: string         // "WEIGHT" (enum as string)
  
  // Tax & Compliance
  snapshotTaxCategory: TaxCategory // STANDARD, EXEMPT, etc.
  
  // Price & Cost (already captured)
  unitPrice: number // ✅ Already exists
  unitCost: number  // ✅ Already exists
}
```

### What NOT to Snapshot

- `quantity` — this is transaction-specific, not master data
- `unitId`, `variantId` — keep FKs for joins when master data hasn't changed
- Full product details — only snapshot what displays on receipts/reports

## Database Migration

### Step 1: Add Nullable Columns (Backward Compatible)

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

  // --- SNAPSHOT FIELDS (Phase 2: Audit & Compliance) ---
  // Captured at time of sale to preserve historical accuracy.
  // NULL for transactions created before this feature was deployed.
  
  snapshotProductName  String?
  snapshotVariantName  String?
  snapshotCategoryName String?
  snapshotSku          String?
  
  snapshotUnitName     String?
  snapshotUnitAbbrev   String?
  snapshotUnitType     String? // Store as string to avoid enum migration issues
  
  snapshotTaxCategory  TaxCategory?

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

### Step 2: Data Migration Script

```typescript
// prisma/migrations/backfill-order-item-snapshots.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function backfillSnapshots() {
  console.log('Starting OrderItem snapshot backfill...')
  
  // Process in batches to avoid memory issues
  const BATCH_SIZE = 1000
  let skip = 0
  let processedCount = 0
  
  while (true) {
    const items = await prisma.orderItem.findMany({
      where: {
        snapshotProductName: null // Only backfill items without snapshots
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                category: true,
                baseUnit: true
              }
            }
          }
        },
        unit: true
      },
      take: BATCH_SIZE,
      skip
    })
    
    if (items.length === 0) break
    
    // Update each item with snapshot data
    const updates = items.map(item => {
      return prisma.orderItem.update({
        where: { id: item.id },
        data: {
          snapshotProductName: item.variant.product.name,
          snapshotVariantName: item.variant.name,
          snapshotCategoryName: item.variant.product.category.name,
          snapshotSku: item.variant.sku,
          snapshotUnitName: item.unit.name,
          snapshotUnitAbbrev: item.unit.abbreviation,
          snapshotUnitType: item.unit.type,
          snapshotTaxCategory: item.variant.taxCategory
        }
      })
    })
    
    await Promise.all(updates)
    
    processedCount += items.length
    console.log(`Backfilled ${processedCount} items...`)
    
    skip += BATCH_SIZE
  }
  
  console.log(`✅ Backfill complete! Processed ${processedCount} items.`)
}

backfillSnapshots()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

## Code Changes

### Update POS Transaction Creation

```typescript
// src/lib/pos/create-transaction.ts (or wherever you create orders)

async function createOrderItem(input: {
  variantId: string
  quantity: number
  unitId: string
  // ... other fields
}) {
  // Fetch full data for snapshot
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: input.variantId },
    include: {
      product: {
        include: {
          category: true
        }
      }
    }
  })
  
  const unit = await prisma.unit.findUniqueOrThrow({
    where: { id: input.unitId }
  })
  
  return prisma.orderItem.create({
    data: {
      // ... existing fields ...
      variantId: input.variantId,
      unitId: input.unitId,
      quantity: input.quantity,
      unitPrice: variant.price,
      unitCost: variant.costPrice,
      
      // 📸 Snapshot fields
      snapshotProductName: variant.product.name,
      snapshotVariantName: variant.name,
      snapshotCategoryName: variant.product.category.name,
      snapshotSku: variant.sku,
      snapshotUnitName: unit.name,
      snapshotUnitAbbrev: unit.abbreviation,
      snapshotUnitType: unit.type,
      snapshotTaxCategory: variant.taxCategory,
      
      // ... rest of fields
    }
  })
}
```

### Update Reports to Use Snapshots

```typescript
// src/lib/reports/sales-by-product.ts

async function getSalesByProduct(dateRange: { from: Date; to: Date }) {
  const items = await prisma.orderItem.findMany({
    where: {
      createdAt: {
        gte: dateRange.from,
        lte: dateRange.to
      }
    },
    include: {
      order: {
        include: {
          transaction: true
        }
      }
    }
  })
  
  // ✅ Use snapshot fields for historical accuracy
  const grouped = items.reduce((acc, item) => {
    // Fall back to live data for old transactions (before snapshots)
    const productName = item.snapshotProductName || '(Unknown Product)'
    const variantName = item.snapshotVariantName || ''
    const displayName = variantName 
      ? `${productName} - ${variantName}` 
      : productName
    
    if (!acc[displayName]) {
      acc[displayName] = {
        productName: displayName,
        quantitySold: 0,
        revenue: 0,
        cost: 0
      }
    }
    
    acc[displayName].quantitySold += item.quantity
    acc[displayName].revenue += item.unitPrice * item.quantity
    acc[displayName].cost += item.unitCost * item.quantity
    
    return acc
  }, {} as Record<string, SalesData>)
  
  return Object.values(grouped)
}
```

### Update Receipt Printing

```typescript
// src/lib/receipts/print-receipt.ts

function formatReceiptLine(item: OrderItem) {
  // Use snapshot fields for display
  const productName = item.snapshotProductName || '(Unknown)'
  const variantName = item.snapshotVariantName ? ` (${item.snapshotVariantName})` : ''
  const unitAbbrev = item.snapshotUnitAbbrev || ''
  
  return {
    description: `${productName}${variantName}`,
    quantity: `${item.quantity} ${unitAbbrev}`,
    unitPrice: formatCurrency(item.unitPrice),
    total: formatCurrency(item.unitPrice * item.quantity)
  }
}
```

## OrderItemAddon Snapshots

The same principle applies to `OrderItemAddon`:

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

  // --- ADDON SNAPSHOTS ---
  snapshotAddonName      String?
  snapshotAddonSku       String?
  snapshotAddonUnitName  String?
  snapshotAddonUnitAbbrev String?

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

## Testing Strategy

### Unit Tests

```typescript
describe('OrderItem Snapshots', () => {
  it('should capture product name at time of sale', async () => {
    const variant = await createVariant({ name: 'Small' })
    const order = await createOrder([{ variantId: variant.id, quantity: 1 }])
    
    // Change product name
    await updateProduct(variant.productId, { name: 'RENAMED' })
    
    // Snapshot should preserve original name
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } })
    expect(item.snapshotProductName).toBe('Original Name')
  })
  
  it('should capture tax category at time of sale', async () => {
    const variant = await createVariant({ taxCategory: 'STANDARD' })
    const order = await createOrder([{ variantId: variant.id, quantity: 1 }])
    
    // Change tax category
    await updateVariant(variant.id, { taxCategory: 'EXEMPT' })
    
    // Snapshot should preserve original tax category
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } })
    expect(item.snapshotTaxCategory).toBe('STANDARD')
  })
})
```

### Integration Tests

- Create transaction → update product → verify report shows original name
- Create transaction → update unit → verify receipt shows original unit
- Refund transaction → verify refund uses snapshot data

## Deployment Checklist

- [ ] Add nullable snapshot columns via migration
- [ ] Deploy migration to production
- [ ] Run backfill script for existing transactions
- [ ] Update POS transaction creation code
- [ ] Update all report queries
- [ ] Update receipt printing logic
- [ ] Update refund logic
- [ ] Add monitoring for null snapshots (alert if new transactions missing snapshots)
- [ ] Document snapshot fields in API/SDK
- [ ] Update admin UI to show "Name changed since purchase" indicators

## Future Enhancements

### Phase 3: Full Product Snapshot
For more complex scenarios (e.g., recipe changes), consider storing a complete JSON snapshot:

```prisma
model OrderItem {
  // ... existing fields ...
  fullSnapshot Json? // Complete product/variant/unit state at time of sale
}
```

### Phase 4: Snapshot Diff Viewer
Admin UI feature to compare current master data vs. transaction snapshot:
- "This product was sold as 'Fried Chicken' but is now named 'Crispy Chicken'"
- "Tax category was STANDARD (12%) at time of sale, now EXEMPT (0%)"

## Related Issues

- Issue #1: Pricing changes at subscription renewal (similar snapshot pattern)
- Issue #4: Restaurant inventory transformations (raw → cooked products)

## References

- BIR Revenue Regulation on immutable transaction records
- Prisma soft delete patterns
- Audit trail best practices
