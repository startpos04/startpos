# Phase 2: Unit & Tax Snapshots - AI Agent Execution Plan

## Context for AI Agent

**Goal**: Add snapshot fields to capture unit details and tax categories at transaction time for compliance and accurate unit conversions.

**What to snapshot**: Unit name, abbreviation, type, and tax category for both order items and addons.

**Why**: When users change unit names/conversions or tax categories, historical reports and tax calculations become incorrect. This breaks BIR compliance.

**Tables to modify**: 
- `OrderItem` (add 4 fields)
- `OrderItemAddon` (add 3 fields)

**Total fields**: 7 fields (4 strings, 3 enums)

**Prerequisites**: Phase 1 must be completed.

---

## Step 1: Schema Migration (Prisma)

### Objective
Add 7 fields to OrderItem and OrderItemAddon for unit and tax snapshots.

### File to modify
`web/prisma/schema.prisma`

### Exact changes

#### 1a. Locate OrderItem model and find Phase 1 snapshots

Find the Phase 1 snapshot fields you added:
```prisma
  // --- SNAPSHOT FIELDS: Phase 1 (Product/Variant/Category) ---
  snapshotProductName  String?
  snapshotVariantName  String?
  snapshotCategoryName String?
  snapshotSku          String?
  snapshotProductType  String?
  snapshotProductImage String?
```

#### 1b. Add Phase 2 snapshots IMMEDIATELY AFTER Phase 1 section

Insert these lines:
```prisma
  // --- SNAPSHOT FIELDS: Phase 2 (Unit & Tax) ---
  // Captured at time of sale for accurate unit conversions and tax compliance.
  snapshotUnitName     String?      // Unit display name, e.g. "kilogram", "piece"
  snapshotUnitAbbrev   String?      // Unit abbreviation, e.g. "kg", "pcs"
  snapshotUnitType     String?      // Unit type, e.g. "WEIGHT", "COUNT"
  snapshotTaxCategory  TaxCategory? // Tax category at time of sale: STANDARD, EXEMPT, ZERO_RATED
```

#### 1c. Locate OrderItemAddon model and find Phase 1 snapshots

Find the Phase 1 addon snapshots:
```prisma
  // --- SNAPSHOT FIELDS: Phase 1 (Addon Details) ---
  snapshotAddonProductName String?
  snapshotAddonVariantName String?
  snapshotAddonSku         String?
```

#### 1d. Add Phase 2 addon snapshots IMMEDIATELY AFTER Phase 1 section

Insert these lines:
```prisma
  // --- SNAPSHOT FIELDS: Phase 2 (Addon Unit & Tax) ---
  snapshotAddonUnitName    String?      // Addon unit display name
  snapshotAddonUnitAbbrev  String?      // Addon unit abbreviation
  snapshotAddonTaxCategory TaxCategory? // Addon tax category at time of sale
```

### Commands to run

```bash
cd web
npx prisma migrate dev --name phase2_unit_tax_snapshots
```

### Validation
- [ ] Migration file created
- [ ] Migration applies successfully
- [ ] Prisma Client regenerated
- [ ] 4 new columns in order_items table
- [ ] 3 new columns in order_item_addons table

---

## Step 2: Backfill Script

### Objective
Populate Phase 2 snapshot fields for existing records.

### Create new file
`web/scripts/backfill-phase2-snapshots.ts`

### File contents

