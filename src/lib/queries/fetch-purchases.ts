import { eq, toArray, useLiveQuery } from '@tanstack/react-db'
import { productCollection, productVariantCollection, purchaseCollection, purchaseItemCollection, supplierCollection, unitCollection } from '@/db/collections'

export const fetchPurchases = () => {
  const result = useLiveQuery(q =>
    q
      .from({ purchase: purchaseCollection })
      .leftJoin({ supplier: supplierCollection }, ({ purchase, supplier }) => eq(purchase.supplierId, supplier.id))
      .orderBy(({ purchase }) => purchase.createdAt, 'desc')
      .select(({ purchase, supplier }) => ({
        ...purchase,
        supplier,
        items: toArray(
          q
            .from({ item: purchaseItemCollection })
            .where(({ item }) => eq(item.purchaseId, purchase.id))
            .leftJoin({ variant: productVariantCollection }, ({ item, variant }) => eq(item.variantId, variant.id))
            .leftJoin({ product: productCollection }, ({ variant, product }) => eq(product.id, variant.productId))
            .leftJoin({ unit: unitCollection }, ({ item, unit }) => eq(item.unitId, unit.id))
            .select(({ item, variant, product, unit }) => ({ ...item, variant, product, unit })),
        ),
      })),
  )
  return result
}

type PurchaseData = ReturnType<typeof fetchPurchases>['data']
export type fePurchase = NonNullable<PurchaseData>[number]
