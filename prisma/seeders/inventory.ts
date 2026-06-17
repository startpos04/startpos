import { MovementType, type PrismaClient, ResourceType } from 'prisma/generated/prisma/client'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { UnitEngine } from '@/lib/conversion/unit-engine'
import { getAccounts } from './accounts'
export const order = 100

export async function Inventory(prisma: PrismaClient, options: { folder: string }) {
  console.info('📦 Normalizing Costs & Seeding Variant Inventory...')
  const targetFolder = options.folder || 'examples'
  const accounts = getAccounts(targetFolder)

  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN', memberships: { some: { business: { id: accounts.business.id }, branch: { id: accounts.branch.id } } } },
  })

  if (!adminUser) {
    throw new Error('❌ Seed Error: No Admin user found. Please seed users before inventory.')
  }

  const rawMaterialVariants = await prisma.productVariant.findMany({
    where: {
      product: { type: { in: [ResourceType.RAW_MATERIAL, ResourceType.PHYSICAL_GOOD] } },
    },
    include: { product: { include: { baseUnit: true } } },
  })

  const kgUnit = await prisma.unit.findFirst({ where: { abbreviation: 'kg' } })
  const literUnit = await prisma.unit.findFirst({ where: { abbreviation: 'L' } })

  const seededSummary: Array<{ name: string; sku: string; qty: number; unit: string; cost: number }> = []

  // 🚀 Wrap the ENTIRE loop block in a single transaction (or remove it entirely)
  // Give it a generous timeout cushion to prevent expiration errors

  for (const variant of rawMaterialVariants) {
    const baseUnit = variant.product.baseUnit
    let purchaseUnit = baseUnit

    if (baseUnit.abbreviation === 'g' && kgUnit) purchaseUnit = kgUnit
    if (baseUnit.abbreviation === 'ml' && literUnit) purchaseUnit = literUnit

    const bulkPriceCents = PriceEngine.toCents(150.0)
    const normalizedCostPriceCents = Math.round(PriceEngine.costPerBase ? PriceEngine.costPerBase(bulkPriceCents, purchaseUnit) : bulkPriceCents)

    const purchaseQty = 100
    let totalInBaseUnits = UnitEngine.toBase(purchaseQty, purchaseUnit)

    if (purchaseUnit.abbreviation === 'pcs') totalInBaseUnits = purchaseQty

    // 1. Update Variant (using the consolidated `tx` context)
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { costPrice: normalizedCostPriceCents },
    })

    // 2. Create Inventory
    const batchNumber = `INIT-${variant.sku || Math.random().toString(36).substring(2, 7).toUpperCase()}`
    const inventory = await prisma.inventory.create({
      data: {
        businessId: accounts.business.id,
        branchId: accounts.branch.id,
        variantId: variant.id,
        unitId: baseUnit.id,
        quantity: totalInBaseUnits,
        costPrice: normalizedCostPriceCents,
        batchNumber,
      },
    })

    // 3. Log Movement
    await prisma.inventoryMovement.create({
      data: {
        businessId: accounts.business.id,
        branchId: accounts.branch.id,
        inventoryId: inventory.id,
        userId: adminUser.id,
        variantId: variant.id,
        unitId: baseUnit.id,
        quantity: totalInBaseUnits,
        type: MovementType.IN,
        reason: 'Initial Seed Restock',
      },
    })

    seededSummary.push({
      name: variant.name || variant.product.name,
      sku: variant.sku || 'N/A',
      qty: totalInBaseUnits,
      unit: baseUnit.abbreviation,
      cost: normalizedCostPriceCents,
    })
  }

  // --- OUTPUT STOCK REPORTS ---
  if (seededSummary.length > 0) {
    console.info('\n📊 SEEDED INGREDIENT BREAKDOWN:')
    console.table(
      seededSummary.map(item => ({
        'Ingredient Name': item.name,
        SKU: item.sku,
        'Stock Added': `${item.qty.toLocaleString()} ${item.unit}`,
        'Base Cost': `₱${(item.cost / 100).toFixed(2)}`,
      })),
    )
  } else {
    console.warn('⚠️ No raw material ingredients found to seed.')
  }

  console.info('✅ Variant Inventory Seeded successfully.')
}
