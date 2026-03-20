import { PrismaClient, ResourceType } from 'prisma/generated/prisma/client'

export async function initialInventory(prisma: PrismaClient) {
  console.log('📦 Initializing physical inventory for raw materials...')

  // 1. Fetch all Raw Materials we created in the previous step
  const rawMaterials = await prisma.product.findMany({
    where: { type: ResourceType.RAW_MATERIAL },
  })

  if (rawMaterials.length === 0) {
    console.warn('⚠️ No raw materials found. Please run initialProducts first.')
    return
  }

  const now = new Date()

  for (const item of rawMaterials) {
    // We will create TWO batches for each item to simulate real-world stock management
    // Batch 1: Expiring sooner (1 month from now)
    // Batch 2: Expiring later (6 months from now)

    const batches = [
      {
        batchNumber: `BATCH-${item.sku}-A`,
        quantity: 50.0,
        expiryDate: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
        location: 'Primary Chiller',
      },
      {
        batchNumber: `BATCH-${item.sku}-B`,
        quantity: 150.0,
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
          expiryDate: item.hasExpiry ? batch.expiryDate : null,
          location: batch.location,
          lastRestocked: now,
        },
      })
    }
    console.log(`✅ Stocked 200 units for: ${item.name} (${item.sku})`)
  }

  console.log('✨ Inventory initialization complete.')
}
