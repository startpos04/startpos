import { PriceEngine } from '@/lib/conversion/price-engine'
import { UnitEngine } from '@/lib/conversion/unit-engine'
import { MovementType, PrismaClient, ResourceType } from 'prisma/generated/prisma/client'

export async function initialInventory(prisma: PrismaClient) {
  console.log('📦 Normalizing Costs & Seeding Inventory...')

  // 1. Get a real user first to avoid Foreign Key errors
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  })

  if (!adminUser) {
    throw new Error('❌ Seed Error: No Admin user found. Please seed users before inventory.')
  }

  const rawMaterials = await prisma.product.findMany({
    where: { type: ResourceType.RAW_MATERIAL },
    include: { baseUnit: true },
  })

  const kgUnit = await prisma.unit.findFirst({ where: { abbreviation: 'kg' } })
  const literUnit = await prisma.unit.findFirst({ where: { abbreviation: 'L' } })

  for (const item of rawMaterials) {
    await prisma.$transaction(async tx => {
      let purchaseUnit = item.baseUnit
      if (item.baseUnit.abbreviation === 'g' && kgUnit) purchaseUnit = kgUnit
      if (item.baseUnit.abbreviation === 'ml' && literUnit) purchaseUnit = literUnit

      // Calculation logic
      const bulkPriceCents = PriceEngine.toCents(150.0)
      const normalizedCostPriceCents = Math.round(PriceEngine.costPerBase(bulkPriceCents, purchaseUnit))
      const purchaseQty = 10
      const totalInBaseUnits = UnitEngine.toBase(purchaseQty, purchaseUnit)

      // 2. Update Product
      await tx.product.update({
        where: { id: item.id },
        data: { costPrice: normalizedCostPriceCents },
      })

      // 3. Create Inventory
      await tx.inventory.create({
        data: {
          branchId: 'branch-1',
          productId: item.id,
          unitId: item.baseUnitId,
          quantity: totalInBaseUnits,
          costPrice: normalizedCostPriceCents,
          batchNumber: `INIT-${item.sku}`,
        },
      })

      // 4. Log Movement (Now using a REAL userId)
      await tx.inventoryMovement.create({
        data: {
          branchId: 'branch-1',
          userId: adminUser.id, // ✅ Real ID from the DB
          productId: item.id,
          unitId: item.baseUnitId,
          quantity: totalInBaseUnits,
          type: MovementType.IN,
          reason: 'Initial Seed Restock',
        },
      })
    })
  }
  console.log('✅ Inventory Seeded successfully.')
}
