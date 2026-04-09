import { PriceEngine } from '@/lib/conversion/price-engine'
import { UnitEngine } from '@/lib/conversion/unit-engine'
import { MovementType, PrismaClient, ResourceType } from 'prisma/generated/prisma/client'

export async function initialInventory(prisma: PrismaClient) {
  console.log('📦 Normalizing Costs & Seeding Variant Inventory...')

  // 1. Get a real user first to avoid Foreign Key errors
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  })

  if (!adminUser) {
    throw new Error('❌ Seed Error: No Admin user found. Please seed users before inventory.')
  }

  // Fetch variants that belong to RAW_MATERIAL products
  // These are the "Materials" used in your ProductComponent table
  const rawMaterialVariants = await prisma.productVariant.findMany({
    where: {
      product: {
        type: ResourceType.RAW_MATERIAL,
      },
    },
    include: {
      product: {
        include: {
          baseUnit: true,
        },
      },
    },
  })

  const kgUnit = await prisma.unit.findFirst({ where: { abbreviation: 'kg' } })
  const literUnit = await prisma.unit.findFirst({ where: { abbreviation: 'L' } })

  for (const variant of rawMaterialVariants) {
    await prisma.$transaction(async tx => {
      const baseUnit = variant.product.baseUnit
      let purchaseUnit = baseUnit

      // Standardize to bulk units for cost calculation
      if (baseUnit.abbreviation === 'g' && kgUnit) purchaseUnit = kgUnit
      if (baseUnit.abbreviation === 'ml' && literUnit) purchaseUnit = literUnit

      // Calculation logic: Assume a flat starting cost for seeding
      const bulkPriceCents = PriceEngine.toCents(150.0) // ₱150.00 base
      const normalizedCostPriceCents = Math.round(PriceEngine.costPerBase(bulkPriceCents, purchaseUnit))

      const purchaseQty = 10 // Start with 10 bulk units (10kg or 10L)
      const totalInBaseUnits = UnitEngine.toBase(purchaseQty, purchaseUnit)

      // 2. Update Variant (Costs live here)
      // This is crucial because ProductComponent references this costPrice for profit margins
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { costPrice: normalizedCostPriceCents },
      })

      // 3. Create Inventory (Linked to Variant)
      const inventory = await tx.inventory.create({
        data: {
          organizationId: 'org-1',
          branchId: 'branch-1',
          variantId: variant.id,
          unitId: baseUnit.id,
          quantity: totalInBaseUnits,
          costPrice: normalizedCostPriceCents,
          batchNumber: `INIT-${variant.sku}`,
        },
      })

      // 4. Log Movement (Linked to Variant)
      await tx.inventoryMovement.create({
        data: {
          organizationId: 'org-1',
          branchId: 'branch-1',
          inventoryId: inventory.id,
          userId: adminUser.id,
          variantId: variant.id,
          unitId: baseUnit.id,
          quantity: totalInBaseUnits,
          type: MovementType.IN,
          reason: 'Initial Seed Restock',
        },
      })
    })
  }
  console.log('✅ Variant Inventory Seeded successfully.')
}
