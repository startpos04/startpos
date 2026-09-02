/**
 * fetch-goods-receipts.ts
 *
 * E6: Live query for all GRNs linked to a specific purchase.
 * Used by the Receipts tab in the purchase detail sidebar.
 *
 * Returns GRNs with their line items joined to variant/product/unit data
 * for display purposes. Same join pattern as fetchPurchases.
 */

import {
  goodsReceiptCollection,
  goodsReceiptItemCollection,
  productCollection,
  productVariantCollection,
  unitCollection,
  userCollection,
} from '@platform/db/collections'
import { eq, toArray, useLiveQuery } from '@tanstack/react-db'

export const fetchGoodsReceipts = (purchaseId: string) => {
  const result = useLiveQuery(q =>
    q
      .from({ receipt: goodsReceiptCollection })
      .where(({ receipt }) => eq(receipt.purchaseId, purchaseId))
      .leftJoin({ receiver: userCollection }, ({ receipt, receiver }) => eq(receipt.receivedById, receiver.id))
      .orderBy(({ receipt }) => receipt.createdAt, 'desc')
      .select(({ receipt, receiver }) => ({
        ...receipt,
        receiver,
        items: toArray(
          q
            .from({ item: goodsReceiptItemCollection })
            .where(({ item }) => eq(item.receiptId, receipt.id))
            .leftJoin({ variant: productVariantCollection }, ({ item, variant }) => eq(item.variantId, variant.id))
            .leftJoin({ product: productCollection }, ({ variant, product }) => eq(product.id, variant.productId))
            .leftJoin({ unit: unitCollection }, ({ item, unit }) => eq(item.unitId, unit.id))
            .select(({ item, variant, product, unit }) => ({ ...item, variant, product, unit })),
        ),
      })),
  )
  return result
}

// Derived types for UI consumption
type GoodsReceiptData = ReturnType<typeof fetchGoodsReceipts>['data']
export type feGoodsReceipt = NonNullable<GoodsReceiptData>[number]
export type feGoodsReceiptItem = feGoodsReceipt['items'][number]
