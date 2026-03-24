import { PrismaClient, ResourceType } from 'prisma/generated/prisma/client'

export async function initialInventory(prisma: PrismaClient) {
  console.log('📦 Initializing physical inventory for raw materials with Unit tracking...')

  // 1. Fetch all Raw Materials (including their baseUnitId which is required now)
  const rawMaterials = await prisma.product.findMany({
    where: { type: ResourceType.RAW_MATERIAL },
  })

  if (rawMaterials.length === 0) {
    console.warn('⚠️ No raw materials found. Please run initialProducts first.')
    return
  }

  const now = new Date()

  for (const item of rawMaterials) {
    // 2. Define our simulated batches
    // We use the item.baseUnitId to ensure the inventory matches the product's primary unit
    const batches = [
      {
        batchNumber: `BATCH-${item.sku}-A`,
        quantity: 50.0,
        // Expiring in 1 month
        expiryDate: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
        location: 'Primary Chiller',
      },
      {
        batchNumber: `BATCH-${item.sku}-B`,
        quantity: 150.0,
        // Expiring in 6 months
        expiryDate: new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()),
        location: 'Back Warehouse',
      },
    ]

    for (const batch of batches) {
      await prisma.inventory.create({
        data: {
          productId: item.id,
          batchNumber: batch.batchNumber,
          quantity: batch.quantity,

          // --- THE FIX: Pass the unitId from the product's base unit ---
          unitId: item.baseUnitId,

          expiryDate: item.hasExpiry ? batch.expiryDate : null,
          location: batch.location,
          lastRestocked: now,
        },
      })
    }
    console.log(`✅ Stocked 200 units for: ${item.name} (${item.sku}) in its base unit.`)
  }

  console.log('✨ Inventory initialization complete.')
}
