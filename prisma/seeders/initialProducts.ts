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
    { name: 'Brioche Bun', sku: 'ING-BUN', categoryId: categories.pantry.id },
    { name: 'Beef Patty (150g)', sku: 'ING-BEEF', categoryId: categories.pantry.id },
    { name: 'Cheddar Slice', sku: 'ING-CHED', categoryId: categories.pantry.id },
    { name: 'Lettuce Leaf', sku: 'ING-LETT', categoryId: categories.pantry.id },
    { name: 'Tomato Slice', sku: 'ING-TOMA', categoryId: categories.pantry.id },
    { name: 'Bacon Strip', sku: 'ING-BACON', categoryId: categories.pantry.id },
    { name: 'Potato (Raw)', sku: 'ING-POTATO', categoryId: categories.pantry.id },
    { name: 'Cooking Oil', sku: 'ING-OIL', categoryId: categories.pantry.id },
    { name: 'Chicken Breast', sku: 'ING-CHKN', categoryId: categories.pantry.id },
    { name: 'Soda Syrup', sku: 'ING-SYRUP', categoryId: categories.pantry.id },
    { name: 'Carbonated Water', sku: 'ING-WATER', categoryId: categories.pantry.id },
    { name: 'Pickles', sku: 'ING-PICKLE', categoryId: categories.pantry.id },
  ]

  const ingredientMap: Record<string, string> = {}

  for (const item of rawMaterials) {
    const product = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {},
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
    { name: 'Classic Cheeseburger', sku: 'MEAL-CB-01', price: 185, categoryId: categories.burgers.id, ingredients: ['ING-BUN', 'ING-BEEF', 'ING-CHED'] },
    {
      name: 'Bacon Double Cheese',
      sku: 'MEAL-BC-02',
      price: 245,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BUN', 'ING-BEEF', 'ING-CHED', 'ING-BACON'],
    },
    { name: 'Chicken Sandwich', sku: 'MEAL-CH-03', price: 165, categoryId: categories.burgers.id, ingredients: ['ING-BUN', 'ING-CHKN', 'ING-LETT'] },
    { name: 'Garden Burger', sku: 'MEAL-GB-04', price: 155, categoryId: categories.burgers.id, ingredients: ['ING-BUN', 'ING-LETT', 'ING-TOMA', 'ING-PICKLE'] },
    { name: 'French Fries', sku: 'SIDE-FF-01', price: 75, categoryId: categories.sides.id, ingredients: ['ING-POTATO', 'ING-OIL'] },
    { name: 'Loaded Fries', sku: 'SIDE-LF-02', price: 120, categoryId: categories.sides.id, ingredients: ['ING-POTATO', 'ING-BACON', 'ING-CHED'] },
    { name: 'Classic Cola', sku: 'DRK-CO-01', price: 45, categoryId: categories.drinks.id, ingredients: ['ING-SYRUP', 'ING-WATER'] },
    { name: 'Diet Soda', sku: 'DRK-DS-02', price: 45, categoryId: categories.drinks.id, ingredients: ['ING-SYRUP', 'ING-WATER'] },
    { name: 'BLT Burger', sku: 'MEAL-BLT-05', price: 195, categoryId: categories.burgers.id, ingredients: ['ING-BUN', 'ING-BACON', 'ING-LETT', 'ING-TOMA'] },
    {
      name: 'Ultimate Platter',
      sku: 'MEAL-UP-06',
      price: 450,
      categoryId: categories.burgers.id,
      ingredients: ['ING-BEEF', 'ING-CHKN', 'ING-BACON', 'ING-POTATO'],
    },
  ]

  for (const bundle of bundles) {
    const { ingredients, ...productData } = bundle

    // Create the Product
    const createdBundle = await prisma.product.upsert({
      where: { sku: productData.sku },
      update: { price: productData.price },
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
