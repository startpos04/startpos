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

/**
 * StockResult — discriminated union for inventory availability
 * 
 * Replaces the magic number 999 with a type-safe representation.
 * 
 * - unlimited: Product has no inventory tracking (SERVICE, provisional products)
 * - tracked: Product has inventory; quantity can be positive, zero, or negative
 *   (negative in relaxed mode when overselling is allowed)
 */
export type StockResult = 
  | { type: 'unlimited' }
  | { type: 'tracked'; quantity: number }

/**
 * Type guard: checks if stock result is unlimited
 */
export function isUnlimitedStock(result: StockResult): result is { type: 'unlimited' } {
  return result.type === 'unlimited'
}

/**
 * Type guard: checks if stock result is tracked
 */
export function isTrackedStock(result: StockResult): result is { type: 'tracked'; quantity: number } {
  return result.type === 'tracked'
}

/**
 * Helper: converts StockResult to a display-friendly number
 * Returns Infinity for unlimited, or the quantity for tracked stock
 */
export function stockResultToNumber(result: StockResult): number {
  return result.type === 'unlimited' ? Infinity : result.quantity
}

/**
 * Helper: checks if stock is available for a given quantity request
 * Takes inventory mode into account
 */
export function hasAvailableStock(
  result: StockResult, 
  requestedQty: number,
  inventoryMode: 'none' | 'relaxed' | 'strict'
): boolean {
  // No inventory mode: always available
  if (inventoryMode === 'none') return true
  
  // Unlimited stock: always available
  if (result.type === 'unlimited') return true
  
  // Relaxed mode: always allow (can go negative)
  if (inventoryMode === 'relaxed') return true
  
  // Strict mode: must have enough stock
  return result.quantity >= requestedQty
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

      // SERVICE type has no physical stock — skip reservation tracking entirely
      if (item.product.type === 'SERVICE') return

      if (!activeVariant.components) return

      activeVariant.components.forEach(comp => {
        const isRequired = !comp.isAddon || item.addons.some(c => c.id === comp.id)

        if (isRequired) {
          reserved[comp.materialId] = (reserved[comp.materialId] || 0) + comp.quantityUsed * item.quantity
        }
      })

      // If it's a direct sale (no components), track the variant ID —
      // but only when the variant actually has inventory to deplete
      if (activeVariant.components.length === 0) {
        const hasInventory = activeVariant.inventory && activeVariant.inventory.length > 0
        if (hasInventory) {
          reserved[activeVariant.id] = (reserved[activeVariant.id] || 0) + item.quantity
        }
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
   *
   * Returns StockResult indicating whether stock is tracked and the available quantity:
   *   - { type: 'unlimited' } when the product has no inventory to track:
   *     • ResourceType.SERVICE — services are unlimited by definition
   *     • No components AND no inventory records — provisional Quick Add products
   *       created before stock is entered; treat as unlimited until owner adds stock
   *   - { type: 'tracked', quantity: N } when inventory is tracked:
   *     • quantity can be positive, zero, or negative (in relaxed mode)
   *     • the caller is responsible for mode-specific enforcement
   */
  calculateRemainingYield: (
    product: posProduct,
    variant: posProduct['variants'][number],
    selectedComponentIds: string[],
    cartItems: posItem[],
    orderItems?: posItem[],
  ): StockResult => {
    // SERVICE type — no physical stock, always available
    if (product.type === 'SERVICE') {
      return { type: 'unlimited' }
    }

    // No components + no inventory records → provisional product, treat as unlimited
    const hasComponents = variant.components && variant.components.length > 0
    const hasInventory = variant.inventory && variant.inventory.length > 0
    if (!hasComponents && !hasInventory) {
      return { type: 'unlimited' }
    }

    const reserved = PosStockEngine.getReservedMap(cartItems, orderItems)
    const unitReqs = PosStockEngine.getUnitRequirements(variant, selectedComponentIds)

    const yields = Object.entries(unitReqs).map(([materialId, amountPerUnit]) => {
      const { stock } = PosStockEngine.findPhysicalStock(materialId, product)
      const availableTotal = stock - (reserved[materialId] || 0)

      // Return actual quantity without clamping — can be negative
      return Math.floor(availableTotal / amountPerUnit)
    })

    const quantity = yields.length > 0 ? Math.min(...yields) : 0
    return { type: 'tracked', quantity }
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
