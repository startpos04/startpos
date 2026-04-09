import { Prettify } from 'better-auth'
import { Inventory, Prisma } from 'prisma/generated/prisma/browser'

// Updated to reflect the new Product/Variant split
export const posProductProps = {
  category: true,
  baseUnit: true,
  allowedAddons: {
    include: {
      unit: true,
      addon: {
        // This is the 'Product' acting as an addon
        include: {
          variants: {
            // We need the variant to get the ingredients/inventory
            include: {
              inventory: true,
              ingredients: {
                include: {
                  unit: true,
                  material: { include: { inventory: true, product: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  variants: {
    include: {
      inventory: true,
      ingredients: {
        include: {
          unit: true,
          material: { include: { inventory: true, product: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude

export type PosProduct = Prettify<Prisma.ProductGetPayload<{ include: typeof posProductProps }>>

export type posItem = {
  cartId: string
  product: PosProduct
  quantity: number
  variant: NonNullable<PosProduct['variants']>[number] // Variant is now usually required for bundles
  addons: NonNullable<PosProduct['allowedAddons']>[number][] | undefined
}

export const InventoryEngine = {
  /**
   * Sums up all materials/variants currently held in the cart.
   */
  getReservedMap: (cartItems: posItem[]) => {
    const reserved: Record<string, number> = {}

    cartItems.forEach(item => {
      // Use the variant (variants hold the recipes now)
      const activeVariant = item.variant

      // 1. Process Main Variant ingredients
      if (activeVariant.ingredients?.length) {
        activeVariant.ingredients.forEach(ing => {
          reserved[ing.materialId] = (reserved[ing.materialId] || 0) + ing.quantityUsed * item.quantity
        })
      } else {
        // If it's a direct-sale variant (no recipe), track its own ID
        reserved[activeVariant.id] = (reserved[activeVariant.id] || 0) + item.quantity
      }

      // 2. Process Addons
      item.addons?.forEach(addonRel => {
        // Resolve to the first variant of the addon product
        const addonVariant = addonRel.addon.variants?.[0]
        if (!addonVariant) return

        if (addonVariant.ingredients?.length) {
          addonVariant.ingredients.forEach(ing => {
            reserved[ing.materialId] = (reserved[ing.materialId] || 0) + ing.quantityUsed * item.quantity
          })
        } else {
          reserved[addonVariant.id] = (reserved[addonVariant.id] || 0) + item.quantity
        }
      })
    })

    return reserved
  },

  /**
   * Calculates requirements for a specific configuration
   */
  getUnitRequirements: (product: PosProduct, selectedAddonIds: string[], variant: PosProduct['variants'][number]) => {
    const requirements: Record<string, number> = {}

    // Add main variant requirements
    if (variant.ingredients?.length) {
      variant.ingredients.forEach(ing => {
        requirements[ing.materialId] = (requirements[ing.materialId] || 0) + ing.quantityUsed
      })
    } else {
      requirements[variant.id] = 1
    }

    // Add selected addons
    const activeAddonRels = product.allowedAddons?.filter(a => selectedAddonIds.includes(a.id)) || []
    activeAddonRels.forEach(rel => {
      const addonVariant = rel.addon.variants?.[0]
      if (!addonVariant) return

      if (addonVariant.ingredients?.length) {
        addonVariant.ingredients.forEach(ing => {
          requirements[ing.materialId] = (requirements[ing.materialId] || 0) + ing.quantityUsed
        })
      } else {
        requirements[addonVariant.id] = (requirements[addonVariant.id] || 0) + 1
      }
    })

    return requirements
  },

  calculateRemainingYield: (product: PosProduct, selectedAddonIds: string[], cartItems: posItem[], variant: PosProduct['variants'][number]) => {
    const reserved = InventoryEngine.getReservedMap(cartItems)
    const unitReqs = InventoryEngine.getUnitRequirements(product, selectedAddonIds, variant)

    const yields = Object.entries(unitReqs).map(([id, amountPerUnit]) => {
      const { stock } = InventoryEngine.findPhysicalStock(id, product)
      const availableTotal = stock - (reserved[id] || 0)

      return Math.floor(Math.max(0, availableTotal) / amountPerUnit)
    })

    return yields.length > 0 ? Math.min(...yields) : 0
  },

  /**
   * Searches the tree for Variant stock.
   */
  findPhysicalStock: (id: string, productOrList: PosProduct | PosProduct[], branchId?: string): { stock: number; name: string } => {
    let physicalStock = 0
    let displayName = id

    const getQty = (inv: Inventory[]) => inv.filter(i => !branchId || i.branchId === branchId).reduce((acc, i) => acc + i.quantity, 0)
    const products = Array.isArray(productOrList) ? productOrList : [productOrList]

    for (const p of products) {
      // 1. Check Variants of the product
      for (const v of p.variants || []) {
        if (v.id === id) {
          physicalStock = getQty(v.inventory || [])
          displayName = v.name || ''
          return { stock: physicalStock, name: displayName }
        }

        // 2. Check ingredients of those variants (material is a variant)
        const ingMatch = v.ingredients?.find(ing => ing.materialId === id)
        if (ingMatch) {
          physicalStock = getQty(ingMatch.material.inventory || [])
          displayName = ingMatch.material.product.name // Get parent name for clarity
          return { stock: physicalStock, name: displayName }
        }
      }

      // 3. Check Addons
      for (const rel of p.allowedAddons || []) {
        for (const av of rel.addon.variants || []) {
          if (av.id === id) {
            physicalStock = getQty(av.inventory || [])
            displayName = av.name || ''
            return { stock: physicalStock, name: displayName }
          }
          const aIngMatch = av.ingredients?.find(ing => ing.materialId === id)
          if (aIngMatch) {
            physicalStock = getQty(aIngMatch.material.inventory || [])
            displayName = aIngMatch.material.product.name
            return { stock: physicalStock, name: displayName }
          }
        }
      }
    }

    return { stock: physicalStock, name: displayName }
  },
}
