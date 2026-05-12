import { eq, inArray, toArray, useLiveQuery } from '@tanstack/react-db'
import type { Prisma } from 'prisma/generated/prisma/browser'
import { orderCollection, orderItemAddonCollection, orderItemCollection, productCollection, productVariantCollection } from '@/db/collections'
import type { Prettify } from '../types'

export const activeOrderProps = {
  items: {
    include: {
      selectedAddons: { include: { addon: { include: { product: true } } } },
      variant: { include: { product: true } },
    },
  },
} satisfies Prisma.OrderInclude

export type ActiveOrder = Prettify<Prisma.OrderGetPayload<{ include: typeof activeOrderProps }>>

export const fetchActiveOrders = () => {
  const result = useLiveQuery(
    q =>
      q
        .from({ order: orderCollection })
        .where(({ order }) => inArray(order.status, ['PREPARING', 'PENDING']))
        .orderBy(({ order }) => order.orderNumber, 'desc')
        .select(({ order }) => ({
          ...order,
          items: toArray(
            q
              .from({ item: orderItemCollection })
              .where(({ item }) => eq(item.orderId, order.id))
              .leftJoin({ variant: productVariantCollection }, ({ variant, item }) => eq(item.variantId, variant.id))
              .leftJoin({ p: productCollection }, ({ p, variant }) => eq(p.id, variant.productId))
              .select(({ item, variant, p }) => ({
                ...item,
                variant: {
                  ...variant,
                  product: p,
                },
                selectedAddons: toArray(
                  q
                    .from({ sAddon: orderItemAddonCollection })
                    .where(({ sAddon }) => eq(sAddon.orderItemId, item.id))
                    .leftJoin({ a: productVariantCollection }, ({ a, sAddon }) => eq(a.id, sAddon.addonId))
                    .leftJoin({ ap: productCollection }, ({ ap, a }) => eq(ap.id, a.productId))
                    .select(({ sAddon, a, ap }) => ({
                      ...sAddon,
                      addon: {
                        ...a,
                        product: ap,
                      },
                    })),
                ),
              })),
          ),
        })),
    [],
  )

  return { ...result, data: result.data as unknown as ActiveOrder[] }
}
