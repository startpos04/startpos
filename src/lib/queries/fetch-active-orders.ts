import { and, eq, gte, inArray, lte, useLiveQuery } from '@tanstack/react-db'
import { OrderStatus } from 'prisma/generated/prisma/enums'
import {
  orderCollection,
  orderItemAddonCollection,
  orderItemCollection,
  productCollection,
  productVariantCollection,
  transactionCollection,
} from '@startpos-core/db/collections'
import dayjs from '@startpos-core/lib/dayjs'

export const fetchActiveOrders = () => {
  // --- 1. FETCH BASE ORDERS ONLY (No Joins) ---
  const baseOrdersResult = useLiveQuery(
    q =>
      q
        .from({ order: orderCollection })
        .where(({ order }) => inArray(order.status, [OrderStatus.PENDING, OrderStatus.PREPARING]))
        .orderBy(({ order }) => order.orderNumber, 'desc')
        .select(({ order }) => order),
    [],
  )

  // --- 1b. FLAT FETCH TODAY'S TRANSACTIONS ---
  const transactionsResult = useLiveQuery(
    q =>
      q
        .from({ transaction: transactionCollection })
        .where(({ transaction }) => and(gte(transaction.createdAt, dayjs().startOf('day').toDate()), lte(transaction.createdAt, dayjs().endOf('day').toDate())))
        .select(({ transaction }) => transaction),
    [],
  )

  // We combine the order IDs from the active statuses AND any orders that have a transaction today
  const activeOrderIds = baseOrdersResult.data?.map(o => o.id) || []
  const transactionOrderIds = transactionsResult.data?.map(t => t.orderId) || []

  // Combine and deduplicate IDs for downstream item/addon fetching
  const orderIds = Array.from(new Set([...activeOrderIds, ...transactionOrderIds]))

  // --- 2. FLAT FETCH ITEMS FOR CURRENT ORDERS ---
  const itemsResult = useLiveQuery(
    q =>
      q
        .from({ item: orderItemCollection })
        .where(({ item }) => inArray(item.orderId, orderIds))
        .leftJoin({ variant: productVariantCollection }, ({ variant, item }) => eq(item.variantId, variant.id))
        .leftJoin({ p: productCollection }, ({ p, variant }) => eq(p.id, variant.productId))
        .select(({ item, variant, p }) => ({
          ...item,
          variant: {
            ...variant,
            product: p,
          },
        })),
    [orderIds.join(',')], // Re-run only if the filtered order set changes
  )

  const itemIds = itemsResult.data?.map(i => i.id) || []

  // --- 3. FLAT FETCH ADDONS FOR CURRENT ITEMS ---
  const addonsResult = useLiveQuery(
    q =>
      q
        .from({ sAddon: orderItemAddonCollection })
        .where(({ sAddon }) => inArray(sAddon.orderItemId, itemIds))
        .leftJoin({ a: productVariantCollection }, ({ a, sAddon }) => eq(a.id, sAddon.addonId))
        .leftJoin({ ap: productCollection }, ({ ap, a }) => eq(ap.id, a.productId))
        .select(({ sAddon, a, ap }) => ({
          ...sAddon,
          addon: {
            ...a,
            product: ap,
          },
        })),
    [itemIds.join(',')], // Re-run only if item constraints change
  )

  // --- 4. OPTIMIZED MEMORY MAP MERGE WITHOUT CHANGING RETURN SHAPE ---
  // Create a quick lookup map for transactions
  const transactionMap = new Map((transactionsResult.data || []).map(t => [t.orderId, t]))

  const fullyMappedOrders = baseOrdersResult.data?.map(order => {
    // Find transaction for this order from our separate query map
    const transaction = transactionMap.get(order.id)

    // Filter and build items array inline for this specific order
    const orderItems = (itemsResult.data || [])
      .filter(item => item.orderId === order.id)
      .map(item => {
        // Filter and build addons array inline for this specific item
        const selectedAddons = (addonsResult.data || []).filter(addon => addon.orderItemId === item.id)

        return {
          ...item,
          selectedAddons,
        }
      })

    return {
      ...order,
      transaction, // Attached back here to maintain your exact return type
      items: orderItems,
    }
  })

  return {
    ...baseOrdersResult,
    data: fullyMappedOrders,
  }
}

type ActiveOrdersData = ReturnType<typeof fetchActiveOrders>['data']
export type ActiveOrder = NonNullable<ActiveOrdersData>[number]
