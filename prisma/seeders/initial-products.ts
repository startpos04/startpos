import { PrismaClient, ResourceType, UnitType } from 'prisma/generated/prisma/client'

export async function initialProducts(prisma: PrismaClient) {
  console.log('🍔 Populating Food Store with correct Schema fields...')

  // 1. SEED UNITS
  const units = {
    pcs: await prisma.unit.upsert({
      where: { abbreviation: 'pcs' },
      update: {},
      create: { organizationId: 'org-1', name: 'Pieces', abbreviation: 'pcs', type: UnitType.COUNT, isBaseUnit: true },
    }),
    g: await prisma.unit.upsert({
      where: { abbreviation: 'g' },
      update: {},
      create: { organizationId: 'org-1', name: 'Grams', abbreviation: 'g', type: UnitType.WEIGHT, isBaseUnit: true },
    }),
    kg: await prisma.unit.upsert({
      where: { abbreviation: 'kg' },
      update: {},
      create: { organizationId: 'org-1', name: 'Kilograms', abbreviation: 'kg', type: UnitType.WEIGHT, conversionFactor: 1000 },
    }),
    ml: await prisma.unit.upsert({
      where: { abbreviation: 'ml' },
      update: {},
      create: { organizationId: 'org-1', name: 'Milliliters', abbreviation: 'ml', type: UnitType.VOLUME, isBaseUnit: true },
    }),
    l: await prisma.unit.upsert({
      where: { abbreviation: 'L' },
      update: {},
      create: { organizationId: 'org-1', name: 'Liters', abbreviation: 'L', type: UnitType.VOLUME, conversionFactor: 1000 },
    }),
  }

  // 2. Ensure Categories
  const categories = {
    pantry: await prisma.category.upsert({ where: { name: 'Pantry' }, update: {}, create: { organizationId: 'org-1', name: 'Pantry' } }),
    burgers: await prisma.category.upsert({ where: { name: 'Burgers' }, update: {}, create: { organizationId: 'org-1', name: 'Burgers' } }),
    drinks: await prisma.category.upsert({ where: { name: 'Drinks' }, update: {}, create: { organizationId: 'org-1', name: 'Drinks' } }),
    sides: await prisma.category.upsert({ where: { name: 'Sides' }, update: {}, create: { organizationId: 'org-1', name: 'Sides' } }),
  }

  const productMap: Record<string, string> = {}

  // 3. Define Raw Materials
  const rawMaterials = [
    {
      name: 'Brioche Bun',
      sku: 'ING-BUN',
      uId: units.pcs.id,
      img: 'https://images.unsplash.com/photo-1603532648955-039310d9ed75?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Beef Patty (150g)',
      sku: 'ING-BEEF',
      uId: units.g.id,
      img: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Cheddar Slice',
      sku: 'ING-CHED',
      uId: units.pcs.id,
      img: 'https://images.unsplash.com/photo-1618164435735-413d3b066c9a?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Lettuce Leaf',
      sku: 'ING-LETT',
      uId: units.pcs.id,
      img: 'https://images.unsplash.com/photo-1622206141855-662584282b99?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Tomato Slice',
      sku: 'ING-TOMA',
      uId: units.pcs.id,
      img: 'https://images.unsplash.com/photo-1518977822534-7049a61ee0c2?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Bacon Strip',
      sku: 'ING-BACON',
      uId: units.pcs.id,
      img: 'https://images.unsplash.com/photo-1606851091851-e8c8c0fca5ba?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Potato (Raw)',
      sku: 'ING-POTATO',
      uId: units.g.id,
      img: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Cooking Oil',
      sku: 'ING-OIL',
      uId: units.ml.id,
      img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Chicken Breast',
      sku: 'ING-CHKN',
      uId: units.g.id,
      img: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Soda Syrup',
      sku: 'ING-SYRUP',
      uId: units.ml.id,
      img: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Carbonated Water',
      sku: 'ING-WATER',
      uId: units.ml.id,
      img: 'https://images.unsplash.com/photo-1551731589-35a0980070bc?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Pickles',
      sku: 'ING-PICKLE',
      uId: units.pcs.id,
      img: 'https://images.unsplash.com/photo-1589135398302-383bc370461b?q=80&w=200&auto=format&fit=crop',
    },
  ]

  for (const item of rawMaterials) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        image: item.img,
        baseUnitId: item.uId,
      },
      create: {
        organizationId: 'org-1',
        name: item.name,
        sku: item.sku,
        image: item.img,
        baseUnitId: item.uId,
        type: ResourceType.RAW_MATERIAL,
        price: 0,
        categoryId: categories.pantry.id,
        hasExpiry: true,
      },
    })
    productMap[item.sku] = product.id
  }

  // 4. Define Bundles
  // 4. Define Finished Bundles with Unit-Aware Recipes
  const bundles = [
    {
      name: 'Classic Cheeseburger',
      sku: 'MEAL-CB-01',
      price: 185,
      categoryId: categories.burgers.id,
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-BUN', qty: 1, unit: units.pcs.id },
        { sku: 'ING-BEEF', qty: 150, unit: units.g.id },
        { sku: 'ING-CHED', qty: 1, unit: units.pcs.id },
      ],
    },
    {
      name: 'Bacon Double Cheese',
      sku: 'MEAL-BC-02',
      price: 245,
      categoryId: categories.burgers.id,
      image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-BUN', qty: 1, unit: units.pcs.id },
        { sku: 'ING-BEEF', qty: 300, unit: units.g.id }, // 2 patties
        { sku: 'ING-CHED', qty: 2, unit: units.pcs.id },
        { sku: 'ING-BACON', qty: 2, unit: units.pcs.id },
      ],
    },
    {
      name: 'Chicken Sandwich',
      sku: 'MEAL-CH-03',
      price: 165,
      categoryId: categories.burgers.id,
      image: 'https://images.unsplash.com/photo-1513185041617-8ab03f83d6c5?auto=format&fit=crop&q=80&w=400',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-BUN', qty: 1, unit: units.pcs.id },
        { sku: 'ING-CHKN', qty: 180, unit: units.g.id },
        { sku: 'ING-LETT', qty: 1, unit: units.pcs.id },
      ],
    },
    {
      name: 'Garden Burger',
      sku: 'MEAL-GB-04',
      price: 155,
      categoryId: categories.burgers.id,
      image: 'https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-BUN', qty: 1, unit: units.pcs.id },
        { sku: 'ING-LETT', qty: 2, unit: units.pcs.id },
        { sku: 'ING-TOMA', qty: 2, unit: units.pcs.id },
        { sku: 'ING-PICKLE', qty: 3, unit: units.pcs.id },
      ],
    },
    {
      name: 'French Fries',
      sku: 'SIDE-FF-01',
      price: 75,
      categoryId: categories.sides.id,
      image: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-POTATO', qty: 200, unit: units.g.id },
        { sku: 'ING-OIL', qty: 30, unit: units.ml.id },
      ],
    },
    {
      name: 'Loaded Fries',
      sku: 'SIDE-LF-02',
      price: 120,
      categoryId: categories.sides.id,
      image: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-POTATO', qty: 200, unit: units.g.id },
        { sku: 'ING-BACON', qty: 2, unit: units.pcs.id },
        { sku: 'ING-CHED', qty: 1, unit: units.pcs.id },
      ],
    },
    {
      name: 'Classic Cola',
      sku: 'DRK-CO-01',
      price: 45,
      categoryId: categories.drinks.id,
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-SYRUP', qty: 50, unit: units.ml.id },
        { sku: 'ING-WATER', qty: 250, unit: units.ml.id },
      ],
    },
    {
      name: 'Diet Soda',
      sku: 'DRK-DS-02',
      price: 45,
      categoryId: categories.drinks.id,
      image: 'https://images.unsplash.com/photo-1629203851020-9dd4aa08e9d9?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-SYRUP', qty: 50, unit: units.ml.id },
        { sku: 'ING-WATER', qty: 250, unit: units.ml.id },
      ],
    },
    {
      name: 'BLT Burger',
      sku: 'MEAL-BLT-05',
      price: 195,
      categoryId: categories.burgers.id,
      image: 'https://images.unsplash.com/photo-1619096279114-426162da9562?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-BUN', qty: 1, unit: units.pcs.id },
        { sku: 'ING-BACON', qty: 3, unit: units.pcs.id },
        { sku: 'ING-LETT', qty: 2, unit: units.pcs.id },
        { sku: 'ING-TOMA', qty: 2, unit: units.pcs.id },
      ],
    },
    {
      name: 'Ultimate Platter',
      sku: 'MEAL-UP-06',
      price: 450,
      categoryId: categories.burgers.id,
      image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-BEEF', qty: 300, unit: units.g.id },
        { sku: 'ING-CHKN', qty: 300, unit: units.g.id },
        { sku: 'ING-BACON', qty: 4, unit: units.pcs.id },
        { sku: 'ING-POTATO', qty: 400, unit: units.g.id },
      ],
    },
  ]

  for (const bundle of bundles) {
    const { recipe, ...productData } = bundle
    const createdBundle = await prisma.product.upsert({
      where: { sku: productData.sku },
      update: productData,
      create: { ...productData, organizationId: 'org-1', type: ResourceType.BUNDLE },
    })

    for (const ingredient of recipe) {
      const materialId = productMap[ingredient.sku]
      if (materialId) {
        await prisma.productIngredient.upsert({
          where: { hostId_materialId: { hostId: createdBundle.id, materialId: materialId } },
          update: { quantityUsed: ingredient.qty, unitId: ingredient.unit },
          create: {
            hostId: createdBundle.id,
            materialId: materialId,
            quantityUsed: ingredient.qty,
            unitId: ingredient.unit,
          },
        })
      }
    }

    if (productData.categoryId === categories.burgers.id) {
      const addonSkus = ['ING-CHED', 'ING-BACON', 'ING-PICKLE']
      for (const asku of addonSkus) {
        const aid = productMap[asku]
        if (aid) {
          await prisma.productAddon.upsert({
            where: { hostId_addonId: { hostId: createdBundle.id, addonId: aid } },
            update: {},
            create: { hostId: createdBundle.id, addonId: aid, priceOverride: 25.0, defaultQuantity: 1 },
          })
        }
      }
    }
  }

  // 5. Create Variants
  const colaMaster = await prisma.product.findUnique({ where: { sku: 'DRK-CO-01' } })
  if (colaMaster) {
    const sizes = [
      { name: 'Cola (Regular)', sku: 'DRK-CO-REG', price: 45 },
      { name: 'Cola (Large)', sku: 'DRK-CO-LRG', price: 65 },
      { name: 'Cola (Monster)', sku: 'DRK-CO-MON', price: 95 },
    ]
    for (const size of sizes) {
      await prisma.product.upsert({
        where: { sku: size.sku },
        update: size,
        create: {
          ...size,
          organizationId: 'org-1',
          type: ResourceType.PHYSICAL_GOOD,
          categoryId: categories.drinks.id,
          variantOfId: colaMaster.id,
          image: colaMaster.image,
          baseUnitId: units.pcs.id,
        },
      })
    }
  }

  console.log(`✅ Fixed Seeding complete!`)
}