```typescript
import { PrismaClient } from './prisma/generated/prisma'

const prisma = new PrismaClient()

const BATCH_SIZE = 500

async function backfillOrderItemPhase2() {
  console.log('🔄 Phase 2: Backfilling OrderItem unit & tax snapshots...')
  
  let processedCount = 0
  let hasMore = true
  
  while (hasMore) {
    // Fetch items without Phase 2 snapshots
    const items = await prisma.orderItem.findMany({
      where: {
        snapshotUnitName: null // Phase 2 indicator
      },
      include: {
        unit: true,
        variant: true
      },
      take: BATCH_SIZE
    })
    
    if (items.length === 0) {
      hasMore = false
      break
    }
    
    const updates = items.map(item => {
      return prisma.orderItem.update({
        where: { id: item.id },
        data: {
          snapshotUnitName: item.unit.name,
          snapshotUnitAbbrev: item.unit.abbreviation,
          snapshotUnitType: item.unit.type,
          snapshotTaxCategory: item.variant.taxCategory
        }
      })
    })
    
    await Promise.all(updates)
    
    processedCount += items.length
    console.log(`  ✓ Backfilled ${processedCount} OrderItems (Phase 2)...`)
  }
  
  console.log(`✅ Phase 2 OrderItem backfill complete: ${processedCount} records`)
}

async function backfillOrderItemAddonPhase2() {
  console.log('🔄 Phase 2: Backfilling OrderItemAddon unit & tax snapshots...')
  
  let processedCount = 0
  let hasMore = true
  
  while (hasMore) {
    const addons = await prisma.orderItemAddon.findMany({
      where: {
        snapshotAddonUnitName: null // Phase 2 indicator
      },
      include: {
        addon: {
          include: {
            product: {
              include: {
                baseUnit: true
              }
            }
          }
        }
      },
      take: BATCH_SIZE
    })
    
    if (addons.length === 0) {
      hasMore = false
      break
    }
    
    const updates = addons.map(addon => {
      // Use addon product's base unit
      const unit = addon.addon.product.baseUnit
      
      return prisma.orderItemAddon.update({
        where: { id: addon.id },
        data: {
          snapshotAddonUnitName: unit.name,
          snapshotAddonUnitAbbrev: unit.abbreviation,
          snapshotAddonTaxCategory: addon.addon.taxCategory
        }
      })
    })
    
    await Promise.all(updates)
    
    processedCount += addons.length
    console.log(`  ✓ Backfilled ${processedCount} OrderItemAddons (Phase 2)...`)
  }
  
  console.log(`✅ Phase 2 OrderItemAddon backfill complete: ${processedCount} records`)
}

async function main() {
  console.log('🚀 Starting Phase 2 Snapshot Backfill...')
  console.log('📊 This will populate unit & tax snapshot fields')
  console.log('')
  
  try {
    await backfillOrderItemPhase2()
    await backfillOrderItemAddonPhase2()
    
    console.log('')
    console.log('✅ Phase 2 backfill completed successfully!')
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
npx tsx scripts/backfill-phase2-snapshots.ts
```

### Validation
- [ ] Script completes without errors
- [ ] All OrderItems have non-null snapshotUnitName
- [ ] All OrderItemAddons have non-null snapshotAddonUnitName

---

## Step 3: Update POS Creation (Add Phase 2 Snapshots)

### Objective
Add unit and tax snapshot capture to existing POS transaction creation code.

### Find the code you modified in Phase 1

Look for the OrderItem creation code where you added Phase 1 snapshots:

```typescript
await prisma.orderItem.create({
  data: {
    // ... existing fields ...
    
    // 📸 PHASE 1 SNAPSHOTS (already there)
    snapshotProductName: variant.product.name,
    snapshotVariantName: variant.name,
    snapshotCategoryName: variant.product.category.name,
    snapshotSku: variant.sku,
    snapshotProductType: variant.product.type,
    snapshotProductImage: variant.image || variant.product.image,
    
    // ... rest of fields
  }
})
```

### Add Phase 2 snapshots

You'll need to fetch the unit data first:

```typescript
// Fetch related data for snapshots (expand existing fetch)
const variant = await prisma.productVariant.findUniqueOrThrow({
  where: { id: item.variantId },
  include: {
    product: {
      include: {
        category: true,
        baseUnit: true // ADD THIS for Phase 2
      }
    }
  }
})

// Fetch the unit being used for this order item
const unit = await prisma.unit.findUniqueOrThrow({
  where: { id: item.unitId }
})

await prisma.orderItem.create({
  data: {
    // ... existing fields ...
    
    // 📸 PHASE 1 SNAPSHOTS (already there)
    snapshotProductName: variant.product.name,
    snapshotVariantName: variant.name,
    snapshotCategoryName: variant.product.category.name,
    snapshotSku: variant.sku,
    snapshotProductType: variant.product.type,
    snapshotProductImage: variant.image || variant.product.image,
    
    // 📸 PHASE 2 SNAPSHOTS (ADD THESE)
    snapshotUnitName: unit.name,
    snapshotUnitAbbrev: unit.abbreviation,
    snapshotUnitType: unit.type,
    snapshotTaxCategory: variant.taxCategory,
    
    // ... rest of fields
  }
})
```

### For OrderItemAddon

Find your Phase 1 addon creation code and add Phase 2:

