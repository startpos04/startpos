import { eq, useLiveQuery } from '@tanstack/react-db'
import { productCollection, productVariantCollection } from '@/db/collections'

export const fetchProductVariantOptions = () => {
  const result = useLiveQuery(q =>
    q
      .from({ productVariant: productVariantCollection })
      .leftJoin({ product: productCollection }, ({ productVariant, product }) => eq(productVariant.productId, product.id))
      .select(({ productVariant, product }) => ({ ...productVariant, product })),
  )
  return {
    ...result,
    data: result.data?.map(item => ({
      label: [item.product.name, item.name ? `(${item.name})` : ''].filter(Boolean).join(' '),
      value: item.id,
      data: item,
    })),
  }
}
