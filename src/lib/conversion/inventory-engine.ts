import { Prettify } from 'better-auth'
import { Prisma } from 'prisma/generated/prisma/browser'

export const posProductProps = {
  include: {
    category: true as true,
    baseUnit: true as true,
    allowedAddons: {
      include: {
        unit: true as true,
        addon: {
          include: {
            inventory: true as true,
            ingredients: { include: { unit: true as true, material: { include: { inventory: true as true } } } },
          },
        },
      },
    },
    variants: true as true,
    inventory: true as true,
    ingredients: { include: { unit: true as true, material: { include: { inventory: true as true } } } },
  },
}

export interface InventoryRequirement {
  id: string
  amountNeeded: number
}

export type PosProduct = Prettify<Prisma.ProductGetPayload<typeof posProductProps>>

export type posItem = {
  cartId: string
  product: PosProduct
  quantity: number
  variant: NonNullable<PosProduct['variants']>[number] | undefined
  addons: NonNullable<PosProduct['allowedAddons']>[number][] | undefined
}

export const InventoryEngine = {
  /**
   * Sums up all materials/products currently held in the cart.
   */
  getReservedMap: (cartItems: posItem[]) => {
    const reserved: Record<string, number> = {}

    cartItems.forEach(item => {
      // 1. Process Main Product
      if (item.product.ingredients?.length) {
        item.product.ingredients.forEach(ing => {
          reserved[ing.materialId] = (reserved[ing.materialId] || 0) + ing.quantityUsed * item.quantity
        })
      } else {
        reserved[item.product.id] = (reserved[item.product.id] || 0) + item.quantity
      }

      // 2. Process Addons
      item.addons?.forEach(addonRel => {
        const addon = addonRel.addon
        if (addon.ingredients?.length) {
          addon.ingredients.forEach(ing => {
            reserved[ing.materialId] = (reserved[ing.materialId] || 0) + ing.quantityUsed * item.quantity
          })
        } else {
          reserved[addon.id] = (reserved[addon.id] || 0) + item.quantity
        }
      })
    })

    return reserved
  },

  /**
   * Calculates requirements for a specific product configuration (Product + selected Addons)
   */
  getUnitRequirements: (product: PosProduct, selectedAddonIds: string[]) => {
    const requirements: Record<string, number> = {}

    // Add main product
    if (product.ingredients?.length) {
      product.ingredients.forEach(ing => {
        requirements[ing.materialId] = (requirements[ing.materialId] || 0) + ing.quantityUsed
      })
    } else {
      requirements[product.id] = 1
    }

    // Add selected addons
    const activeAddons = product.allowedAddons?.filter(a => selectedAddonIds.includes(a.id)) || []
    activeAddons.forEach(a => {
      if (a.addon.ingredients?.length) {
        a.addon.ingredients.forEach(ing => {
          requirements[ing.materialId] = (requirements[ing.materialId] || 0) + ing.quantityUsed
        })
      } else {
        requirements[a.addonId] = (requirements[a.addonId] || 0) + 1
      }
    })

    return requirements
  },

  /**
   * THE CORE CALCULATOR: Returns how many MORE units of a specific config can be made.
   */
  calculateRemainingYield: (product: PosProduct, selectedAddonIds: string[], cartItems: posItem[]) => {
    const reserved = InventoryEngine.getReservedMap(cartItems)
    const unitReqs = InventoryEngine.getUnitRequirements(product, selectedAddonIds)

    const yields = Object.entries(unitReqs).map(([id, amountPerUnit]) => {
      // 1. Wrap 'product' in an array to match the new dbProducts[] signature
      // 2. Destructure 'stock' from the returned object
      const { stock } = InventoryEngine.findPhysicalStock(id, product)

      const availableTotal = stock - (reserved[id] || 0)

      return Math.floor(Math.max(0, availableTotal) / amountPerUnit)
    })

    return yields.length > 0 ? Math.min(...yields) : 0
  },

  /**
   * Finds physical stock by searching through a product's tree
   * for a specific ID (Product ID or Material ID).
   */
  findPhysicalStock: (id: string, productOrList: PosProduct | PosProduct[], branchId?: string): { stock: number; name: string } => {
    let physicalStock = 0
    let displayName = id

    // Helper to sum up inventory for a specific branch
    const getQty = (inv: any[]) => inv.filter(i => !branchId || i.branchId === branchId).reduce((acc, i) => acc + i.quantity, 0)

    // Convert single product to array so we can use the same loop logic
    const products = Array.isArray(productOrList) ? productOrList : [productOrList]

    for (const p of products) {
      // 1. Is it the product itself?
      if (p.id === id) {
        physicalStock = getQty(p.inventory || [])
        displayName = p.name
        break
      }

      // 2. Is it a material in the ingredients?
      const ingMatch = p.ingredients?.find(ing => ing.materialId === id)
      if (ingMatch) {
        physicalStock = getQty(ingMatch.material.inventory || [])
        displayName = ingMatch.material.name
        break
      }

      // 3. Is it an addon or an addon's ingredient?
      for (const rel of p.allowedAddons || []) {
        if (rel.addonId === id) {
          physicalStock = getQty(rel.addon.inventory || [])
          displayName = rel.addon.name
          break
        }

        const addonIng = rel.addon.ingredients?.find(i => i.materialId === id)
        if (addonIng) {
          physicalStock = getQty(addonIng.material.inventory || [])
          displayName = addonIng.material.name
          break
        }
      }

      if (displayName !== id) break // Exit outer loop if found in inner loop
    }

    return { stock: physicalStock, name: displayName }
  },
}
