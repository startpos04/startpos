import { and, eq, gte, lte, toArray, useLiveQuery } from '@tanstack/react-db'
import { orderCollection, orderItemCollection, productCollection, productVariantCollection, transactionCollection, userCollection } from '@/db/collections'
import dayjs from '@/lib/dayjs'

export const fetchTransactionReport = (from?: string | Date, to?: string | Date) => {
  const result = useLiveQuery(
    q =>
      q
        .from({ tx: transactionCollection })
        .where(({ tx }) =>
          and(...[from ? gte(tx.createdAt, dayjs(from).startOf('day').toDate()) : true, to ? lte(tx.createdAt, dayjs(to).endOf('day').toDate()) : true]),
        )
        .orderBy(({ tx }) => [tx.createdAt, 'desc'])
        .leftJoin({ cashier: userCollection }, ({ tx, cashier }) => eq(tx.cashierId, cashier.id))
        .leftJoin({ order: orderCollection }, ({ tx, order }) => eq(tx.orderId, order.id))
        .select(({ tx, cashier, order }) => ({
          ...tx,
          cashier,
          order,
          orderItems: toArray(
            q
              .from({ item: orderItemCollection })
              .where(({ item }) => eq(item.orderId, order.id))
              .leftJoin({ variant: productVariantCollection }, ({ item, variant }) => eq(item.variantId, variant.id))
              .leftJoin({ product: productCollection }, ({ variant, product }) => eq(variant.productId, product.id))
              .select(({ item, variant, product }) => ({
                ...item,
                variant: {
                  ...variant,
                  product,
                },
              })),
          ),
        })),
    [from, to],
  )

  return { ...result, data: result.data.filter(prod => prod.orderItems) }
}
export type FetchTransactionReportReturn = ReturnType<typeof fetchTransactionReport>
export type TransactionReport = NonNullable<FetchTransactionReportReturn['data']>[number]
