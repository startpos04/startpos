# Phase 1: OrderItem Core Snapshots - AI Agent Execution Plan

## Context for AI Agent

**Goal**: Add snapshot fields to capture product/variant/category names at transaction time, so historical data remains accurate even when master data changes.

**What to snapshot**: Product name, variant name, category name, SKU, product type, product image, and addon details.

**Why**: When users rename products or categories, historical reports/receipts currently show the NEW names. This breaks audit trails and compliance.

**Tables to modify**: 
- `OrderItem` (add 6 fields)
- `OrderItemAddon` (add 3 fields)

**Total fields**: 9 nullable string fields

---

## Step 1: Schema Migration (Prisma)

### Objective
Add 9 nullable columns to OrderItem and OrderItemAddon tables.

### File to modify
`web/prisma/schema.prisma`

### Exact changes

#### 1a. Locate the `OrderItem` model (around line 1080)

Find this model:
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

#### 1b. Add Phase 1 snapshot fields AFTER `unit` field and BEFORE `selectedAddons`

Insert these lines:
```prisma
  // --- SNAPSHOT FIELDS: Phase 1 (Product/Variant/Category) ---
  // Captured at time of sale to preserve historical accuracy when master data changes.
  // NULL for transactions created before Phase 1 deployment.
  snapshotProductName  String? // Product name at time of sale, e.g. "Fried Chicken"
  snapshotVariantName  String? // Variant name at time of sale, e.g. "Large", "Extra Spicy"
  snapshotCategoryName String? // Category name at time of sale, e.g. "Main Dishes"
  snapshotSku          String? // SKU at time of sale
  snapshotProductType  String? // Product type at time of sale: "PHYSICAL_GOOD", "SERVICE", etc.
  snapshotProductImage String? // Product image URL at time of sale (for digital receipts)
```

#### 1c. Locate the `OrderItemAddon` model (around line 1115)

Find this model:
```prisma
model OrderItemAddon {
  id          String    @id @default(cuid())
  orderItemId String
  orderItem   OrderItem @relation(fields: [orderItemId], references: [id])

  addonId     String // Points to a ProductVariant acting as addon
  addon       ProductVariant @relation("AddonToOrderItem", fields: [addonId], references: [id])
  quantity    Float // How much was added (e.g., 2 units)
  priceAtSale Int // Price charged for this addon at time of sale (in cents)
  costAtSale  Int            @default(0) // Cost of this addon at time of sale (in cents)

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

#### 1d. Add Phase 1 addon snapshot fields AFTER `costAtSale` and BEFORE `businessId`

Insert these lines:
```prisma
  // --- SNAPSHOT FIELDS: Phase 1 (Addon Details) ---
  // Captured at time of sale to preserve historical accuracy.
  snapshotAddonProductName String? // Addon product name at time of sale, e.g. "Extra Cheese"
  snapshotAddonVariantName String? // Addon variant name at time of sale
  snapshotAddonSku         String? // Addon SKU at time of sale
```

### Commands to run

After modifying schema.prisma:

```bash
# Generate migration
cd web
npx prisma migrate dev --name phase1_orderitem_core_snapshots

# This will:
# 1. Create a new migration file
# 2. Apply it to your dev database
# 3. Regenerate Prisma Client
```

### Validation
- [ ] Migration file created in `web/prisma/migrations/`
- [ ] No errors during migration
- [ ] Prisma Client regenerated
- [ ] New columns visible in database

---

## Step 2: Backfill Script

### Objective
Populate snapshot fields for existing OrderItem and OrderItemAddon records using current master data values.

### Create new file
`web/scripts/backfill-phase1-snapshots.ts`

### File contents

```typescript
import { PrismaClient } from './prisma/generated/prisma'

const prisma = new PrismaClient()

const BATCH_SIZE = 500

