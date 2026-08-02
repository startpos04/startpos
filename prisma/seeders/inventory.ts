// fallow-ignore-file unused-file
/** biome-ignore-all lint/suspicious/noExplicitAny: seeder */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import { MovementType, type PrismaClient, ResourceType } from 'prisma/generated/prisma/client'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { UnitEngine } from '@/lib/conversion/unit-engine'
import { getAccounts } from './accounts'
export const order = 100

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_DIR = path.join(__dirname, 'csv')

interface InventoryRow {
  id: string
  variantId: string
  quantity: number
  unitAbbreviation: string
  batchNumber: string
  costPrice: number
  locationName: string | null
}

function parseInventoryCsv(folder: string): InventoryRow[] | null {
  const filePath = path.join(CSV_DIR, folder, 'inventory.csv')
  if (!fs.existsSync(filePath)) return null

  const { data, meta } = Papa.parse(fs.readFileSync(filePath, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  })

  const required = ['id', 'variantId', 'quantity', 'unitAbbreviation', 'batchNumber', 'costPrice']
  const missing = required.filter(h => !meta.fields?.includes(h))
  if (missing.length > 0) {
    throw new Error(`❌ inventory.csv missing columns: [${missing.join(', ')}]`)
  }

  return (data as any[]).map(row => ({
    id: String(row.id).trim(),
    variantId: String(row.variantId).trim(),
    quantity: parseFloat(row.quantity) || 0,
    unitAbbreviation: String(row.unitAbbreviation).trim(),
    batchNumber: String(row.batchNumber).trim(),
    costPrice: parseInt(row.costPrice, 10) || 0,
    locationName: row.locationName?.trim() || null,
  }))
}

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

  // ---------------------------------------------------------------------------
  // CSV PATH — explicit inventory rows from csv/<folder>/inventory.csv
  // ---------------------------------------------------------------------------
  const csvRows = parseInventoryCsv(targetFolder)

  if (csvRows) {
    console.info(`📈 Hydrating inventory from csv/${targetFolder}/inventory.csv (${csvRows.length} rows)...`)

    for (const row of csvRows) {
      const unit = await prisma.unit.findUnique({ where: { abbreviation: row.unitAbbreviation } })
      if (!unit) {
        console.warn(`  ⚠️  Skipping inventory row ${row.id}: unit "${row.unitAbbreviation}" not found.`)
        continue
      }

      let locationId: string | null = null
      if (row.locationName) {
        const loc = await prisma.location.findFirst({ where: { name: row.locationName, branchId: accounts.branch.id } })
        locationId = loc?.id ?? null
      }

      await prisma.inventory.upsert({
        where: { id: row.id },
        update: { quantity: row.quantity, costPrice: row.costPrice, batchNumber: row.batchNumber, locationId },
        create: {
          id: row.id,
          variantId: row.variantId,
          unitId: unit.id,
          quantity: row.quantity,
          costPrice: row.costPrice,
          batchNumber: row.batchNumber,
          locationId,
          businessId: accounts.business.id,
          branchId: accounts.branch.id,
        },
      })

      if (row.quantity > 0) {
        await prisma.inventoryMovement.upsert({
          where: { id: `mov-${row.id}` },
          update: {},
          create: {
            id: `mov-${row.id}`,
            variantId: row.variantId,
            userId: adminUser.id,
            type: MovementType.IN,
            quantity: row.quantity,
            unitId: unit.id,
            inventoryId: row.id,
            reason: 'Initial Seed Restock',
            businessId: accounts.business.id,
            branchId: accounts.branch.id,
          },
        })
      }
    }

    console.info('✅ Variant Inventory Seeded from CSV successfully.')
    return
  }

  // ---------------------------------------------------------------------------
  // FALLBACK PATH — auto-generate inventory for all raw material variants.
  // Used when no inventory.csv exists (e.g. examples/ without explicit stock).
  // ---------------------------------------------------------------------------
  console.info('📈 No inventory.csv found — auto-generating from raw material variants...')

  const rawMaterialVariants = await prisma.productVariant.findMany({
    where: {
      product: {
        type: { in: [ResourceType.RAW_MATERIAL, ResourceType.PHYSICAL_GOOD] },
        businessId: accounts.business.id,
      },
    },
    include: { product: { include: { baseUnit: true } } },
  })

  const kgUnit = await prisma.unit.findFirst({ where: { abbreviation: 'kg' } })
  const literUnit = await prisma.unit.findFirst({ where: { abbreviation: 'L' } })

  const seededSummary: Array<{ name: string; sku: string; qty: number; unit: string; cost: number }> = []

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

    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { costPrice: normalizedCostPriceCents },
    })

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
