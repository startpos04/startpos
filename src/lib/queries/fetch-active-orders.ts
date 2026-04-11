import { useQuery } from '@tanstack/react-query'
import { Prisma } from 'prisma/generated/prisma/browser'
import { crudAPI } from '../prisma-client/crud-api'
import { Prettify } from '../types'

export const activeOrderProps = {
  items: {
    include: {
      selectedAddons: { include: { addon: { include: { product: true } } } },
      variant: { include: { product: true } },
    },
  },
} satisfies Prisma.OrderInclude

export type ActiveOrder = Prettify<Prisma.OrderGetPayload<{ include: typeof activeOrderProps }>>

export const fetchActiveOrders = () =>
  useQuery({
    queryKey: ['active-orders'],
    queryFn: async () => {
      const result = await crudAPI.order('findMany', {
        where: {
          status: { in: ['PREPARING', 'PENDING'] },
        },
        include: activeOrderProps,
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