async function backfillOrderItemSnapshots() {
  console.log('🔄 Phase 1: Backfilling OrderItem snapshots...')
  
  let processedCount = 0
  let hasMore = true
  
  while (hasMore) {
    // Fetch batch of OrderItems without snapshots
    const items = await prisma.orderItem.findMany({
      where: {
        snapshotProductName: null // Only backfill items without snapshots
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                category: true
              }
            }
          }
        }
      },
      take: BATCH_SIZE
    })
    
    if (items.length === 0) {
      hasMore = false
      break
    }
    
    // Update each item with snapshot data
    const updates = items.map(item => {
      return prisma.orderItem.update({
        where: { id: item.id },
        data: {
          snapshotProductName: item.variant.product.name,
          snapshotVariantName: item.variant.name,
          snapshotCategoryName: item.variant.product.category.name,
          snapshotSku: item.variant.sku,
          snapshotProductType: item.variant.product.type,
          snapshotProductImage: item.variant.image || item.variant.product.image
        }
      })
    })
    
    await Promise.all(updates)
    
    processedCount += items.length
    console.log(`  ✓ Backfilled ${processedCount} OrderItems...`)
  }
  
  console.log(`✅ Phase 1 OrderItem backfill complete: ${processedCount} records`)
}

async function backfillOrderItemAddonSnapshots() {
  console.log('🔄 Phase 1: Backfilling OrderItemAddon snapshots...')
  
  let processedCount = 0
  let hasMore = true
  
  while (hasMore) {
    // Fetch batch of OrderItemAddons without snapshots
    const addons = await prisma.orderItemAddon.findMany({
      where: {
        snapshotAddonProductName: null
      },
      include: {
        addon: {
          include: {
            product: true
          }
        }
      },
      take: BATCH_SIZE
    })
    
    if (addons.length === 0) {
      hasMore = false
      break
    }
    
    // Update each addon with snapshot data
    const updates = addons.map(addon => {
      return prisma.orderItemAddon.update({
        where: { id: addon.id },
        data: {
          snapshotAddonProductName: addon.addon.product.name,
          snapshotAddonVariantName: addon.addon.name,
          snapshotAddonSku: addon.addon.sku
        }
      })
    })
    
    await Promise.all(updates)
    
    processedCount += addons.length
    console.log(`  ✓ Backfilled ${processedCount} OrderItemAddons...`)
  }
  
  console.log(`✅ Phase 1 OrderItemAddon backfill complete: ${processedCount} records`)
}

