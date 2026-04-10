import { useQuery } from '@tanstack/react-query'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchActiveOrders = () =>
  useQuery({
    queryKey: ['active-orders'],
    queryFn: async () => {
      const result = await crudAPI.order('findMany', {
        where: {
          status: { in: ['PREPARING', 'PENDING'] },
        },
        include: {
          items: {
            include: {
              selectedAddons: { include: { addon: { include: { product: true } } } },
              variant: { include: { product: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
