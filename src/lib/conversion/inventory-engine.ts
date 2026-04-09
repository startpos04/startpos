import { Prettify } from 'better-auth'
import { Inventory, Prisma } from 'prisma/generated/prisma/browser'

export const posProductProps = {
  category: true,
  baseUnit: true,
  allowedAddons: {
    include: {
      unit: true,
      addon: {
        include: {
          inventory: true,
          ingredients: { include: { unit: true, material: { include: { inventory: true } } } },
        },
      },
    },
  },
  variants: {
    include: { baseUnit: true, inventory: true, ingredients: { include: { unit: true, material: { include: { inventory: true } } } } },
  },
  inventory: true,
  ingredients: { include: { unit: true, material: { include: { inventory: true } } } },
} satisfies Prisma.ProductInclude

export interface InventoryRequirement {
  id: string
  amountNeeded: number
}

export type PosProduct = Prettify<Prisma.ProductGetPayload<{ include: typeof posProductProps }>>

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
      // Use the variant if selected, otherwise fallback to master product
      const activeProduct = item.variant || item.product

      // 1. Process Main Product (or Variant)
      // Check ingredients on the active product (variant or master)
      if (activeProduct.ingredients?.length) {
        activeProduct.ingredients.forEach(ing => {
          reserved[ing.materialId] = (reserved[ing.materialId] || 0) + ing.quantityUsed * item.quantity
        })
      } else {
        // If no ingredients, track the product/variant ID itself
        reserved[activeProduct.id] = (reserved[activeProduct.id] || 0) + item.quantity
      }

      // 2. Process Addons (Addons usually apply to the whole line item)
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
  getUnitRequirements: (product: PosProduct, selectedAddonIds: string[], variant?: PosProduct['variants'][number]) => {
    const requirements: Record<string, number> = {}

    // Prioritize variant over product
    const activeProduct = variant || product

    // Add main product/variant requirements
    if (activeProduct.ingredients?.length) {
      activeProduct.ingredients.forEach(ing => {
        requirements[ing.materialId] = (requirements[ing.materialId] || 0) + ing.quantityUsed
      })
    } else {
      requirements[activeProduct.id] = 1
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
  calculateRemainingYield: (product: PosProduct, selectedAddonIds: string[], cartItems: posItem[], variant?: PosProduct['variants'][number]) => {
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
   * Finds physical stock by searching through a product's tree
   * for a specific ID (Product ID or Material ID).
   */
  findPhysicalStock: (id: string, productOrList: PosProduct | PosProduct[], branchId?: string): { stock: number; name: string } => {
    let physicalStock = 0
    let displayName = id

    // Helper to sum up inventory for a specific branch
    const getQty = (inv: Inventory[]) => inv.filter(i => !branchId || i.branchId === branchId).reduce((acc, i) => acc + i.quantity, 0)

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

      for (const v of p.variants || []) {
        if (v.id === id) {
          physicalStock = getQty(v.inventory || [])
          displayName = v.name
          break
        }

        const vIngMatch = v.ingredients?.find(ing => ing.materialId === id)
        if (vIngMatch) {
          physicalStock = getQty(vIngMatch.material.inventory || [])
          displayName = vIngMatch.material.name
          break
        }
      }

      if (displayName !== id) break // Exit outer loop if found in inner loop
    }

    return { stock: physicalStock, name: displayName }
  },
}
