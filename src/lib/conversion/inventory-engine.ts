import { Prettify } from 'better-auth'
import { Prisma } from 'prisma/generated/prisma/browser'

export interface InventoryRequirement {
  id: string
  amountNeeded: number
}

export type PosProduct = Prettify<
  Prisma.ProductGetPayload<{
    include: {
      category: true
      baseUnit: true
      allowedAddons: {
        include: {
          addon: {
            include: {
              inventory: true
              ingredients: { include: { material: { include: { inventory: true } } } }
            }
          }
        }
      }
      variants: true
      inventory: true
      ingredients: { include: { material: { include: { inventory: true } } } }
    }
  }>
>

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
      // Find physical stock (reusing your helper logic)
      const stock = InventoryEngine.findPhysicalStock(id, product)
      const availableTotal = stock - (reserved[id] || 0)

      return Math.floor(Math.max(0, availableTotal) / amountPerUnit)
    })

    return yields.length > 0 ? Math.min(...yields) : 0
  },

  /**
   * Traverses the product object to find the inventory count for a specific ID.
   */
  findPhysicalStock: (id: string, product: PosProduct): number => {
    if (product.id === id) return product.inventory?.reduce((s, i) => s + i.quantity, 0) ?? 0

    const ingMatch = product.ingredients?.find(ing => ing.materialId === id)
    if (ingMatch) return ingMatch.material.inventory?.reduce((s, i) => s + i.quantity, 0) ?? 0

    const addonMatch = product.allowedAddons?.find(a => a.addonId === id)
    if (addonMatch) return addonMatch.addon.inventory?.reduce((s, i) => s + i.quantity, 0) ?? 0

    return 0
  },
}
