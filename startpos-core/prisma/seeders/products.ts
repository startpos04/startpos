// fallow-ignore-file unused-file
/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { ResourceType, TaxCategory, VariantAttributeType } from 'prisma/generated/prisma/enums'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { getCroppedImg } from '@/lib/utils/crop-image'
import { getAccounts } from './accounts'
export const order = 3

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PRODUCTS_CSV_DIR = path.join(__dirname, 'csv')

// Explicit Type System Contracts
interface CategoryRow {
  name: string
}

interface FlattenedVariantRow {
  productId: string
  productName: string
  productType: ResourceType
  categoryName: string
  baseUnitAbbreviation: string
  variantId: string
  variantName: string
  image: string
  sku: string
  price: number
  costPrice: number
  attributeType: VariantAttributeType
  taxCategory: TaxCategory
  lowStockThreshold: number
}

interface RecipeRow {
  hostVariantId: string
  materialVariantId: string
  unitAbbreviation: string
  quantityUsed: number
  isAddon: boolean
  priceOverride: number | null
}

function parseProductsCsvRequired<T>(folder: string, fileName: string, requiredHeaders: string[]): T[] {
  const targetPath = path.join(PRODUCTS_CSV_DIR, folder, fileName)

  if (!fs.existsSync(targetPath)) {
    throw new Error(`❌ Ingestion aborted. Required product file is missing: "csv/${folder}/${fileName}"`)
  }

  const fileContent = fs.readFileSync(targetPath, 'utf-8')
  const { data, meta } = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  })

  const missingHeaders = requiredHeaders.filter(h => !meta.fields?.includes(h))
  if (missingHeaders.length > 0) {
    throw new Error(`❌ Product catalog parse failure in ${fileName}. Missing required columns: [${missingHeaders.join(', ')}]`)
  }

  return data as T[]
}