```typescript
// Fetch addon unit details
const addonVariant = await prisma.productVariant.findUniqueOrThrow({
  where: { id: addon.variantId },
  include: {
    product: {
      include: {
        baseUnit: true // For unit details
      }
    }
  }
})

await prisma.orderItemAddon.create({
  data: {
    // ... existing fields ...
    
    // 📸 PHASE 1 SNAPSHOTS (already there)
    snapshotAddonProductName: addonVariant.product.name,
    snapshotAddonVariantName: addonVariant.name,
    snapshotAddonSku: addonVariant.sku,
    
    // 📸 PHASE 2 SNAPSHOTS (ADD THESE)
    snapshotAddonUnitName: addonVariant.product.baseUnit.name,
    snapshotAddonUnitAbbrev: addonVariant.product.baseUnit.abbreviation,
    snapshotAddonTaxCategory: addonVariant.taxCategory,
    
    // ... rest of fields
  }
})
```

### Validation
- [ ] Create new transaction in POS
- [ ] Verify Phase 2 snapshots populated in database
- [ ] Check snapshotUnitName, snapshotUnitAbbrev, snapshotUnitType
- [ ] Check snapshotTaxCategory is set

---

## Step 4: Update Tax Reports

### Objective
Update BIR tax reports to use snapshotTaxCategory instead of live variant.taxCategory.

### Files to find

```bash
cd web
grep -r "taxCategory\|VAT.*report\|tax.*calculation" src/ --include="*.ts" --include="*.tsx"
```

### Generic modification pattern

**BEFORE** (using live tax category):
```typescript
const taxReport = await prisma.orderItem.findMany({
  where: {
    createdAt: { gte: startDate, lte: endDate }
  },
  include: {
    variant: true // To access variant.taxCategory
  }
})

// Group by tax category
const grouped = taxReport.reduce((acc, item) => {
  const taxCat = item.variant.taxCategory
  if (!acc[taxCat]) acc[taxCat] = { amount: 0, tax: 0 }
  acc[taxCat].amount += item.unitPrice * item.quantity
  return acc
}, {})
```

**AFTER** (using snapshot with fallback):
```typescript
const taxReport = await prisma.orderItem.findMany({
  where: {
    createdAt: { gte: startDate, lte: endDate }
  },
  select: {
    snapshotTaxCategory: true, // Phase 2 snapshot
    unitPrice: true,
    quantity: true,
    variant: {
      select: {
        taxCategory: true // Fallback for pre-Phase 2 records
      }
    }
  }
})

// Group by tax category (use snapshot with fallback)
const grouped = taxReport.reduce((acc, item) => {
  // Use snapshot if available, fallback to live data
  const taxCat = item.snapshotTaxCategory || item.variant.taxCategory
  if (!acc[taxCat]) acc[taxCat] = { amount: 0, tax: 0 }
  acc[taxCat].amount += item.unitPrice * item.quantity
  return acc
}, {})
```

### Validation
- [ ] Generate tax report for historical period
- [ ] Change a variant's tax category in admin
- [ ] Regenerate report - old transactions show old category
- [ ] Create new transaction
- [ ] New transaction shows new tax category in reports

---

## Step 5: Update Receipt Unit Display

### Objective
Update receipt printing to show unit abbreviations from snapshots.

### Find receipt code from Phase 1

Locate the receipt formatting function you modified in Phase 1:

```typescript
function formatReceiptLine(orderItem: OrderItem) {
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

### Add Phase 2 unit display

```typescript
function formatReceiptLine(orderItem: OrderItem & { unit: Unit, variant: any }) {
  // Phase 1 snapshots
  const productName = orderItem.snapshotProductName || orderItem.variant.product.name
  const variantName = orderItem.snapshotVariantName || orderItem.variant.name
  
  // Phase 2 snapshot - unit abbreviation
  const unitAbbrev = orderItem.snapshotUnitAbbrev || orderItem.unit.abbreviation
  
  return {
    description: `${productName}${variantName ? ` (${variantName})` : ''}`,
    quantity: `${orderItem.quantity} ${unitAbbrev}`, // ADD UNIT HERE
    unitPrice: formatCurrency(orderItem.unitPrice),
    total: formatCurrency(orderItem.unitPrice * orderItem.quantity)
  }
}
```

### Validation
- [ ] Print new receipt - shows unit abbreviation (e.g., "2.5 kg")
- [ ] Change unit abbreviation in admin
- [ ] Reprint old receipt - still shows old abbreviation
- [ ] Print new receipt - shows new abbreviation

---

## Step 6: Testing

### Create test file
`web/__tests__/phase2-snapshots.test.ts`

### Test contents

```typescript
import { describe, it, expect } from 'vitest'
import { PrismaClient, TaxCategory } from '../prisma/generated/prisma'

const prisma = new PrismaClient()

