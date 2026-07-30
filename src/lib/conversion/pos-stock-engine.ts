import type { Prettify } from 'better-auth'
import type { Inventory, Prisma } from 'prisma/generated/prisma/client'
import type { posProduct } from '../queries/fetch-pos-products'

const posProductComponentProps = {
  unit: true,
  material: {
    include: {
      inventory: true,
      product: true,
    },
  },
} satisfies Prisma.ProductComponentInclude

export type PosProductComponent = Prettify<Prisma.ProductComponentGetPayload<{ include: typeof posProductComponentProps }>>

export type posItem = {
  cartId: string
  product: posProduct
  quantity: number
  variant: NonNullable<posProduct['variants']>[number]
  addons: Prettify<Prisma.ProductComponentGetPayload<{ include: typeof posProductComponentProps }>>[]
}

export const PosStockEngine = {
  /**
   * CALCULATION LAYER: Sums up all materials.
   * Logic remains identical, but now accepts a combined list of Cart + DB items.
   */
  getReservedMap: (cartItems: posItem[], orderItems?: posItem[]) => {
    const reserved: Record<string, number> = {}
    const allItems = [...cartItems, ...(orderItems || [])]

    allItems.forEach(item => {
      const activeVariant = item.variant
      if (!activeVariant.components) return

      activeVariant.components.forEach(comp => {
        const isRequired = !comp.isAddon || item.addons.some(c => c.id === comp.id)

        if (isRequired) {
          reserved[comp.materialId] = (reserved[comp.materialId] || 0) + comp.quantityUsed * item.quantity
        }
      })

      // If it's a direct sale (no components), track the variant ID
      if (activeVariant.components.length === 0) {
        reserved[activeVariant.id] = (reserved[activeVariant.id] || 0) + item.quantity
      }
    })

    return reserved
  },

  /**
   * Calculates requirements for a specific configuration
   */
  getUnitRequirements: (variant: posProduct['variants'][number], selectedComponentIds: string[]) => {
    const requirements: Record<string, number> = {}

    if (!variant.components || variant.components.length === 0) {
      requirements[variant.id] = 1
      return requirements
    }

    variant.components.forEach(comp => {
      const isRequired = !comp.isAddon || selectedComponentIds.includes(comp.id)
      if (isRequired) {
        requirements[comp.materialId] = (requirements[comp.materialId] || 0) + comp.quantityUsed
      }
    })

    return requirements
  },

  /**
   * VALIDATION LAYER: Standard signature preserved.
   * When calling this, pass [...localCart, ...dbOrders] to the cartItems param.
   */
  calculateRemainingYield: (
    product: posProduct,
    variant: posProduct['variants'][number],
    selectedComponentIds: string[],
    cartItems: posItem[],
    orderItems?: posItem[],
  ) => {
    const reserved = PosStockEngine.getReservedMap(cartItems, orderItems)
    const unitReqs = PosStockEngine.getUnitRequirements(variant, selectedComponentIds)

    const yields = Object.entries(unitReqs).map(([materialId, amountPerUnit]) => {
      const { stock } = PosStockEngine.findPhysicalStock(materialId, product)
      const availableTotal = stock - (reserved[materialId] || 0)

      return Math.floor(Math.max(0, availableTotal) / amountPerUnit)
    })

    return yields.length > 0 ? Math.min(...yields) : 0
  },

  /**
   * Searches the tree for physical stock linked to a specific material ID.
   */
  findPhysicalStock: (id: string, productOrList: posProduct | posProduct[]): { stock: number; name: string } => {
    let physicalStock = 0
    let displayName = id

    const getQty = (inv: Inventory[]) => inv.reduce((acc, i) => acc + i.quantity, 0)
    const products = Array.isArray(productOrList) ? productOrList : [productOrList]

    for (const p of products) {
      for (const v of p.variants || []) {
        if (v.id === id) {
          physicalStock = getQty(v.inventory || [])
          displayName = v.name || p.name
          return { stock: physicalStock, name: displayName }
        }

        const compMatch = v.components?.find(c => c.materialId === id)
        if (compMatch) {
          physicalStock = getQty(compMatch.material.inventory || [])
          displayName = compMatch.material.product.name
          return { stock: physicalStock, name: displayName }
        }
      }
    }

    return { stock: physicalStock, name: displayName }
  },
}