export async function Products(prisma: PrismaClient, options: { folder: string }) {
  const accounts = getAccounts(options.folder)

  // --- RESOLVE CATEGORIES ---
  const categoriesCsv = parseProductsCsvRequired<any>(options.folder, 'categories.csv', ['name'])
  console.info(`📈 Hydrating product classifications from csv/${options.folder}/categories.csv...`)
  const runtimeCategories: CategoryRow[] = categoriesCsv.map(row => ({ name: String(row.name).trim() }))

  // --- RESOLVE FLATTENED VARIANTS & PRODUCTS ---
  const variantsCsv = parseProductsCsvRequired<any>(options.folder, 'product-variants.csv', ['productId', 'variantId', 'sku'])
  console.info(`📈 Hydrating variant profiles from csv/${options.folder}/product-variants.csv...`)
  const runtimeVariants: FlattenedVariantRow[] = variantsCsv.map(row => ({
    productId: String(row.productId).trim(),
    productName: String(row.productName).trim(),
    productType: (String(row.productType).trim() as ResourceType) || ResourceType.PHYSICAL_GOOD,
    categoryName: String(row.categoryName).trim(),
    baseUnitAbbreviation: String(row.baseUnitAbbreviation).trim(),
    variantId: String(row.variantId).trim(),
    variantName: String(row.variantName).trim(),
    image: String(row.image).trim(),
    sku: String(row.sku).trim(),
    price: parseInt(row.price, 10) || 0,
    costPrice: parseInt(row.costPrice, 10) || 0,
    attributeType: (String(row.attributeType).trim() as VariantAttributeType) || VariantAttributeType.UNSPECIFIED,
    taxCategory: (String(row.taxCategory).trim() as TaxCategory) || TaxCategory.STANDARD,
    lowStockThreshold: parseInt(row.lowStockThreshold, 10) || 0,
  }))

  // --- RESOLVE RECIPES ---
  const recipesCsv = parseProductsCsvRequired<any>(options.folder, 'product-recipes.csv', ['hostVariantId', 'materialVariantId', 'quantityUsed'])
  console.info(`📈 Hydrating recipes from csv/${options.folder}/product-recipes.csv...`)
  const runtimeRecipes: RecipeRow[] = recipesCsv.map(row => ({
    hostVariantId: String(row.hostVariantId).trim(),
    materialVariantId: String(row.materialVariantId).trim(),
    unitAbbreviation: String(row.unitAbbreviation).trim(),
    quantityUsed: parseFloat(row.quantityUsed) || 1.0,
    isAddon: String(row.isAddon).trim().toLowerCase() === 'true',
    priceOverride: row.priceOverride && String(row.priceOverride).trim() !== '' ? parseInt(row.priceOverride, 10) : null,
  }))

  // =======================================================
  // EXECUTION LAYER: INITIALIZE CATEGORIES MAP
  // =======================================================
  console.info('🗂️ Syncing multi-tenant point-of-sale store categories...')
  const categoryMap = new Map<string, string>()

  for (const cat of runtimeCategories) {
    const category = await prisma.category.upsert({
      where: { name_businessId: { name: cat.name, businessId: accounts.business.id } },
      update: { deletedAt: null },
      create: {
        name: cat.name,
        businessId: accounts.business.id,
      },
    })
    categoryMap.set(category.name, category.id)
  }

  // =======================================================
  // EXECUTION LAYER: SYNC PRODUCTS AND CHILD VARIANTS
  // =======================================================
  console.info('🏷️ Syncing products and attribute-dependent master item variants...')
  for (const item of runtimeVariants) {
    const categoryId = categoryMap.get(item.categoryName)
    if (!categoryId) {
      console.warn(`⚠️ Skipping item variant processing "${item.variantName}": Category "${item.categoryName}" not resolved.`)
      continue
    }

    const targetUnit = await prisma.unit.findFirst({
      where: { abbreviation: item.baseUnitAbbreviation, businessId: accounts.business.id },
    })

    if (!targetUnit) {
      console.warn(`⚠️ Skipping product "${item.productName}": Base unit code "${item.baseUnitAbbreviation}" missing.`)
      continue
    }

    // 🌟 SEEDER IMAGE PROCESSING LAYER 🌟
    let finalProcessedImage = item.image

    if (item.image && item.image.trim() !== '' && !item.image.startsWith('data:')) {
      try {
        const imagePath = item.image.startsWith('http')
          ? item.image
          : path.isAbsolute(item.image)
            ? item.image
            : path.join(PRODUCTS_CSV_DIR, options.folder, item.image)

        finalProcessedImage = await getCroppedImg(imagePath, undefined, { targetWidth: 600, targetHeight: 600, format: 'image/webp', quality: 0.9 })
      } catch (error) {
        console.warn(`  ⚠️ Image crop skipped for "${item.productName}": ${(error as Error).message}`)
        finalProcessedImage = item.image
      }
    }

    // Upsert Parent Product Entry
    const product = await prisma.product.upsert({
      where: { id: item.productId },
      update: {
        name: item.productName,
        type: item.productType,
        categoryId: categoryId,
        baseUnitId: targetUnit.id,
        image: finalProcessedImage,
        deletedAt: null,
      },
      create: {
        id: item.productId,
        name: item.productName,
        type: item.productType,
        categoryId: categoryId,
        baseUnitId: targetUnit.id,
        image: finalProcessedImage,
        businessId: accounts.business.id,
      },
    })

    // Upsert Child Product Variant Profile
    await prisma.productVariant.upsert({
      where: { id: item.variantId },
      update: {
        name: item.variantName,
        image: finalProcessedImage,
        sku: item.sku,
        price: PriceEngine.toCents(item.price),
        costPrice: PriceEngine.toCents(item.costPrice),
        attributeType: item.attributeType,
        taxCategory: item.taxCategory,
        lowStockThreshold: item.lowStockThreshold,
        deletedAt: null,
      },
      create: {
        id: item.variantId,
        productId: product.id,
        name: item.variantName,
        image: finalProcessedImage,
        sku: item.sku,
        price: PriceEngine.toCents(item.price),
        costPrice: PriceEngine.toCents(item.costPrice),
        attributeType: item.attributeType,
        taxCategory: item.taxCategory,
        lowStockThreshold: item.lowStockThreshold,
        businessId: accounts.business.id,
      },
    })
  }

  // =======================================================
  // EXECUTION LAYER: RUNTIME QUANTITY RECIPES
  // =======================================================
  console.info('🍳 Syncing relational variant raw recipes and modifier sub-components...')
  for (const recipe of runtimeRecipes) {
    const targetUnit = await prisma.unit.findFirst({
      where: { abbreviation: recipe.unitAbbreviation, businessId: accounts.business.id },
    })

    if (!targetUnit) {
      console.warn(`⚠️ Skipping recipe rule: Unit abbreviation "${recipe.unitAbbreviation}" not found.`)
      continue
    }

    await prisma.productComponent.upsert({
      where: {
        hostId_materialId_isAddon: {
          hostId: recipe.hostVariantId,
          materialId: recipe.materialVariantId,
          isAddon: recipe.isAddon,
        },
      },
      update: {
        quantityUsed: recipe.quantityUsed,
        priceOverride: PriceEngine.toCents(recipe.priceOverride || 0),
        unitId: targetUnit.id,
        deletedAt: null,
      },
      create: {
        hostId: recipe.hostVariantId,
        materialId: recipe.materialVariantId,
        unitId: targetUnit.id,
        quantityUsed: recipe.quantityUsed,
        isAddon: recipe.isAddon,
        priceOverride: PriceEngine.toCents(recipe.priceOverride || 0),
        businessId: accounts.business.id,
      },
    })
  }

  console.info('✅ Store menu variants matrix optimization phase finalized.')
}
