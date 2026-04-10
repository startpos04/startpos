import { useQuery } from '@tanstack/react-query'
import { posProductProps } from '../conversion/inventory-engine'
import { crudAPI } from '../prisma-client/crud-api'

export const fetchPosProducts = (searchQuery: string | undefined) =>
  useQuery({
    queryKey: ['pos-products', searchQuery],
    queryFn: async () => {
      const result = await crudAPI.product('findMany', {
        where: {
          isAvailable: true,
          variants: {
            every: {
              price: { gt: 0 },
            },
          },
          ...(searchQuery && {
            OR: [{ name: { contains: searchQuery, mode: 'insensitive' } }, { variants: { some: { sku: { contains: searchQuery, mode: 'insensitive' } } } }],
          }),
        },
        include: posProductProps,
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