async function main() {
  console.log('🚀 Starting Phase 1 Snapshot Backfill...')
  console.log('📊 This will populate snapshot fields for existing transactions')
  console.log('')
  
  try {
    await backfillOrderItemSnapshots()
    await backfillOrderItemAddonSnapshots()
    
    console.log('')
    console.log('✅ Phase 1 backfill completed successfully!')
  } catch (error) {
    console.error('❌ Backfill failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
```

### Commands to run

```bash
cd web

# Run backfill in dev environment
npx tsx scripts/backfill-phase1-snapshots.ts

# Verify coverage
npx prisma studio
# Check that OrderItem.snapshotProductName is populated
```

### Validation
- [ ] Script runs without errors
- [ ] Console shows progress (batch counts)
- [ ] All existing OrderItems have non-null snapshotProductName
- [ ] All existing OrderItemAddons have non-null snapshotAddonProductName

---

## Step 3: Update POS Transaction Creation

### Objective
Capture snapshot data when creating new transactions in the POS system.

### Files to find and modify

Use grep to find where OrderItem and OrderItemAddon are created:

```bash
cd web
grep -r "orderItem.create\|OrderItem.create" src/ --include="*.ts" --include="*.tsx"
grep -r "orderItemAddon.create\|OrderItemAddon.create" src/ --include="*.ts" --include="*.tsx"
```

### Expected locations
Likely in files related to:
- `src/lib/pos/` or `src/lib/transactions/`
- `src/routes/api/transactions/` or `src/routes/api/pos/`
- Server functions that create orders

### Generic modification pattern

**BEFORE** (example):
```typescript
await prisma.orderItem.create({
  data: {
    orderId: order.id,
    variantId: item.variantId,
    unitId: item.unitId,
    quantity: item.quantity,
    unitPrice: variant.price,
    unitCost: variant.costPrice,
    businessId,
    branchId
  }
})
```

**AFTER** (with Phase 1 snapshots):
```typescript
// Fetch related data for snapshots
const variant = await prisma.productVariant.findUniqueOrThrow({
  where: { id: item.variantId },
  include: {
    product: {
      include: {
        category: true
      }
    }
  }
})

await prisma.orderItem.create({
  data: {
    orderId: order.id,
    variantId: item.variantId,
    unitId: item.unitId,
    quantity: item.quantity,
    unitPrice: variant.price,
    unitCost: variant.costPrice,
    
    // 📸 PHASE 1 SNAPSHOTS
    snapshotProductName: variant.product.name,
    snapshotVariantName: variant.name,
    snapshotCategoryName: variant.product.category.name,
    snapshotSku: variant.sku,
    snapshotProductType: variant.product.type,
    snapshotProductImage: variant.image || variant.product.image,
    
    businessId,
    branchId
  }
})
```

### For OrderItemAddon

**BEFORE**:
```typescript
await prisma.orderItemAddon.create({
  data: {
    orderItemId: orderItem.id,
    addonId: addon.variantId,
    quantity: addon.quantity,
    priceAtSale: addonVariant.price,
    costAtSale: addonVariant.costPrice,
    businessId,
    branchId
  }
})
```

**AFTER**:
```typescript
// Fetch addon details for snapshots
const addonVariant = await prisma.productVariant.findUniqueOrThrow({
  where: { id: addon.variantId },
  include: {
    product: true
  }
})

await prisma.orderItemAddon.create({
  data: {
    orderItemId: orderItem.id,
    addonId: addon.variantId,
    quantity: addon.quantity,
    priceAtSale: addonVariant.price,
    costAtSale: addonVariant.costPrice,
    
    // 📸 PHASE 1 SNAPSHOTS
    snapshotAddonProductName: addonVariant.product.name,
    snapshotAddonVariantName: addonVariant.name,
    snapshotAddonSku: addonVariant.sku,
    
    businessId,
    branchId
  }
})
```

### Validation
- [ ] Create a new transaction in POS
- [ ] Check database that new OrderItem has all Phase 1 snapshots populated
- [ ] Check that addons also have snapshots populated
- [ ] No errors during transaction creation

---

## Step 4: Update Reports to Use Snapshots

### Objective
Update sales reports to use snapshot fields instead of joining to master tables.

### Files to find

```bash
cd web
grep -r "sales.*report\|product.*report\|category.*report" src/ --include="*.ts" --include="*.tsx"
grep -r "groupBy.*variant\|groupBy.*product\|groupBy.*category" src/ --include="*.ts"
```

### Generic modification pattern

**BEFORE** (joining to live product data):
```typescript
const salesByProduct = await prisma.orderItem.groupBy({
  by: ['variantId'],
  _sum: {
    quantity: true,
    unitPrice: true
  },
  where: {
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  }
})

// Then join to get product names
const enriched = await Promise.all(
  salesByProduct.map(async (item) => {
    const variant = await prisma.productVariant.findUnique({
      where: { id: item.variantId },
      include: { product: true }
    })
    return {
      productName: variant.product.name,
      variantName: variant.name,
      quantity: item._sum.quantity,
      revenue: item._sum.unitPrice
    }
  })
)
```

**AFTER** (using snapshots):
```typescript
const orderItems = await prisma.orderItem.findMany({
  where: {
    createdAt: {
      gte: startDate,
      lte: endDate
    }
  },
  select: {
    // Use snapshots (with fallback to live data for old records)
    snapshotProductName: true,
    snapshotVariantName: true,
    snapshotCategoryName: true,
    quantity: true,
    unitPrice: true,
    unitCost: true,
    // Keep variant relation as fallback
    variant: {
      include: {
        product: {
          include: {
            category: true
          }
        }
      }
    }
  }
})

// Group by snapshot product name (with fallback)
const grouped = orderItems.reduce((acc, item) => {
  // Use snapshot if available, fallback to live data for old transactions
  const productName = item.snapshotProductName || item.variant.product.name
  const variantName = item.snapshotVariantName || item.variant.name
  const displayName = variantName ? `${productName} - ${variantName}` : productName
  
  if (!acc[displayName]) {
    acc[displayName] = {
      productName: displayName,
      quantity: 0,
      revenue: 0,
      cost: 0
    }
  }
  
  acc[displayName].quantity += item.quantity
  acc[displayName].revenue += item.unitPrice * item.quantity
  acc[displayName].cost += item.unitCost * item.quantity
  
  return acc
}, {} as Record<string, any>)

return Object.values(grouped)
```

### Key principle
- **Primary**: Use snapshot fields
- **Fallback**: Use live data if snapshot is null (for old transactions before Phase 1)

### Validation
- [ ] Generate sales report for date range including old transactions
- [ ] Verify report shows correct product names
- [ ] Rename a product in master data
- [ ] Generate report again - old transactions should still show old name
- [ ] Create new transaction with renamed product
- [ ] New transaction should show new name in reports

---

## Step 5: Update Receipt Printing

### Objective
Update receipt templates to display snapshot data instead of live product data.

### Files to find

```bash
cd web
grep -r "receipt\|invoice\|print" src/ --include="*.ts" --include="*.tsx" --include="*.vue"
```

### Generic modification pattern

**BEFORE** (using live product data):
```typescript
function formatReceiptLine(orderItem: OrderItem & { variant: { product: Product } }) {
  return {
    description: `${orderItem.variant.product.name}${orderItem.variant.name ? ` (${orderItem.variant.name})` : ''}`,
    quantity: orderItem.quantity,
    unitPrice: formatCurrency(orderItem.unitPrice),
    total: formatCurrency(orderItem.unitPrice * orderItem.quantity)
  }
}
```

**AFTER** (using snapshots with fallback):
```typescript
function formatReceiptLine(orderItem: OrderItem & { variant: { product: Product } }) {
  // Use snapshot if available, fallback to live data
  const productName = orderItem.snapshotProductName || orderItem.variant.product.name
  const variantName = orderItem.snapshotVariantName || orderItem.variant.name
  
  return {
    description: `${productName}${variantName ? ` (${variantName})` : ''}`,
    quantity: orderItem.quantity,
    unitPrice: formatCurrency(orderItem.unitPrice),
    total: formatCurrency(orderItem.unitPrice * orderItem.quantity)
  }
}
```

### Validation
- [ ] Print receipt for new transaction - shows correct product names
- [ ] Reprint old receipt (before Phase 1) - still shows correct names (from live data)
- [ ] Rename product in master data
- [ ] Reprint old receipt - should still show ORIGINAL name (from snapshot)
- [ ] Print new receipt - shows NEW name

---

## Step 6: Testing

### Create test file
`web/__tests__/phase1-snapshots.test.ts`

### Test contents

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '../prisma/generated/prisma'

const prisma = new PrismaClient()

describe('Phase 1: OrderItem Snapshots', () => {
  let testBusinessId: string
  let testBranchId: string
  let testProductId: string
  let testVariantId: string
  let testCategoryId: string

  beforeEach(async () => {
    // Setup test data (you'll need to adapt this to your test setup)
    // This is a template - adjust to your actual test helpers
  })

  it('should capture product name snapshot when creating OrderItem', async () => {
    const orderItem = await prisma.orderItem.create({
      data: {
        // ... required fields ...
        snapshotProductName: 'Test Product',
        snapshotVariantName: 'Test Variant',
        snapshotCategoryName: 'Test Category',
        snapshotSku: 'TEST-001'
      }
    })

    expect(orderItem.snapshotProductName).toBe('Test Product')
    expect(orderItem.snapshotVariantName).toBe('Test Variant')
    expect(orderItem.snapshotCategoryName).toBe('Test Category')
  })

  it('should preserve snapshot even when product is renamed', async () => {
    // Create transaction with original product name
    const orderItem = await prisma.orderItem.create({
      data: {
        variantId: testVariantId,
        // ... other fields ...
        snapshotProductName: 'Original Name'
      }
    })

    // Rename the product
    await prisma.product.update({
      where: { id: testProductId },
      data: { name: 'New Name' }
    })

    // Fetch the order item again
    const fetchedOrderItem = await prisma.orderItem.findUnique({
      where: { id: orderItem.id }
    })

    // Snapshot should still have original name
    expect(fetchedOrderItem?.snapshotProductName).toBe('Original Name')
  })

  it('should capture addon snapshots when creating OrderItemAddon', async () => {
    const addon = await prisma.orderItemAddon.create({
      data: {
        // ... required fields ...
        snapshotAddonProductName: 'Extra Cheese',
        snapshotAddonVariantName: 'Large',
        snapshotAddonSku: 'ADDON-001'
      }
    })

    expect(addon.snapshotAddonProductName).toBe('Extra Cheese')
    expect(addon.snapshotAddonVariantName).toBe('Large')
  })
})
```

### Run tests

```bash
cd web
npm test phase1-snapshots.test.ts
```

### Manual testing checklist
- [ ] Create new transaction in POS
- [ ] Verify snapshots populated in database
- [ ] Rename product in admin panel
- [ ] Generate sales report - old transactions show old name
- [ ] Print new transaction - shows new name
- [ ] Reprint old transaction - shows old name
- [ ] Delete product variant - old transactions still display

---

## Step 7: Monitoring & Validation

### Create monitoring query
`web/scripts/check-phase1-coverage.ts`

```typescript
import { PrismaClient } from './prisma/generated/prisma'

const prisma = new PrismaClient()

async function checkCoverage() {
  const totalOrderItems = await prisma.orderItem.count()
  const withSnapshots = await prisma.orderItem.count({
    where: {
      snapshotProductName: { not: null }
    }
  })
  
  const totalAddons = await prisma.orderItemAddon.count()
  const addonsWithSnapshots = await prisma.orderItemAddon.count({
    where: {
      snapshotAddonProductName: { not: null }
    }
  })
  
  const orderItemCoverage = (withSnapshots / totalOrderItems * 100).toFixed(2)
  const addonCoverage = (addonsWithSnapshots / totalAddons * 100).toFixed(2)
  
  console.log('📊 Phase 1 Snapshot Coverage Report')
  console.log('=====================================')
  console.log(`OrderItem: ${withSnapshots}/${totalOrderItems} (${orderItemCoverage}%)`)
  console.log(`OrderItemAddon: ${addonsWithSnapshots}/${totalAddons} (${addonCoverage}%)`)
  
  if (orderItemCoverage === '100.00' && addonCoverage === '100.00') {
    console.log('✅ Phase 1 coverage is 100% - all snapshots captured!')
  } else {
    console.log('⚠️  Some records missing snapshots - run backfill script')
  }
}

checkCoverage().finally(() => prisma.$disconnect())
```

### Run coverage check

```bash
cd web
npx tsx scripts/check-phase1-coverage.ts
```

### Expected output
```
📊 Phase 1 Snapshot Coverage Report
=====================================
OrderItem: 5000/5000 (100.00%)
OrderItemAddon: 1200/1200 (100.00%)
✅ Phase 1 coverage is 100% - all snapshots captured!
```

---

## Phase 1 Completion Checklist

- [ ] **Schema**: 9 nullable columns added to OrderItem and OrderItemAddon
- [ ] **Migration**: Successfully applied to database
- [ ] **Backfill**: All existing records have snapshots populated
- [ ] **POS Creation**: New transactions capture snapshots
- [ ] **Reports**: Use snapshot fields (with fallback)
- [ ] **Receipts**: Display snapshot data
- [ ] **Tests**: Pass for snapshot scenarios
- [ ] **Monitoring**: Coverage at 100%
- [ ] **Documentation**: Updated with Phase 1 status

## Success Criteria

✅ **All new transactions have non-null Phase 1 snapshots**
✅ **Product renames don't affect historical reports**
✅ **Category changes don't affect historical data**
✅ **Receipts display accurate historical product names**
✅ **No breaking changes to existing functionality**

## Estimated Time: 4 hours

## Next Phase
After Phase 1 is complete and validated, proceed to **Phase 2: Unit & Tax Snapshots** (2 hours).
