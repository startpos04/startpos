import { type PrismaClient, ResourceType, UnitType } from 'prisma/generated/prisma/client'

export async function initialProducts(prisma: PrismaClient) {
  console.log('🍔 Populating Food Store with Unified Component Schema...')

  // 1. SEED UNITS
  const units = {
    pcs: await prisma.unit.upsert({
      where: { abbreviation: 'pcs' },
      update: {},
      create: { organizationId: 'org-1', name: 'Pieces', abbreviation: 'pcs', type: UnitType.COUNT, isBaseUnit: true, conversionFactor: 1 },
    }),
    g: await prisma.unit.upsert({
      where: { abbreviation: 'g' },
      update: {},
      create: { organizationId: 'org-1', name: 'Grams', abbreviation: 'g', type: UnitType.WEIGHT, isBaseUnit: true, conversionFactor: 1 },
    }),
    kg: await prisma.unit.upsert({
      where: { abbreviation: 'kg' },
      update: { conversionFactor: 1000 },
      create: { organizationId: 'org-1', name: 'Kilograms', abbreviation: 'kg', type: UnitType.WEIGHT, isBaseUnit: false, conversionFactor: 1000 },
    }),
    ml: await prisma.unit.upsert({
      where: { abbreviation: 'ml' },
      update: {},
      create: { organizationId: 'org-1', name: 'Milliliters', abbreviation: 'ml', type: UnitType.VOLUME, isBaseUnit: true, conversionFactor: 1 },
    }),
    l: await prisma.unit.upsert({
      where: { abbreviation: 'L' },
      update: { conversionFactor: 1000 },
      create: { organizationId: 'org-1', name: 'Liters', abbreviation: 'L', type: UnitType.VOLUME, isBaseUnit: false, conversionFactor: 1000 },
    }),
  }

  // 2. Ensure Categories
  const categories = {
    pantry: await prisma.category.upsert({ where: { name: 'Pantry' }, update: {}, create: { organizationId: 'org-1', name: 'Pantry' } }),
    burgers: await prisma.category.upsert({ where: { name: 'Burgers' }, update: {}, create: { organizationId: 'org-1', name: 'Burgers' } }),
    drinks: await prisma.category.upsert({ where: { name: 'Drinks' }, update: {}, create: { organizationId: 'org-1', name: 'Drinks' } }),
    sides: await prisma.category.upsert({ where: { name: 'Sides' }, update: {}, create: { organizationId: 'org-1', name: 'Sides' } }),
  }

  const variantMap: Record<string, string> = {}

  // 3. Define Raw Materials
  const rawMaterials = [
    {
      name: 'Brioche Bun',
      sku: 'ING-BUN',
      uId: units.pcs.id,
      img: 'https://images.unsplash.com/photo-1603532648955-039310d9ed75?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Beef Patty',
      sku: 'ING-BEEF',
      uId: units.kg.id,
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
      uId: units.kg.id,
      img: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Cooking Oil',
      sku: 'ING-OIL',
      uId: units.l.id,
      img: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Chicken Breast',
      sku: 'ING-CHKN',
      uId: units.kg.id,
      img: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Soda Syrup',
      sku: 'ING-SYRUP',
      uId: units.l.id,
      img: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Carbonated Water',
      sku: 'ING-WATER',
      uId: units.l.id,
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
      where: { id: `prod-${item.sku}` },
      update: { name: item.name, image: item.img, baseUnitId: item.uId },
      create: {
        id: `prod-${item.sku}`,
        organizationId: 'org-1',
        name: item.name,
        image: item.img,
        baseUnitId: item.uId,
        type: ResourceType.RAW_MATERIAL,
        categoryId: categories.pantry.id,
        hasExpiry: true,
      },
    })

    const variant = await prisma.productVariant.upsert({
      where: { sku: item.sku },
      update: { price: 0 },
      create: {
        organizationId: 'org-1',
        productId: product.id,
        sku: item.sku,
        price: 0,
        costPrice: 0,
      },
    })
    variantMap[item.sku] = variant.id
  }

  // 4. Define Bundles (Unified Components)
  const bundles = [
    {
      name: 'Classic Cheeseburger',
      sku: 'MEAL-CB-01',
      price: 18500,
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
      price: 24500,
      categoryId: categories.burgers.id,
      image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-BUN', qty: 1, unit: units.pcs.id },
        { sku: 'ING-BEEF', qty: 300, unit: units.g.id },
        { sku: 'ING-CHED', qty: 2, unit: units.pcs.id },
        { sku: 'ING-BACON', qty: 2, unit: units.pcs.id },
      ],
    },
    {
      name: 'Chicken Sandwich',
      sku: 'MEAL-CH-03',
      price: 16500,
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
      name: 'French Fries',
      sku: 'SIDE-FF-01',
      price: 7500,
      categoryId: categories.sides.id,
      image: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-POTATO', qty: 200, unit: units.g.id },
        { sku: 'ING-OIL', qty: 30, unit: units.ml.id },
      ],
    },
    {
      name: 'Diet Soda',
      sku: 'DRK-DS-02',
      price: 4500,
      categoryId: categories.drinks.id,
      image: 'https://images.unsplash.com/photo-1629203851020-9dd4aa08e9d9?q=80&w=400&auto=format&fit=crop',
      baseUnitId: units.pcs.id,
      recipe: [
        { sku: 'ING-SYRUP', qty: 50, unit: units.ml.id },
        { sku: 'ING-WATER', qty: 250, unit: units.ml.id },
      ],
    },
    {
      name: 'Garden Burger',
      sku: 'MEAL-GB-04',
      price: 15500,
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
      name: 'Loaded Fries',
      sku: 'SIDE-LF-02',
      price: 12000,
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
      name: 'BLT Burger',
      sku: 'MEAL-BLT-05',
      price: 19500,
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
      price: 45000,
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

    const createdProduct = await prisma.product.upsert({
      where: { id: `prod-${productData.sku}` },
      update: { name: productData.name, categoryId: productData.categoryId },
      create: {
        id: `prod-${productData.sku}`,
        organizationId: 'org-1',
        name: productData.name,
        image: productData.image,
        type: ResourceType.BUNDLE,
        categoryId: productData.categoryId,
        baseUnitId: productData.baseUnitId,
      },
    })

    const createdVariant = await prisma.productVariant.upsert({
      where: { sku: productData.sku },
      update: { price: productData.price },
      create: {
        organizationId: 'org-1',
        productId: createdProduct.id,
        sku: productData.sku,
        price: productData.price,
      },
    })
    variantMap[productData.sku] = createdVariant.id

    // Seed Components (Ingredients: isAddon = false)
    for (const ing of recipe) {
      const materialVariantId = variantMap[ing.sku]
      if (materialVariantId) {
        await prisma.productComponent.upsert({
          where: { hostId_materialId_isAddon: { hostId: createdVariant.id, materialId: materialVariantId, isAddon: false } },
          update: { quantityUsed: ing.qty },
          create: {
            organizationId: 'org-1',
            hostId: createdVariant.id,
            materialId: materialVariantId,
            quantityUsed: ing.qty,
            unitId: ing.unit,
            isAddon: false,
          },
        })
      }
    }

    // Seed Components (Addons: isAddon = true)
    if (productData.categoryId === categories.burgers.id) {
      const addonSkus = ['ING-CHED', 'ING-BACON', 'ING-PICKLE']
      for (const asku of addonSkus) {
        const materialVariantId = variantMap[asku]
        if (materialVariantId) {
          await prisma.productComponent.upsert({
            where: {
              hostId_materialId_isAddon: {
                hostId: createdVariant.id,
                materialId: materialVariantId,
                isAddon: true,
              },
            },
            update: {},
            create: {
              organizationId: 'org-1',
              hostId: createdVariant.id,
              materialId: materialVariantId,
              unitId: units.pcs.id,
              isAddon: true,
              priceOverride: 2500,
              quantityUsed: 1,
            },
          })
        }
      }
    }
  }

  // 5. Multi-Variant Products
  const colaProduct = await prisma.product.upsert({
    where: { id: 'prod-cola' },
    update: {},
    create: {
      id: 'prod-cola',
      organizationId: 'org-1',
      name: 'Classic Cola',
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=400&auto=format&fit=crop',
      type: ResourceType.PHYSICAL_GOOD,
      categoryId: categories.drinks.id,
      baseUnitId: units.pcs.id,
    },
  })

  const colaSizes = [
    { name: 'Regular', sku: 'DRK-CO-REG', price: 4500, syrup: 50 },
    { name: 'Large', sku: 'DRK-CO-LRG', price: 6500, syrup: 75 },
    { name: 'Monster', sku: 'DRK-CO-MON', price: 9500, syrup: 150 },
  ]

  for (const size of colaSizes) {
    const v = await prisma.productVariant.upsert({
      where: { sku: size.sku },
      update: { price: size.price },
      create: {
        organizationId: 'org-1',
        productId: colaProduct.id,
        sku: size.sku,
        name: size.name,
        price: size.price,
      },
    })

    const syrupId = variantMap['ING-SYRUP']
    const waterId = variantMap['ING-WATER']
    if (syrupId && waterId) {
      await prisma.productComponent.createMany({
        data: [
          { organizationId: 'org-1', hostId: v.id, materialId: syrupId, quantityUsed: size.syrup, unitId: units.ml.id, isAddon: false },
          { organizationId: 'org-1', hostId: v.id, materialId: waterId, quantityUsed: size.syrup * 5, unitId: units.ml.id, isAddon: false },
        ],
        skipDuplicates: true,
      })
    }
  }

  console.log(`✅ Unified Seeding complete!`)
}
