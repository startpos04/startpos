import { productCollection, productVariantCollection } from '@platform/db/collections'
import { eq, useLiveQuery } from '@tanstack/react-db'

export const fetchVariantOptions = () => {
  const result = useLiveQuery(q =>
    q
      .from({ variant: productVariantCollection })
      .leftJoin({ product: productCollection }, ({ variant, product }) => eq(product.id, variant.productId))
      .select(({ variant, product }) => ({ ...variant, product })),
  )
  return {
    ...result,
    data: result.data?.map(item => ({
      label: `${item.product?.name ?? 'â€”'} â€” ${item.name ?? 'Default'} (${item.sku ?? ''})`,
      value: item.id,
      data: item,
    })),
  }
}
