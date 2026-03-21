import { PrismaClient, ResourceType } from 'prisma/generated/prisma/client'

export async function initialProducts(prisma: PrismaClient) {
  console.log('🍔 Populating Food Store data...')

  // 1. Ensure Categories exist
  const categories = {
    pantry: await prisma.category.upsert({ where: { name: 'Pantry' }, update: {}, create: { name: 'Pantry' } }),
    burgers: await prisma.category.upsert({ where: { name: 'Burgers' }, update: {}, create: { name: 'Burgers' } }),
    drinks: await prisma.category.upsert({ where: { name: 'Drinks' }, update: {}, create: { name: 'Drinks' } }),
    sides: await prisma.category.upsert({ where: { name: 'Sides' }, update: {}, create: { name: 'Sides' } }),
  }

  // 2. Define Raw Materials (Ingredients) - 12 items
  const rawMaterials = [
    {
      name: 'Brioche Bun',
      sku: 'ING-BUN',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1603532648955-039310d9ed75?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Beef Patty (150g)',
      sku: 'ING-BEEF',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Cheddar Slice',
      sku: 'ING-CHED',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1618164435735-413d3b066c9a?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Lettuce Leaf',
      sku: 'ING-LETT',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1622206141855-662584282b99?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Tomato Slice',
      sku: 'ING-TOMA',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1518977822534-7049a61ee0c2?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Bacon Strip',
      sku: 'ING-BACON',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1606851091851-e8c8c0fca5ba?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Potato (Raw)',
      sku: 'ING-POTATO',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Cooking Oil',
      sku: 'ING-OIL',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Chicken Breast',
      sku: 'ING-CHKN',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Soda Syrup',
      sku: 'ING-SYRUP',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Carbonated Water',
      sku: 'ING-WATER',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1551731589-35a0980070bc?q=80&w=200&auto=format&fit=crop',
    },
    {
      name: 'Pickles',
      sku: 'ING-PICKLE',
      categoryId: categories.pantry.id,
      image: 'https://images.unsplash.com/photo-1589135398302-383bc370461b?q=80&w=200&auto=format&fit=crop',
    },
  ]

  const ingredientMap: Record<string, string> = {}

  for (const item of rawMaterials) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: item,
      create: {
        ...item,
        type: ResourceType.RAW_MATERIAL,
        price: 0,
        hasExpiry: true,
      },
    })
    ingredientMap[item.sku] = product.id
  }

  // 3. Define Finished Products (Bundles) - 10 items
  const bundles = [
    {
      name: 'Classic Cheeseburger',
      sku: 'MEAL-CB-01',
      price: 185,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BUN', 'ING-BEEF', 'ING-CHED'],
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Bacon Double Cheese',
      sku: 'MEAL-BC-02',
      price: 245,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BUN', 'ING-BEEF', 'ING-CHED', 'ING-BACON'],
      image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Chicken Sandwich',
      sku: 'MEAL-CH-03',
      price: 165,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BUN', 'ING-CHKN', 'ING-LETT'],
      image: 'https://images.unsplash.com/photo-1513185041617-8ab03f83d6c5?auto=format&fit=crop&q=80&w=400',
    },
    {
      name: 'Garden Burger',
      sku: 'MEAL-GB-04',
      price: 155,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BUN', 'ING-LETT', 'ING-TOMA', 'ING-PICKLE'],
      image: 'https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'French Fries',
      sku: 'SIDE-FF-01',
      price: 75,
      categoryId: categories.sides.id,
      ingredients: ['ING-POTATO', 'ING-OIL'],
      image: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Loaded Fries',
      sku: 'SIDE-LF-02',
      price: 120,
      categoryId: categories.sides.id,
      ingredients: ['ING-POTATO', 'ING-BACON', 'ING-CHED'],
      image: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Classic Cola',
      sku: 'DRK-CO-01',
      price: 45,
      categoryId: categories.drinks.id,
      ingredients: ['ING-SYRUP', 'ING-WATER'],
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Diet Soda',
      sku: 'DRK-DS-02',
      price: 45,
      categoryId: categories.drinks.id,
      ingredients: ['ING-SYRUP', 'ING-WATER'],
      image: 'https://images.unsplash.com/photo-1629203851020-9dd4aa08e9d9?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'BLT Burger',
      sku: 'MEAL-BLT-05',
      price: 195,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BUN', 'ING-BACON', 'ING-LETT', 'ING-TOMA'],
      image: 'https://images.unsplash.com/photo-1619096279114-426162da9562?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Ultimate Platter',
      sku: 'MEAL-UP-06',
      price: 450,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BEEF', 'ING-CHKN', 'ING-BACON', 'ING-POTATO'],
      image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=400&auto=format&fit=crop',
    },
  ]

  for (const bundle of bundles) {
    const { ingredients, ...productData } = bundle

    // Create the Product
    const createdBundle = await prisma.product.upsert({
      where: { sku: productData.sku },
      update: productData,
      create: {
        ...productData,
        type: ResourceType.BUNDLE,
      },
    })

    // Link Ingredients
    for (const sku of ingredients) {
      const ingredientId = ingredientMap[sku]
      if (ingredientId) {
        await prisma.ingredient.upsert({
          where: {
            parentProductId_componentId: {
              parentProductId: createdBundle.id,
              componentId: ingredientId,
            },
          },
          update: { quantityUsed: 1.0 },
          create: {
            parentProductId: createdBundle.id,
            componentId: ingredientId,
            quantityUsed: 1.0,
          },
        })
      }
    }
  }

  console.log(`✅ Food data synced. Created ${rawMaterials.length + bundles.length} products total.`)
}