describe('Phase 2: Unit & Tax Snapshots', () => {
  it('should capture unit snapshots when creating OrderItem', async () => {
    const orderItem = await prisma.orderItem.create({
      data: {
        // ... required fields ...
        snapshotUnitName: 'kilogram',
        snapshotUnitAbbrev: 'kg',
        snapshotUnitType: 'WEIGHT',
        snapshotTaxCategory: TaxCategory.STANDARD
      }
    })

    expect(orderItem.snapshotUnitName).toBe('kilogram')
    expect(orderItem.snapshotUnitAbbrev).toBe('kg')
    expect(orderItem.snapshotUnitType).toBe('WEIGHT')
    expect(orderItem.snapshotTaxCategory).toBe(TaxCategory.STANDARD)
  })

  it('should preserve tax category snapshot when variant tax changes', async () => {
    // Create transaction with STANDARD tax
    const orderItem = await prisma.orderItem.create({
      data: {
        // ... fields ...
        snapshotTaxCategory: TaxCategory.STANDARD
      }
    })

    // Change variant tax category to EXEMPT
    await prisma.productVariant.update({
      where: { id: orderItem.variantId },
      data: { taxCategory: TaxCategory.EXEMPT }
    })

    // Snapshot should still show STANDARD
    const fetched = await prisma.orderItem.findUnique({
      where: { id: orderItem.id }
    })
    expect(fetched?.snapshotTaxCategory).toBe(TaxCategory.STANDARD)
  })
})
```

### Run tests

```bash
cd web
npm test phase2-snapshots.test.ts
```

### Manual testing checklist
- [ ] Create transaction with specific unit (e.g., "kilogram")
- [ ] Rename unit to "Kilo"
- [ ] Generate report - old transactions still show "kilogram"
- [ ] Create transaction with STANDARD tax
- [ ] Change variant to EXEMPT
- [ ] Tax report shows old transactions as STANDARD

---

## Step 7: Monitoring

### Create coverage check
`web/scripts/check-phase2-coverage.ts`

```typescript
import { PrismaClient } from './prisma/generated/prisma'

const prisma = new PrismaClient()

async function checkPhase2Coverage() {
  const totalOrderItems = await prisma.orderItem.count()
  const withPhase2 = await prisma.orderItem.count({
    where: {
      snapshotUnitName: { not: null }
    }
  })
  
  const totalAddons = await prisma.orderItemAddon.count()
  const addonsWithPhase2 = await prisma.orderItemAddon.count({
    where: {
      snapshotAddonUnitName: { not: null }
    }
  })
  
  const orderItemCoverage = (withPhase2 / totalOrderItems * 100).toFixed(2)
  const addonCoverage = (addonsWithPhase2 / totalAddons * 100).toFixed(2)
  
  console.log('📊 Phase 2 Snapshot Coverage Report')
  console.log('=====================================')
  console.log(`OrderItem: ${withPhase2}/${totalOrderItems} (${orderItemCoverage}%)`)
  console.log(`OrderItemAddon: ${addonsWithPhase2}/${totalAddons} (${addonCoverage}%)`)
  
  if (orderItemCoverage === '100.00' && addonCoverage === '100.00') {
    console.log('✅ Phase 2 coverage is 100%!')
  } else {
    console.log('⚠️  Some records missing Phase 2 snapshots')
  }
}

checkPhase2Coverage().finally(() => prisma.$disconnect())
```

### Run check

```bash
cd web
npx tsx scripts/check-phase2-coverage.ts
```

---

## Phase 2 Completion Checklist

- [ ] **Schema**: 7 fields added (4 to OrderItem, 3 to OrderItemAddon)
- [ ] **Migration**: Applied successfully
- [ ] **Backfill**: All existing records have Phase 2 snapshots
- [ ] **POS Creation**: New transactions capture Phase 2 snapshots
- [ ] **Tax Reports**: Use snapshotTaxCategory
- [ ] **Receipts**: Display unit abbreviations from snapshots
- [ ] **Tests**: Pass for Phase 2 scenarios
- [ ] **Coverage**: 100% for Phase 2 fields

## Success Criteria

✅ **All new transactions have Phase 2 snapshots**
✅ **Unit name changes don't affect historical reports**
✅ **Tax category changes don't affect historical tax calculations**
✅ **Receipts show accurate historical unit names**
✅ **BIR compliance maintained**

## Estimated Time: 2 hours

## Next Phase
After Phase 2 is complete, proceed to **Phase 3: Business/Branch Snapshots** (3 hours).
