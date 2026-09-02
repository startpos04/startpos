import { uuid } from '@tanstack/react-form'
import _ from 'lodash'
import type { posItem } from './conversion/pos-stock-engine'
import { PosStockEngine } from './conversion/pos-stock-engine'
import type { posProduct } from './queries/fetch-pos-products'

export interface BarcodeHandlerResult {
  /**
   * Type of action to take
   * - 'auto-add': Product was added automatically to cart
   * - 'show-dialog': Product requires user selection (multiple variants or addons)
   * - 'not-found': No product found with the scanned barcode
   * - 'out-of-stock': Product found but has no stock available
   */
  action: 'auto-add' | 'show-dialog' | 'not-found' | 'out-of-stock'

  /**
   * The product that was found (if any)
   */
  product?: posProduct

  /**
   * The cart item that was created (for auto-add)
   */
  item?: posItem

  /**
   * Error or informational message
   */
  message?: string
}

export interface BarcodeHandlerOptions {
  /**
   * The scanned barcode value
   */
  barcode: string

  /**
   * All available products
   */
  products: posProduct[]

  /**
   * Current items in cart (for stock calculation)
   */
  cartItems: posItem[]

  /**
   * Current items in pending orders (for stock calculation)
   */
  orderItems: posItem[]

  /**
   * Default quantity to add when auto-adding
   * @default 1
   */
  quantity?: number
}

/**
 * Handles barcode scan logic for POS
 *
 * This function implements smart product detection:
 * - Simple products (1 variant, no addons, in stock): Auto-add to cart
 * - Complex products (multiple variants or has addons): Show dialog for selection
 * - Out of stock products: Return error
 * - Not found: Return not-found status
 *
 * @example
 * ```tsx
 * const result = handleBarcodeScan({
 *   barcode: 'SKU-001',
 *   products: allProducts,
 *   cartItems: currentCart,
 *   orderItems: pendingOrders,
 *   quantity: 1
 * })
 *
 * if (result.action === 'auto-add') {
 *   addToCart(result.item)
 * } else if (result.action === 'show-dialog') {
 *   openProductDialog(result.product)
 * }
 * ```
 */
export function handleBarcodeScan(options: BarcodeHandlerOptions): BarcodeHandlerResult {
  const { barcode, products, cartItems, orderItems, quantity = 1 } = options

  // Find product and the specific variant by exact SKU match (case-insensitive)
  const match = findProductAndVariantBySku(barcode, products)

  if (!match) {
    return {
      action: 'not-found',
      message: `No product found with SKU: ${barcode}`,
    }
  }

  const { product: matchedProduct, variant: matchedVariant } = match

  // Check if the matched variant has addons
  const hasAddons = matchedVariant.components?.some(comp => comp.isAddon) ?? false

  // Calculate remaining stock for the specific variant
  const remainingYield = PosStockEngine.calculateRemainingYield(matchedProduct, matchedVariant, [], cartItems, orderItems)

  // Check if out of stock
  if (remainingYield < quantity) {
    return {
      action: 'out-of-stock',
      product: matchedProduct,
      message: `${matchedProduct.name} (${matchedVariant.name || 'Default'}) is out of stock${remainingYield > 0 ? ` (only ${remainingYield} available)` : ''}`,
    }
  }

  // If the variant has addons, require user interaction to select them
  if (hasAddons) {
    return {
      action: 'show-dialog',
      product: matchedProduct,
      message: `${matchedProduct.name} has customization options`,
    }
  }

  // Simple variant with stock - auto-add
  const item: posItem = {
    cartId: uuid(),
    product: matchedProduct,
    variant: matchedVariant,
    quantity,
    addons: [], // No addons for this variant
  }

  return {
    action: 'auto-add',
    product: matchedProduct,
    item,
    message: `Added ${quantity}x ${matchedProduct.name}${matchedVariant.name ? ` (${matchedVariant.name})` : ''} to cart`,
  }
}

/**
 * Find a product and its matching variant by SKU (exact match, case-insensitive)
 * Returns both the product and the specific variant that matches the SKU
 */
function findProductAndVariantBySku(sku: string, products: posProduct[]): { product: posProduct; variant: posProduct['variants'][0] } | undefined {
  const normalizedSku = sku.trim().toLowerCase()

  for (const product of products) {
    // Find the variant with matching SKU
    const matchedVariant = product.variants.find(variant => {
      const variantSku = variant.sku?.trim().toLowerCase()
      return variantSku === normalizedSku
    })

    if (matchedVariant) {
      return { product, variant: matchedVariant }
    }
  }

  return undefined
}

/**
 * Merge a new item into existing cart items
 * If an identical item exists (same product, variant, addons), increase quantity
 * Otherwise add as new item
 */
export function mergeCartItem(existingItems: posItem[], newItem: posItem): posItem[] {
  const existingItemIndex = existingItems.findIndex(item => {
    const isSameProduct = item.product.id === newItem.product.id
    const isSameVariant = item.variant.id === newItem.variant.id
    const isSameAddons = _.isEqual(_.sortBy(item.addons, 'id'), _.sortBy(newItem.addons, 'id'))

    return isSameProduct && isSameVariant && isSameAddons
  })

  if (existingItemIndex !== -1) {
    // Update quantity of existing item
    const updatedItems = [...existingItems]
    updatedItems[existingItemIndex] = {
      ...updatedItems[existingItemIndex]!,
      quantity: updatedItems[existingItemIndex]!.quantity + newItem.quantity,
    }
    return updatedItems
  }

  // Add as new item
  return [...existingItems, newItem]
}
